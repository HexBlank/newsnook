package com.aizeek.newsnook;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.Uri;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.net.InetSocketAddress;
import java.net.Proxy;
import okhttp3.Authenticator;
import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.Credentials;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.Route;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * 在短生命周期、无界面的 WebView 中观察网页自己产生的媒体拓扑。
 * 只收集 URL/类型信号，不代理响应、不注入凭证、不接管 DRM 授权。
 */
@CapacitorPlugin(name = "MediaSniffer")
public class MediaSnifferPlugin extends Plugin {

    private static final int MIN_TIMEOUT_MS = 1500;
    private static final int MAX_TIMEOUT_MS = 12000;
    private static final int MAX_NETWORK_EVENTS = 256;
    private static final long PLAYBACK_CONTEXT_TTL_MS = 10 * 60 * 1000L;
    private static final ConcurrentHashMap<String, PlaybackContext> PLAYBACK_CONTEXTS =
        new ConcurrentHashMap<>();
    private static final Set<String> SAFE_REQUEST_HEADERS = Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList(
            "accept", "accept-language", "origin", "range", "referer", "user-agent"
        ))
    );

    private static final String PROBE_SCRIPT = """
        (() => {
          if (window.__newsnookMediaProbeInstalled) return;
          window.__newsnookMediaProbeInstalled = true;
          const events = window.__newsnookMediaEvents = [];
          const seen = new Set();
          const inspectedPayloads = new WeakSet();
          const push = (event) => {
            try {
              const key = [event.source, event.url || '', event.mimeType || '', event.drmKeySystem || ''].join('|');
              if (seen.has(key) || events.length >= 256) return;
              seen.add(key);
              const observation = { pageUrl: location.href, timestamp: Date.now(), ...event };
              events.push(observation);
              if (window !== window.top) window.top.postMessage({ __newsnookMediaObservation: observation }, '*');
            } catch (_) {}
          };
          if (window === window.top) window.addEventListener('message', (message) => {
            const observation = message.data?.__newsnookMediaObservation;
            if (observation && typeof observation === 'object') push(observation);
          });
          const positiveNumber = (value) => {
            const number = Number(value);
            return Number.isFinite(number) && number > 0 ? number : undefined;
          };
          const inspectPayload = (value, depth = 0) => {
            if (!value || typeof value !== 'object' || depth > 12 || inspectedPayloads.has(value)) return;
            inspectedPayloads.add(value);
            if (Array.isArray(value)) {
              value.forEach((item) => inspectPayload(item, depth + 1));
              return;
            }
            try {
              const url = [value.url, value.contentUrl, value.playbackUrl, value.src]
                .find((item) => typeof item === 'string' && item);
              const mimeType = [value.mimeType, value.contentType, value.mime]
                .find((item) => typeof item === 'string');
              if (url) {
                const codecText = `${mimeType || ''} ${typeof value.codecs === 'string' ? value.codecs : ''}`;
                const width = positiveNumber(value.width);
                const height = positiveNumber(value.height);
                const hasVideo = Boolean(width || height || value.qualityLabel || /^video\\//i.test(mimeType || '') || /(?:avc1|av01|hvc1|hev1|vp0?9|vp8)/i.test(codecText));
                const hasAudio = Boolean(value.audioQuality || value.audioSampleRate || value.audioChannels || /^audio\\//i.test(mimeType || '') || /(?:mp4a|aac|opus|vorbis|ac-3|ec-3)/i.test(codecText));
                push({
                  source: 'static',
                  url,
                  mimeType,
                  mediaKind: /^audio\\//i.test(mimeType || '') ? 'audio' : hasVideo ? 'video' : undefined,
                  hasAudio: hasAudio ? true : hasVideo && value.qualityLabel ? false : undefined,
                  hasVideo: hasVideo || undefined,
                  width,
                  height,
                  bitrate: positiveNumber(value.bitrate),
                });
              }
            } catch (_) {}
            try { Object.values(value).forEach((item) => inspectPayload(item, depth + 1)); } catch (_) {}
          };
          const inspectPlayerState = () => {
            try { inspectPayload(window.ytInitialPlayerResponse); } catch (_) {}
            try {
              const playerResponse = window.ytplayer?.config?.args?.player_response;
              if (typeof playerResponse === 'string') inspectPayload(JSON.parse(playerResponse));
              else inspectPayload(playerResponse);
            } catch (_) {}
            try {
              document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"]').forEach((script) => {
                try { inspectPayload(JSON.parse(script.textContent || '')); } catch (_) {}
              });
            } catch (_) {}
          };
          const inspect = (node) => {
            if (!(node instanceof Element)) return;
            const nodes = node.matches('video,audio,source') ? [node] : node.querySelectorAll('video,audio,source');
            for (const media of nodes) {
              const url = media.currentSrc || media.src || media.getAttribute('data-src') || media.getAttribute('data-video-src');
              if (url) push({ source: 'dom', url, mimeType: media.getAttribute('type') || undefined, mediaKind: media.tagName === 'AUDIO' ? 'audio' : media.tagName === 'VIDEO' ? 'video' : undefined });
              if (media.srcObject) push({ source: 'mse', url: media.currentSrc || 'blob:', mseMimeType: 'srcObject' });
              if (media instanceof HTMLMediaElement) {
                try {
                  media.muted = true;
                  const playback = media.play();
                  if (playback?.catch) playback.catch(() => {});
                } catch (_) {}
              }
            }
          };
          const scan = () => {
            inspect(document.documentElement);
            inspectPlayerState();
            try {
              for (const entry of performance.getEntriesByType('resource')) {
                push({ source: 'performance', url: entry.name });
              }
            } catch (_) {}
          };
          const startDom = () => {
            scan();
            try {
              new MutationObserver((records) => records.forEach((record) => {
                inspect(record.target);
                record.addedNodes.forEach(inspect);
              })).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'data-src', 'data-video-src'] });
              document.addEventListener('play', (event) => inspect(event.target), true);
              document.addEventListener('loadedmetadata', (event) => inspect(event.target), true);
              document.addEventListener('encrypted', () => push({ source: 'mse', drmKeySystem: 'encrypted-media' }), true);
            } catch (_) {}
          };
          if (document.documentElement) startDom();
          else document.addEventListener('DOMContentLoaded', startDom, { once: true });

          try {
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
              const response = await originalFetch.apply(this, args);
              try { push({ source: 'fetch', url: response.url || String(args[0]), mimeType: response.headers.get('content-type') || undefined, statusCode: response.status }); } catch (_) {}
              return response;
            };
          } catch (_) {}
          try {
            const open = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
              this.__newsnookUrl = String(url);
              this.__newsnookMethod = method;
              this.addEventListener('loadend', () => {
                let mimeType;
                try { mimeType = this.getResponseHeader('content-type') || undefined; } catch (_) {}
                push({ source: 'xhr', url: this.responseURL || this.__newsnookUrl, method: this.__newsnookMethod, mimeType, statusCode: this.status });
              }, { once: true });
              return open.call(this, method, url, ...rest);
            };
          } catch (_) {}
          try {
            const addSourceBuffer = MediaSource.prototype.addSourceBuffer;
            MediaSource.prototype.addSourceBuffer = function(mimeType) {
              push({ source: 'mse', mseMimeType: String(mimeType) });
              return addSourceBuffer.call(this, mimeType);
            };
          } catch (_) {}
          try {
            const requestKeySystem = navigator.requestMediaKeySystemAccess?.bind(navigator);
            if (requestKeySystem) navigator.requestMediaKeySystemAccess = function(keySystem, configurations) {
              push({ source: 'mse', drmKeySystem: String(keySystem) });
              return requestKeySystem(keySystem, configurations);
            };
          } catch (_) {}
          try {
            new PerformanceObserver((list) => list.getEntries().forEach((entry) => push({ source: 'performance', url: entry.name }))).observe({ type: 'resource', buffered: true });
          } catch (_) {}
          window.__newsnookCollectMedia = () => { scan(); return events; };
        })();
        """;

    @PluginMethod
    public void sniff(PluginCall call) {
        String url = call.getString("url");
        if (!isAllowedPageUrl(url)) {
            call.reject("仅支持 HTTP/HTTPS 原文地址");
            return;
        }
        int requestedTimeout = call.getInt("timeoutMs", 6000);
        int timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, requestedTimeout));
        String referrer = call.getString("referrer");
        if (!isAllowedPageUrl(referrer)) referrer = null;
        String finalReferrer = referrer;
        getActivity().runOnUiThread(() -> startSniff(call, url, timeoutMs, finalReferrer));
    }

    @PluginMethod
    public void preparePlayback(PluginCall call) {
        String url = call.getString("url");
        if (!isAllowedPageUrl(url)) {
            call.reject("媒体地址无效");
            return;
        }
        String sourcePage = call.getString("sourcePage");
        if (sourcePage != null && !isAllowedPageUrl(sourcePage)) sourcePage = null;
        String format = call.getString("format", "progressive");
        boolean intercept = call.getBoolean("intercept", true);
        if (!intercept) {
            PLAYBACK_CONTEXTS.remove(url);
            purgePlaybackContexts();
            call.resolve();
            return;
        }
        JSObject headersObject = call.getObject("headers");
        Map<String, String> headers = new HashMap<>();
        if (headersObject != null) {
            Iterator<String> keys = headersObject.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = headersObject.getString(key);
                if (value != null && SAFE_REQUEST_HEADERS.contains(key.toLowerCase(Locale.ROOT))) {
                    headers.put(key, value);
                }
            }
        }
        if (sourcePage != null && !hasHeader(headers, "referer")) {
            headers.put("Referer", sourcePage);
        }
        PlaybackContext context = new PlaybackContext(
            url,
            format,
            headers,
            createPlaybackClient(call.getObject("proxy")),
            System.currentTimeMillis() + PLAYBACK_CONTEXT_TTL_MS
        );
        PLAYBACK_CONTEXTS.put(url, context);
        purgePlaybackContexts();
        call.resolve();
    }

    private static boolean hasHeader(Map<String, String> headers, String target) {
        for (String key : headers.keySet()) {
            if (target.equalsIgnoreCase(key)) return true;
        }
        return false;
    }

    private static OkHttpClient createPlaybackClient(JSObject proxyObject) {
        OkHttpClient.Builder builder = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .cookieJar(new WebViewCookieJar());
        if (proxyObject == null) return builder.build();

        String host = proxyObject.getString("host");
        int port = proxyObject.optInt("port", -1);
        if (host == null || host.isEmpty() || port <= 0) return builder.build();
        String type = proxyObject.getString("type", "http");
        Proxy.Type proxyType = "socks5".equalsIgnoreCase(type) ? Proxy.Type.SOCKS : Proxy.Type.HTTP;
        builder.proxy(new Proxy(proxyType, new InetSocketAddress(host, port)));

        String username = proxyObject.getString("username");
        String password = proxyObject.getString("password", "");
        if (username != null && !username.isEmpty()) {
            builder.proxyAuthenticator(new Authenticator() {
                @Override
                public Request authenticate(Route route, Response response) {
                    if (response.request().header("Proxy-Authorization") != null) return null;
                    return response.request().newBuilder()
                        .header("Proxy-Authorization", Credentials.basic(username, password))
                        .build();
                }
            });
        }
        return builder.build();
    }

    private static final class WebViewCookieJar implements CookieJar {
        @Override
        public void saveFromResponse(@NonNull HttpUrl url, @NonNull List<Cookie> cookies) {
            CookieManager manager = CookieManager.getInstance();
            for (Cookie cookie : cookies) manager.setCookie(url.toString(), cookie.toString());
        }

        @NonNull
        @Override
        public List<Cookie> loadForRequest(@NonNull HttpUrl url) {
            String header = CookieManager.getInstance().getCookie(url.toString());
            if (header == null || header.isEmpty()) return Collections.emptyList();
            List<Cookie> cookies = new ArrayList<>();
            for (String part : header.split(";")) {
                Cookie cookie = Cookie.parse(url, part.trim());
                if (cookie != null) cookies.add(cookie);
            }
            return cookies;
        }
    }

    static PlaybackContext findPlaybackContext(String url) {
        long now = System.currentTimeMillis();
        PlaybackContext exact = PLAYBACK_CONTEXTS.get(url);
        if (exact != null && exact.expiresAt >= now) return exact;
        Uri requested = Uri.parse(url);
        for (PlaybackContext context : PLAYBACK_CONTEXTS.values()) {
            if (context.expiresAt < now || !context.scoped) continue;
            if (context.host.equalsIgnoreCase(requested.getHost()) && requested.getPath() != null && requested.getPath().startsWith(context.pathPrefix)) {
                return context;
            }
        }
        return null;
    }

    private static void purgePlaybackContexts() {
        long now = System.currentTimeMillis();
        PLAYBACK_CONTEXTS.entrySet().removeIf(entry -> entry.getValue().expiresAt < now);
    }

    static final class PlaybackContext {
        final String originalUrl;
        final String host;
        final String pathPrefix;
        final boolean scoped;
        final Map<String, String> headers;
        final OkHttpClient client;
        final long expiresAt;

        PlaybackContext(String originalUrl, String format, Map<String, String> headers, OkHttpClient client, long expiresAt) {
            this.originalUrl = originalUrl;
            Uri uri = Uri.parse(originalUrl);
            this.host = uri.getHost() == null ? "" : uri.getHost();
            String path = uri.getPath() == null ? "/" : uri.getPath();
            int separator = path.lastIndexOf('/');
            this.pathPrefix = separator >= 0 ? path.substring(0, separator + 1) : "/";
            this.scoped = "dash".equalsIgnoreCase(format) || "hls".equalsIgnoreCase(format);
            this.headers = Collections.unmodifiableMap(new HashMap<>(headers));
            this.client = client;
            this.expiresAt = expiresAt;
        }
    }

    private static boolean isAllowedPageUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        return uri.getHost() != null && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme));
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void startSniff(PluginCall call, String initialUrl, int timeoutMs, String referrer) {
        FrameLayout root = getActivity().findViewById(android.R.id.content);
        if (root == null) {
            call.reject("无法创建页面观察器");
            return;
        }

        WebView webView = new WebView(getActivity());
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setAlpha(0.01f);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        JSONArray networkEvents = new JSONArray();
        AtomicReference<String> pageUrl = new AtomicReference<>(initialUrl);
        AtomicBoolean finished = new AtomicBoolean(false);
        ScriptHandler scriptHandler = installDocumentStartProbe(webView);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageUrl.set(url);
                if (scriptHandler == null) view.evaluateJavascript(PROBE_SCRIPT, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageUrl.set(url);
                view.evaluateJavascript(PROBE_SCRIPT, null);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                recordNetworkEvent(networkEvents, pageUrl.get(), request);
                return null;
            }
        });

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1, 1);
        root.addView(webView, params);
        Runnable complete = () -> finishSniff(call, webView, root, scriptHandler, networkEvents, pageUrl.get(), finished);
        webView.postDelayed(complete, timeoutMs);
        if (referrer == null) {
            webView.loadUrl(initialUrl);
        } else {
            Map<String, String> navigationHeaders = new HashMap<>();
            navigationHeaders.put("Referer", referrer);
            webView.loadUrl(initialUrl, navigationHeaders);
        }
    }

    private ScriptHandler installDocumentStartProbe(WebView webView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return null;
        return WebViewCompat.addDocumentStartJavaScript(webView, PROBE_SCRIPT, Collections.singleton("*"));
    }

    private static void recordNetworkEvent(JSONArray events, String pageUrl, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (!looksLikeMediaUrl(url)) return;
        synchronized (events) {
            if (events.length() >= MAX_NETWORK_EVENTS) return;
            JSONObject event = new JSONObject();
            try {
                event.put("url", url);
                event.put("pageUrl", pageUrl);
                event.put("source", "network");
                event.put("method", request.getMethod());
                event.put("timestamp", System.currentTimeMillis());
                String mimeType = inferredMimeType(url);
                if (mimeType != null) {
                    event.put("mimeType", mimeType);
                    if (mimeType.startsWith("audio/")) event.put("mediaKind", "audio");
                    else if (mimeType.startsWith("video/")) event.put("mediaKind", "video");
                }
                JSONObject headers = new JSONObject();
                for (Map.Entry<String, String> entry : request.getRequestHeaders().entrySet()) {
                    if (SAFE_REQUEST_HEADERS.contains(entry.getKey().toLowerCase(Locale.ROOT))) {
                        headers.put(entry.getKey(), entry.getValue());
                    }
                }
                if (headers.length() > 0) event.put("requestHeaders", headers);
                events.put(event);
            } catch (JSONException ignored) {
                // 单条异常不影响页面继续加载。
            }
        }
    }

    private static boolean looksLikeMediaUrl(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        return inferredMimeType(url) != null ||
            lower.matches(".*\\.(m3u8|mpd|mp4|m4v|m4s|cmfv|cmfa|ts|webm|mov|flv|mkv|m4a|aac|mp3|ogg|opus)([?#].*)?$");
    }

    private static String inferredMimeType(String value) {
        try {
            Uri uri = Uri.parse(value);
            for (String key : uri.getQueryParameterNames()) {
                String normalizedKey = key.toLowerCase(Locale.ROOT);
                String parameter = uri.getQueryParameter(key);
                if (parameter == null) continue;
                String normalized = parameter.trim().toLowerCase(Locale.ROOT);
                if (normalizedKey.matches("mime|mime-type|mimetype|content-type|content_type|type") &&
                    normalized.matches("(?:video|audio)/[a-z0-9.+-]+")) {
                    return normalized;
                }
                if (normalizedKey.matches("format|fmt|container|ext")) {
                    if (normalized.matches("m3u8|hls")) return "application/vnd.apple.mpegurl";
                    if (normalized.matches("mpd|dash")) return "application/dash+xml";
                    if (normalized.matches("mp4|m4v|webm|mov|flv|mkv")) return "video/" + normalized;
                    if (normalized.matches("m4a|aac|mp3|ogg|opus")) return "audio/" + normalized;
                }
            }
        } catch (RuntimeException ignored) {
            // Extension matching remains available for malformed URLs.
        }
        return null;
    }

    private void finishSniff(
        PluginCall call,
        WebView webView,
        FrameLayout root,
        ScriptHandler scriptHandler,
        JSONArray networkEvents,
        String pageUrl,
        AtomicBoolean finished
    ) {
        if (!finished.compareAndSet(false, true)) return;
        webView.evaluateJavascript(
            "window.__newsnookCollectMedia ? JSON.stringify(window.__newsnookCollectMedia()) : '[]'",
            value -> {
                JSONArray combined = copyEvents(networkEvents);
                appendEvaluatedEvents(combined, value);
                JSObject result = new JSObject();
                result.put("pageUrl", pageUrl);
                result.put("observations", combined);
                cleanup(webView, root, scriptHandler);
                call.resolve(result);
            }
        );
    }

    private static JSONArray copyEvents(JSONArray source) {
        synchronized (source) {
            try {
                return new JSONArray(source.toString());
            } catch (JSONException ignored) {
                return new JSONArray();
            }
        }
    }

    private static void appendEvaluatedEvents(JSONArray target, String evaluatedValue) {
        if (evaluatedValue == null || "null".equals(evaluatedValue)) return;
        try {
            Object decoded = new JSONTokener(evaluatedValue).nextValue();
            JSONArray events = decoded instanceof String
                ? new JSONArray((String) decoded)
                : (JSONArray) decoded;
            for (int index = 0; index < events.length(); index += 1) target.put(events.get(index));
        } catch (JSONException | ClassCastException ignored) {
            // 网络观察结果仍可用。
        }
    }

    private static void cleanup(WebView webView, ViewGroup root, ScriptHandler scriptHandler) {
        if (scriptHandler != null) scriptHandler.remove();
        webView.stopLoading();
        root.removeView(webView);
        webView.loadUrl("about:blank");
        webView.destroy();
    }
}
