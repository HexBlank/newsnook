package com.aizeek.newsnook;

import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;

final class ServiceWorkerSniffer {
    private static final Object LOCK = new Object();
    private static final CopyOnWriteArrayList<Session> SESSIONS = new CopyOnWriteArrayList<>();
    private static final ServiceWorkerClient PASSTHROUGH = new ServiceWorkerClient() {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            return null;
        }
    };
    private static final ServiceWorkerClient FANOUT = new ServiceWorkerClient() {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            for (Session session : SESSIONS) {
                MediaSnifferPlugin.recordNetworkEventForServiceWorker(
                    session.events,
                    session.pageUrl.get(),
                    request
                );
            }
            return null;
        }
    };

    private static final class Session {
        final JSONArray events;
        final AtomicReference<String> pageUrl;

        Session(JSONArray events, AtomicReference<String> pageUrl) {
            this.events = events;
            this.pageUrl = pageUrl;
        }
    }

    static void install(JSONArray events, AtomicReference<String> pageUrl) {
        try {
            ServiceWorkerController controller = ServiceWorkerController.getInstance();
            synchronized (LOCK) {
                SESSIONS.add(new Session(events, pageUrl));
                controller.setServiceWorkerClient(FANOUT);
            }
        } catch (RuntimeException ignored) {
            // 旧 WebView 无 SW 时嗅探仍走 WebViewClient。
        }
    }

    static void uninstall(JSONArray events) {
        try {
            ServiceWorkerController controller = ServiceWorkerController.getInstance();
            synchronized (LOCK) {
                SESSIONS.removeIf(session -> session.events == events);
                if (SESSIONS.isEmpty()) {
                    controller.setServiceWorkerClient(PASSTHROUGH);
                }
            }
        } catch (RuntimeException ignored) {
            // 恢复失败时保持当前 client，避免再 set null。
        }
    }
}
