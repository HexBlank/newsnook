package com.aizeek.newsnook;

import android.os.Bundle;
import android.view.View;
import android.view.ViewParent;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    /** 系统开屏一直挂到 WebView 提交首帧，避免撤出后露出默认白底 WebView */
    private volatile boolean webContentReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !webContentReady);

        TranslationPluginRegistrar.register(this);
        registerPlugin(DeviceMediaControlsPlugin.class);
        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageStarted(WebView webView) {
                    // 越早越好：WebView 默认底是白的，主题色还没画出来前先压住
                    webView.setBackgroundColor(0xFF0E0F12);
                }

                @Override
                public void onPageCommitVisible(WebView webView, String url) {
                    webView.setBackgroundColor(0xFF0E0F12);
                    webContentReady = true;
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

        WebView webView = getCapacitorWebView();
        if (webView != null) {
            webView.setBackgroundColor(0xFF0E0F12);
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
        wakeWebViewCompositor(webView);

        // Some devices attach the hardware surface a frame or two after onResume.
        // Multiple staggered kicks cover that window without reloading the page.
        webView.postDelayed(() -> wakeWebViewCompositor(webView), 60L);
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
            wakeWebViewCompositor(webView);
        }
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
