package com.aizeek.newsnook;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
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
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    /** 系统开屏一直挂到 WebView 提交首帧，避免撤出后露出默认白底 WebView */
    private volatile boolean webContentReady = false;
    private int nativeStatusBarDp = 0;
    private int nativeNavBarDp = 0;

    public class NativeThemeBridge {
        @JavascriptInterface
        public void setSystemTheme(String theme) {
            runOnUiThread(() -> applySystemTheme("light".equalsIgnoreCase(theme)));
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
    public void onResume() {
        super.onResume();

        WebView webView = getCapacitorWebView();
        if (webView == null) return;

        webView.setBackgroundColor(0xFF0E0F12);
        injectNativeInsets();
        wakeWebViewCompositor(webView);

        // Some devices attach the hardware surface a frame or two after onResume.
        // Multiple staggered kicks cover that window without reloading the page.
        webView.postDelayed(() -> {
            injectNativeInsets();
            wakeWebViewCompositor(webView);
        }, 60L);
        webView.postDelayed(() -> wakeWebViewCompositor(webView), 180L);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;

        // onResume may run before the WebView's surface is visible again. Repaint once
        // the activity actually owns the window so a touch is not needed to wake it.
        WebView webView = getCapacitorWebView();
        if (webView != null) {
            injectNativeInsets();
            wakeWebViewCompositor(webView);
        }
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

    private static void wakeWebViewCompositor(WebView webView) {
        if (!webView.isAttachedToWindow()) return;

        webView.requestLayout();
        webView.postInvalidateOnAnimation();

        ViewParent parent = webView.getParent();
        if (parent instanceof View) {
            ((View) parent).postInvalidateOnAnimation();
        }

        // Direct Chromium/Blink compositor kick to commit pending frame immediately
        webView.evaluateJavascript(
            "(function() {" +
            "  var root = document.documentElement;" +
            "  if (!root) return;" +
            "  root.style.transform = 'translateZ(0)';" +
            "  void root.offsetHeight;" +
            "  requestAnimationFrame(function() {" +
            "    root.style.transform = '';" +
            "    void root.offsetHeight;" +
            "    window.dispatchEvent(new Event('resize'));" +
            "  });" +
            "})();",
            null
        );
    }
}
