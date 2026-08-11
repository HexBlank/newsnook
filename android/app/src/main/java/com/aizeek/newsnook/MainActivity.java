package com.aizeek.newsnook;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewParent;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    /** 系统开屏一直挂到 WebView 提交首帧，避免撤出后露出默认白底 WebView */
    private volatile boolean webContentReady = false;
    private int nativeStatusBarDp = 0;
    private int nativeNavBarDp = 0;

    private final Handler compositorWakeHandler = new Handler(Looper.getMainLooper());

    /** Delayed soft wakes only: invalidate + JS, no synthetic touch (avoids aborting real gestures). */
    private final Runnable softCompositorWakeWithInsets = () -> {
        WebView webView = getCapacitorWebView();
        if (webView == null) return;
        injectNativeInsets();
        wakeWebViewCompositor(webView, false);
    };

    private final Runnable softCompositorWake = () -> {
        WebView webView = getCapacitorWebView();
        if (webView == null) return;
        wakeWebViewCompositor(webView, false);
    };

    public class NativeThemeBridge {
        @JavascriptInterface
        public void setSystemTheme(String theme) {
            runOnUiThread(() -> applySystemTheme("light".equalsIgnoreCase(theme)));
        }

        @JavascriptInterface
        public void setFullScreen(boolean fullScreen) {
            runOnUiThread(() -> applyFullScreen(fullScreen));
        }

        @JavascriptInterface
        public void setKeepScreenOn(boolean keepScreenOn) {
            runOnUiThread(() -> applyKeepScreenOn(keepScreenOn));
        }
    }

    private void applySystemTheme(boolean isLight) {
        Window window = getWindow();
        if (window == null) return;
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(isLight);
            controller.setAppearanceLightNavigationBars(isLight);
        }
    }

    private void applyFullScreen(boolean fullScreen) {
        Window window = getWindow();
        if (window == null) return;
        View decorView = window.getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
        if (controller == null) return;

        if (fullScreen) {
            controller.hide(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            // 勿在 enter 时 requestApplyInsets：Pixel 等机会在 insets 回传后把系统栏又显示出来
            decorView.post(() -> {
                controller.hide(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            });
            return;
        }

        // 退出沉浸态时复位 behavior，避免部分机型 show() 后仍被 transient 策略吃掉
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_DEFAULT);
        controller.show(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
        ViewCompat.requestApplyInsets(decorView);
    }

    private void applyKeepScreenOn(boolean keepScreenOn) {
        Window window = getWindow();
        if (window == null) return;
        if (keepScreenOn) {
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !webContentReady);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        TranslationPluginRegistrar.register(this);
        registerPlugin(DeviceMediaControlsPlugin.class);
        registerPlugin(VolumePageTurnPlugin.class);
        registerPlugin(ProxiedHttpPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageStarted(WebView webView) {
                    // 越早越好：WebView 默认底是白的，主题色还没画出来前先压住
                    webView.setBackgroundColor(0xFF0E0F12);
                    webView.addJavascriptInterface(new NativeThemeBridge(), "NewsNookNative");
                    injectNativeInsets();
                }

                @Override
                public void onPageCommitVisible(WebView webView, String url) {
                    webView.setBackgroundColor(0xFF0E0F12);
                    webContentReady = true;
                    injectNativeInsets();
                    webView.postOnAnimation(
                        () ->
                            webView.evaluateJavascript(
                                "window.__newsnookNativeVisible=true;" +
                                "window.dispatchEvent(new Event('newsnook:native-visible'));",
                                null
                            )
                    );
                }
            }
        );
        super.onCreate(savedInstanceState);

        View decorView = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
            updateNativeInsets(insets);
            return ViewCompat.onApplyWindowInsets(v, insets);
        });
        updateNativeInsets(null);

        WebView webView = getCapacitorWebView();
        if (webView != null) {
            webView.setBackgroundColor(0xFF0E0F12);
            webView.addJavascriptInterface(new NativeThemeBridge(), "NewsNookNative");
            injectNativeInsets();
        }

        // 极端情况下 commit 回调没来：超时也撤系统开屏，避免卡死
        getWindow().getDecorView().postDelayed(() -> webContentReady = true, 2500L);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (bridge != null) {
            PluginHandle handle = bridge.getPlugin("VolumePageTurn");
            if (handle != null) {
                Plugin plugin = handle.getInstance();
                if (plugin instanceof VolumePageTurnPlugin) {
                    if (((VolumePageTurnPlugin) plugin).handleKeyEvent(event)) {
                        return true;
                    }
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onResume() {
        super.onResume();

        WebView webView = getCapacitorWebView();
        if (webView == null) return;

        webView.setBackgroundColor(0xFF0E0F12);
        webView.resumeTimers();
        injectNativeInsets();
        scheduleCompositorWake(webView);
    }

    @Override
    public void onPause() {
        cancelScheduledCompositorWake();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        cancelScheduledCompositorWake();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;

        // onResume may run before the WebView's surface is visible again. One immediate
        // synthetic touch here; delayed soft kicks from scheduleCompositorWake cover lag.
        WebView webView = getCapacitorWebView();
        if (webView != null) {
            webView.resumeTimers();
            injectNativeInsets();
            wakeWebViewCompositor(webView, true);
        }
    }

    private void cancelScheduledCompositorWake() {
        compositorWakeHandler.removeCallbacks(softCompositorWakeWithInsets);
        compositorWakeHandler.removeCallbacks(softCompositorWake);
    }

    /**
     * Immediate kick uses synthetic touch; staggered soft kicks only invalidate/JS so a
     * delayed CANCEL cannot abort pull-to-refresh or swipe after the user starts interacting.
     */
    private void scheduleCompositorWake(WebView webView) {
        cancelScheduledCompositorWake();
        wakeWebViewCompositor(webView, true);
        compositorWakeHandler.postDelayed(softCompositorWakeWithInsets, 60L);
        compositorWakeHandler.postDelayed(softCompositorWake, 180L);
        compositorWakeHandler.postDelayed(softCompositorWake, 500L);
        compositorWakeHandler.postDelayed(softCompositorWake, 1000L);
    }

    private void updateNativeInsets(WindowInsetsCompat windowInsets) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0) density = 1.0f;

        int statusBarPx = 0;
        int navBarPx = 0;

        if (windowInsets != null) {
            Insets statusInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()
            );
            statusBarPx = statusInsets.top;
            Insets navInsets = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            navBarPx = navInsets.bottom;
        }

        if (statusBarPx <= 0) {
            int resourceId = getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (resourceId > 0) {
                statusBarPx = getResources().getDimensionPixelSize(resourceId);
            }
        }

        if (statusBarPx > 0) {
            nativeStatusBarDp = (int) Math.ceil(statusBarPx / density);
        }
        if (navBarPx > 0) {
            nativeNavBarDp = (int) Math.ceil(navBarPx / density);
        }

        injectNativeInsets();
    }

    private void injectNativeInsets() {
        WebView webView = getCapacitorWebView();
        if (webView == null || nativeStatusBarDp <= 0) return;

        final String js = String.format(
            Locale.US,
            "(function() {" +
            "  var r = document.documentElement;" +
            "  if (r) {" +
            "    r.style.setProperty('--sat-native', '%dpx');" +
            "    r.style.setProperty('--sab-native', '%dpx');" +
            "  }" +
            "})();",
            nativeStatusBarDp,
            nativeNavBarDp
        );

        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private WebView getCapacitorWebView() {
        return bridge == null ? null : bridge.getWebView();
    }

    private static void wakeWebViewCompositor(WebView webView, boolean syntheticTouch) {
        if (!webView.isAttachedToWindow()) return;

        webView.resumeTimers();
        webView.requestLayout();
        webView.postInvalidateOnAnimation();

        ViewParent parent = webView.getParent();
        if (parent instanceof View) {
            ((View) parent).postInvalidateOnAnimation();
        }

        // Only on the immediate resume/focus path. Delayed CANCEL would abort real gestures.
        if (syntheticTouch) {
            dispatchSyntheticTouchCancel(webView);
        }

        // Attribute + reflow + resize: wake JS layout listeners without translateZ layers.
        webView.evaluateJavascript(
            "(function() {" +
            "  var root = document.documentElement;" +
            "  if (!root) return;" +
            "  root.setAttribute('data-wake', String(Date.now()));" +
            "  void root.offsetHeight;" +
            "  window.dispatchEvent(new Event('resize'));" +
            "})();",
            null
        );
    }

    private static void dispatchSyntheticTouchCancel(WebView webView) {
        MotionEvent down = null;
        MotionEvent cancel = null;
        try {
            long now = SystemClock.uptimeMillis();
            float x = 1f;
            float y = 1f;
            down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
            cancel = MotionEvent.obtain(now, now + 1, MotionEvent.ACTION_CANCEL, x, y, 0);
            webView.dispatchTouchEvent(down);
            webView.dispatchTouchEvent(cancel);
        } catch (Throwable ignored) {
            // Window may already be detached between schedule and run.
        } finally {
            if (down != null) down.recycle();
            if (cancel != null) cancel.recycle();
        }
    }
}
