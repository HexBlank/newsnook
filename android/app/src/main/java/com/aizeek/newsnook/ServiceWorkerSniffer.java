package com.aizeek.newsnook;

import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicLong;
import java.util.Map;
import java.util.Collections;
import org.json.JSONArray;

final class ServiceWorkerSniffer {
    interface ObservationListener {
        void onObservation(org.json.JSONObject observation);
    }

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
                if (!session.belongsTo(request)) continue;
                org.json.JSONObject observation = MediaSnifferPlugin.recordNetworkEventForServiceWorker(
                    session.events,
                    session.pageUrl.get(),
                    request,
                    session.lastHighValueAt
                );
                if (observation != null && session.listener != null) {
                    session.listener.onObservation(observation);
                }
            }
            return null;
        }
    };

    private static final class Session {
        final JSONArray events;
        final AtomicReference<String> pageUrl;
        final AtomicLong lastHighValueAt;
        final ObservationListener listener;

        Session(
            JSONArray events,
            AtomicReference<String> pageUrl,
            AtomicLong lastHighValueAt,
            ObservationListener listener
        ) {
            this.events = events;
            this.pageUrl = pageUrl;
            this.lastHighValueAt = lastHighValueAt;
            this.listener = listener;
        }

        boolean belongsTo(WebResourceRequest request) {
            String requestUrl = request.getUrl().toString();
            String requestOrigin = OriginHeaderStore.originOf(requestUrl);
            String currentOrigin = OriginHeaderStore.originOf(pageUrl.get());
            if (currentOrigin != null && currentOrigin.equals(requestOrigin)) return true;
            Map<String, String> headers = request.getRequestHeaders() == null
                ? Collections.emptyMap() : request.getRequestHeaders();
            String referer = headers.get("Referer");
            if (referer == null) referer = headers.get("referer");
            String refererOrigin = OriginHeaderStore.originOf(referer);
            if (currentOrigin != null && currentOrigin.equals(refererOrigin)) return true;

            // Chromium/WebView may omit Referer on a Service Worker request.
            // For YouTube embeds the actual media host is googlevideo.com, so
            // use the page-origin allowlist as the fallback rather than losing
            // every cross-origin media request.
            return isKnownMediaCdn(requestUrl) && isYoutubeOrigin(currentOrigin);
        }

        private static boolean isYoutubeOrigin(String origin) {
            try {
                String host = android.net.Uri.parse(origin).getHost();
                if (host == null) return false;
                host = host.toLowerCase(java.util.Locale.ROOT);
                return host.equals("youtube.com") || host.endsWith(".youtube.com")
                    || host.equals("youtube-nocookie.com") || host.endsWith(".youtube-nocookie.com");
            } catch (RuntimeException ignored) {
                return false;
            }
        }

        private static boolean isKnownMediaCdn(String value) {
            try {
                UriParts parts = UriParts.parse(value);
                String host = parts.host;
                return host.endsWith(".googlevideo.com")
                    || host.equals("googlevideo.com")
                    || parts.query.contains("mime=video%2fmp4")
                    || parts.query.contains("mime=audio%2fmp4")
                    || parts.path.matches(".*\\.(m3u8|mpd|mp4|m4s|webm|ts)$");
            } catch (RuntimeException ignored) {
                return false;
            }
        }

        private static final class UriParts {
            final String host;
            final String path;
            final String query;

            private UriParts(String host, String path, String query) {
                this.host = host.toLowerCase(java.util.Locale.ROOT);
                this.path = path.toLowerCase(java.util.Locale.ROOT);
                this.query = query.toLowerCase(java.util.Locale.ROOT);
            }

            static UriParts parse(String value) {
                android.net.Uri uri = android.net.Uri.parse(value);
                return new UriParts(uri.getHost() == null ? "" : uri.getHost(),
                    uri.getPath() == null ? "" : uri.getPath(),
                    uri.getEncodedQuery() == null ? "" : uri.getEncodedQuery());
            }
        }
    }

    static void install(
        JSONArray events,
        AtomicReference<String> pageUrl,
        AtomicLong lastHighValueAt,
        ObservationListener listener
    ) {
        try {
            ServiceWorkerController controller = ServiceWorkerController.getInstance();
            synchronized (LOCK) {
                SESSIONS.add(new Session(events, pageUrl, lastHighValueAt, listener));
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
