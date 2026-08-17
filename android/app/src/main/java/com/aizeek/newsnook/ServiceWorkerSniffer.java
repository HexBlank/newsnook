package com.aizeek.newsnook;

import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;

final class ServiceWorkerSniffer {
    private static final Object LOCK = new Object();
    private static final ServiceWorkerClient PASSTHROUGH = new ServiceWorkerClient() {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            return null;
        }
    };

    private static int installCount;

    static void install(JSONArray events, AtomicReference<String> pageUrl) {
        try {
            ServiceWorkerController controller = ServiceWorkerController.getInstance();
            synchronized (LOCK) {
                controller.setServiceWorkerClient(new ServiceWorkerClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                        MediaSnifferPlugin.recordNetworkEventForServiceWorker(
                            events,
                            pageUrl.get(),
                            request
                        );
                        return null;
                    }
                });
                installCount += 1;
            }
        } catch (RuntimeException ignored) {
            // 旧 WebView 无 SW 时嗅探仍走 WebViewClient。
        }
    }

    static void uninstall() {
        try {
            ServiceWorkerController controller = ServiceWorkerController.getInstance();
            synchronized (LOCK) {
                if (installCount > 0) installCount -= 1;
                if (installCount > 0) return;
                controller.setServiceWorkerClient(PASSTHROUGH);
            }
        } catch (RuntimeException ignored) {
            // 恢复失败时保持当前 client，避免再 set null。
        }
    }
}
