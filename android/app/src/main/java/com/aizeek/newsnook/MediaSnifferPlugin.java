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
import com.getcapacitor.JSArray;
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
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Proxy;
import okhttp3.Authenticator;
import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.Credentials;
import okhttp3.HttpUrl;
import okhttp3.Interceptor;
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
    private static final int QUIET_MS = 800;
    private static final int POLL_INTERVAL_MS = 200;
    private static final int MAX_NETWORK_EVENTS = 256;
    private static final int MAX_BODY_TEXT_BYTES = 262144;
    private static final long PLAYBACK_CONTEXT_TTL_MS = 10 * 60 * 1000L;
    private static final ConcurrentHashMap<String, PlaybackContext> PLAYBACK_CONTEXTS =
        new ConcurrentHashMap<>();
    private static final Set<String> SAFE_REQUEST_HEADERS = Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList(
            "accept", "accept-language", "origin", "referer", "user-agent"
        ))
    );

    private static final String PROBE_SCRIPT_TEMPLATE = """
        (() => {
          if (window.__newsnookMediaProbeInstalled) return;
          window.__newsnookMediaProbeInstalled = true;
          const nonce = '__NEWSNOOK_SESSION_NONCE__';
          const maxBodyText = __NEWSNOOK_MAX_BODY_TEXT__;
          if (window.__newsnookLastHighValueAt == null) window.__newsnookLastHighValueAt = 0;
          const events = window.__newsnookMediaEvents = [];
          const seen = new Set();
          const inspectedPayloads = new WeakSet();
          const isHighValue = (event) => {
            if (!event || event.source === 'performance') return false;
            const mime = String(event.mimeType || event.mseMimeType || '').toLowerCase();
            if (/^(video|audio)\\//.test(mime)) return true;
            if (mime.includes('mpegurl') || mime.includes('dash+xml') || mime.includes('vnd.apple.mpegurl')) return true;
            if (event.source === 'mse' && event.mseMimeType) return true;
            if (event.source === 'dom' && event.url) return true;
            if ((event.source === 'fetch' || event.source === 'xhr') && event.bodyText) return true;
            return false;
          };
          const push = (event) => {
            try {
              const key = [event.source, event.url || '', event.mimeType || '', event.drmKeySystem || '', event.bodyText ? 'body' : ''].join('|');
              if (seen.has(key) || events.length >= 256) return;
              seen.add(key);
              const observation = { pageUrl: location.href, timestamp: Date.now(), sessionNonce: nonce, ...event };
              events.push(observation);
              if (isHighValue(observation)) window.__newsnookLastHighValueAt = Date.now();
              if (window !== window.top) window.top.postMessage({ __newsnookMediaObservation: observation, nonce }, '*');
              return observation;
            } catch (_) { return undefined; }
          };
          if (window === window.top) window.addEventListener('message', (message) => {
            try {
              if (!message.data || message.data.nonce !== nonce) return;
              const observation = message.data.__newsnookMediaObservation;
              if (observation && typeof observation === 'object') push({ ...observation, fromIframe: true });
            } catch (_) {}
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
              const url = [value.url, value.contentUrl, value.playbackUrl, value.src, value.baseUrl, value.base_url, value.playurl, value.play_url, value.backupUrl, value.backup_url, value.manifestUrl]
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
                  codecs: typeof value.codecs === 'string' ? value.codecs : undefined,
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
            try { inspectPayload(window.__playinfo__); } catch (_) {}
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
              try {
                const mimeType = response.headers.get('content-type') || undefined;
                const event = { source: 'fetch', url: response.url || String(args[0]), mimeType, statusCode: response.status };
                const mime = String(mimeType || '').toLowerCase();
                if (/json|text\\/plain|javascript/.test(mime)) {
                  const lengthHeader = response.headers.get('content-length');
                  const reported = lengthHeader == null || lengthHeader === '' ? NaN : Number(lengthHeader);
                  if (!Number.isFinite(reported) || reported <= maxBodyText) {
                    try {
                      const text = await response.clone().text();
                      if (text && text.length <= maxBodyText) event.bodyText = text;
                    } catch (_) {}
                  }
                }
                push(event);
              } catch (_) {}
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
                const event = { source: 'xhr', url: this.responseURL || this.__newsnookUrl, method: this.__newsnookMethod, mimeType, statusCode: this.status };
                try {
                  const responseType = this.responseType;
                  if (!responseType || responseType === 'text' || responseType === 'json') {
                    let text;
                    if (responseType === 'json') {
                      text = typeof this.response === 'string' ? this.response : JSON.stringify(this.response);
                    } else {
                      text = this.responseText;
                    }
                    if (typeof text === 'string' && text.length > 0 && text.length <= maxBodyText) event.bodyText = text;
                  }
                } catch (_) {}
                push(event);
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

    private static String buildProbeScript(String nonce) {
        return PROBE_SCRIPT_TEMPLATE
            .replace("__NEWSNOOK_SESSION_NONCE__", nonce)
            .replace("__NEWSNOOK_MAX_BODY_TEXT__", Integer.toString(MAX_BODY_TEXT_BYTES));
    }

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
        String sourcePage = call.getString("sourcePage");
        if (sourcePage != null && !isAllowedPageUrl(sourcePage)) sourcePage = null;
        boolean opaque = isOpaquePlaybackUrl(url);
        if (opaque) {
            if (sourcePage == null) {
                call.reject("媒体地址无效");
                return;
            }
        } else if (!isAllowedPageUrl(url)) {
            call.reject("媒体地址无效");
            return;
        }
        String format = call.getString("format", "progressive");
        boolean intercept = call.getBoolean("intercept", true);
        JSObject headersObject = call.getObject("headers");
        Map<String, String> jsHeaders = new HashMap<>();
        if (headersObject != null) {
            Iterator<String> keys = headersObject.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = headersObject.getString(key);
                if (value != null && SAFE_REQUEST_HEADERS.contains(key.toLowerCase(Locale.ROOT))) {
                    jsHeaders.put(key, value);
                }
            }
        }
        OkHttpClient client = intercept ? createPlaybackClient(call.getObject("proxy")) : null;
        if (!opaque) {
            registerPlaybackContext(url, format, intercept, false, jsHeaders, sourcePage, client);
        }
        if (intercept) {
            Set<String> seeds = new HashSet<>();
            JSArray origins = call.getArray("origins");
            if (origins != null) {
                for (int index = 0; index < origins.length(); index += 1) {
                    String origin = origins.optString(index, "");
                    if (origin != null && !origin.isEmpty()) seeds.add(origin);
                }
            }
            seeds.addAll(OriginHeaderStore.notedOrigins());
            for (String origin : seeds) {
                if (origin == null || origin.isEmpty()) continue;
                String seed = origin.endsWith("/") ? origin : origin + "/";
                if (!isAllowedPageUrl(seed)) continue;
                registerPlaybackContext(seed, format, true, true, jsHeaders, sourcePage, client);
            }
        }
        call.resolve();
    }

    static void clearPlaybackContexts() {
        PLAYBACK_CONTEXTS.clear();
    }

    static void registerPlaybackContext(
        String url,
        String format,
        boolean intercept,
        boolean extraOrigin,
        Map<String, String> jsHeaders,
        String sourcePage,
        OkHttpClient client
    ) {
        String origin = OriginHeaderStore.originOf(url);
        if (!intercept) {
            if (origin != null) PLAYBACK_CONTEXTS.remove(origin);
            purgePlaybackContexts();
            return;
        }
        if (origin == null) return;
        Map<String, String> headers = jsHeaders == null ? Collections.emptyMap() : jsHeaders;
        OkHttpClient playbackClient = client == null ? new OkHttpClient() : client;
        long expiresAt = System.currentTimeMillis() + PLAYBACK_CONTEXT_TTL_MS;
        PLAYBACK_CONTEXTS.put(origin, new PlaybackContext(
            url,
            format,
            extraOrigin,
            headers,
            sourcePage,
            playbackClient,
            expiresAt
        ));
        purgePlaybackContexts();
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
        purgePlaybackContexts();
        String origin = OriginHeaderStore.originOf(url);
        if (origin == null) return null;
        PlaybackContext context = PLAYBACK_CONTEXTS.get(origin);
        long now = System.currentTimeMillis();
        if (context == null || context.expiresAt < now) return null;
        if (!context.scoped && !url.equals(context.originalUrl)) return null;
        return context.forRequest(url);
    }

    private static void purgePlaybackContexts() {
        long now = System.currentTimeMillis();
        PLAYBACK_CONTEXTS.entrySet().removeIf(entry -> entry.getValue().expiresAt < now);
    }

    static final class PlaybackContext {
        final String originalUrl;
        final String origin;
        final boolean scoped;
        final Map<String, String> headers;
        final Map<String, String> jsHeaders;
        final String sourcePage;
        final OkHttpClient client;
        final long expiresAt;

        PlaybackContext(
            String originalUrl,
            String format,
            boolean extraOrigin,
            Map<String, String> jsHeaders,
            String sourcePage,
            OkHttpClient client,
            long expiresAt
        ) {
            this.originalUrl = originalUrl;
            String origin = OriginHeaderStore.originOf(originalUrl);
            this.origin = origin == null ? "" : origin;
            this.scoped = extraOrigin || "dash".equalsIgnoreCase(format) || "hls".equalsIgnoreCase(format);
            this.jsHeaders = Collections.unmodifiableMap(new HashMap<>(jsHeaders));
            this.sourcePage = sourcePage;
            this.headers = Collections.unmodifiableMap(mergePlaybackHeaders(originalUrl, sourcePage, jsHeaders));
            this.client = client;
            this.expiresAt = expiresAt;
        }

        private PlaybackContext(PlaybackContext source, Map<String, String> headers) {
            this.originalUrl = source.originalUrl;
            this.origin = source.origin;
            this.scoped = source.scoped;
            this.headers = Collections.unmodifiableMap(new HashMap<>(headers));
            this.jsHeaders = source.jsHeaders;
            this.sourcePage = source.sourcePage;
            this.client = source.client;
            this.expiresAt = source.expiresAt;
        }

        PlaybackContext forRequest(String requestUrl) {
            return new PlaybackContext(this, mergePlaybackHeaders(requestUrl, sourcePage, jsHeaders));
        }
    }

    private static Map<String, String> mergePlaybackHeaders(
        String requestUrl,
        String sourcePage,
        Map<String, String> jsHeaders
    ) {
        Map<String, String> merged = new HashMap<>();
        if (jsHeaders != null) putAllIgnoreCase(merged, jsHeaders);
        putAllIgnoreCase(merged, OriginHeaderStore.headersFor(requestUrl, sourcePage));
        if (sourcePage != null && !hasHeader(merged, "referer")) {
            merged.put("referer", sourcePage);
        }
        merged.remove("range");
        merged.remove("Range");
        return merged;
    }

    private static void putAllIgnoreCase(Map<String, String> target, Map<String, String> incoming) {
        if (incoming == null || incoming.isEmpty()) return;
        for (Map.Entry<String, String> entry : incoming.entrySet()) {
            String name = entry.getKey();
            if (name == null || entry.getValue() == null) continue;
            String existing = null;
            for (String key : target.keySet()) {
                if (name.equalsIgnoreCase(key)) {
                    existing = key;
                    break;
                }
            }
            if (existing != null) target.remove(existing);
            target.put(name, entry.getValue());
        }
    }

    private static boolean isAllowedPageUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        return uri.getHost() != null && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme));
    }

    private static boolean isOpaquePlaybackUrl(String value) {
        if (value == null) return false;
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        return trimmed.startsWith("blob:") || trimmed.startsWith("data:");
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
        String sessionNonce = UUID.randomUUID().toString();
        String probeScript = buildProbeScript(sessionNonce);
        OriginHeaderStore.clear();
        ScriptHandler scriptHandler = installDocumentStartProbe(webView, probeScript);
        ServiceWorkerSniffer.install(networkEvents, pageUrl);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageUrl.set(url);
                if (scriptHandler == null) view.evaluateJavascript(probeScript, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageUrl.set(url);
                view.evaluateJavascript(probeScript, null);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                recordNetworkEvent(networkEvents, pageUrl.get(), request);
                return null;
            }
        });

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(360, 640);
        params.leftMargin = -10000;
        root.addView(webView, params);

        long startMs = System.currentTimeMillis();
        Runnable[] pollHolder = new Runnable[1];
        pollHolder[0] = () -> {
            if (finished.get()) return;
            long now = System.currentTimeMillis();
            if (now - startMs >= timeoutMs) {
                finishSniff(call, webView, root, scriptHandler, networkEvents, pageUrl.get(), finished, sessionNonce);
                return;
            }
            webView.evaluateJavascript(
                "Number(window.__newsnookLastHighValueAt) || 0",
                value -> {
                    if (finished.get()) return;
                    long lastHigh = parseJsMillis(value);
                    long innerNow = System.currentTimeMillis();
                    if (innerNow - startMs >= timeoutMs) {
                        finishSniff(call, webView, root, scriptHandler, networkEvents, pageUrl.get(), finished, sessionNonce);
                        return;
                    }
                    if (innerNow - startMs >= MIN_TIMEOUT_MS && lastHigh > 0 && innerNow - lastHigh >= QUIET_MS) {
                        finishSniff(call, webView, root, scriptHandler, networkEvents, pageUrl.get(), finished, sessionNonce);
                        return;
                    }
                    webView.postDelayed(pollHolder[0], POLL_INTERVAL_MS);
                }
            );
        };
        webView.postDelayed(pollHolder[0], POLL_INTERVAL_MS);
        webView.postDelayed(
            () -> finishSniff(call, webView, root, scriptHandler, networkEvents, pageUrl.get(), finished, sessionNonce),
            timeoutMs
        );

        if (referrer == null) {
            webView.loadUrl(initialUrl);
        } else {
            Map<String, String> navigationHeaders = new HashMap<>();
            navigationHeaders.put("Referer", referrer);
            webView.loadUrl(initialUrl, navigationHeaders);
        }
    }

    private ScriptHandler installDocumentStartProbe(WebView webView, String probeScript) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return null;
        return WebViewCompat.addDocumentStartJavaScript(webView, probeScript, Collections.singleton("*"));
    }

    static void recordNetworkEventForServiceWorker(JSONArray events, String pageUrl, WebResourceRequest request) {
        recordNetworkEvent(events, pageUrl, request, true);
    }

    private static void recordNetworkEvent(JSONArray events, String pageUrl, WebResourceRequest request) {
        recordNetworkEvent(events, pageUrl, request, false);
    }

    private static void recordNetworkEvent(
        JSONArray events,
        String pageUrl,
        WebResourceRequest request,
        boolean fromServiceWorker
    ) {
        String url = request.getUrl().toString();
        Map<String, String> requestHeaders = request.getRequestHeaders();
        if (requestHeaders == null) requestHeaders = Collections.emptyMap();
        OriginHeaderStore.note(url, requestHeaders);
        if (isSkippableStaticAsset(url)) return;
        synchronized (events) {
            if (events.length() >= MAX_NETWORK_EVENTS) return;
            JSONObject event = new JSONObject();
            try {
                event.put("url", url);
                event.put("pageUrl", pageUrl);
                event.put("source", "network");
                event.put("method", request.getMethod());
                event.put("timestamp", System.currentTimeMillis());
                if (fromServiceWorker) event.put("fromServiceWorker", true);
                String mimeType = inferredMimeType(url);
                if (mimeType != null) {
                    event.put("mimeType", mimeType);
                    if (mimeType.startsWith("audio/")) event.put("mediaKind", "audio");
                    else if (mimeType.startsWith("video/")) event.put("mediaKind", "video");
                }
                JSONObject headers = new JSONObject();
                for (Map.Entry<String, String> entry : requestHeaders.entrySet()) {
                    String headerName = entry.getKey();
                    if (headerName == null) continue;
                    String lower = headerName.toLowerCase(Locale.ROOT);
                    if ("range".equals(lower)) continue;
                    if (SAFE_REQUEST_HEADERS.contains(lower)) {
                        headers.put(headerName, entry.getValue());
                    }
                }
                if (headers.length() > 0) event.put("requestHeaders", headers);
                events.put(event);
            } catch (JSONException ignored) {
                // 单条异常不影响页面继续加载。
            }
        }
    }

    private static boolean isSkippableStaticAsset(String url) {
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        if (path == null) return false;
        return path.toLowerCase(Locale.ROOT).matches(".*\\.(js|css|html?|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$");
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
        AtomicBoolean finished,
        String sessionNonce
    ) {
        if (!finished.compareAndSet(false, true)) return;
        webView.evaluateJavascript(
            "window.__newsnookCollectMedia ? JSON.stringify(window.__newsnookCollectMedia()) : '[]'",
            value -> {
                JSONArray networkCopy = copyEvents(networkEvents);
                String userAgent = webView.getSettings().getUserAgentString();
                cleanup(webView, root, scriptHandler, networkEvents);
                new Thread(() -> {
                    try {
                        probeUnknownNetworkEvents(networkCopy, userAgent);
                    } catch (RuntimeException ignored) {
                        // Probe 失败时仍返回已有网络/JS 观察。
                    }
                    appendEvaluatedEvents(networkCopy, value);
                    JSObject result = new JSObject();
                    result.put("pageUrl", pageUrl);
                    result.put("observations", keepTrustedObservations(networkCopy, sessionNonce));
                    android.app.Activity activity = getActivity();
                    if (activity != null) {
                        activity.runOnUiThread(() -> call.resolve(result));
                    } else {
                        call.resolve(result);
                    }
                }, "newsnook-media-probe").start();
            }
        );
    }

    private static JSONArray keepTrustedObservations(JSONArray events, String sessionNonce) {
        Set<String> networkUrls = new HashSet<>();
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (event == null) continue;
            String url = event.optString("url", "");
            if (url.isEmpty()) continue;
            String source = event.optString("source", "");
            if ("network".equals(source) || event.optBoolean("fromServiceWorker", false)) {
                networkUrls.add(url);
            }
        }
        JSONArray trusted = new JSONArray();
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (event == null) continue;
            String eventNonce = event.optString("sessionNonce", "");
            if (!eventNonce.isEmpty() && !eventNonce.equals(sessionNonce)) continue;
            if (event.optBoolean("fromIframe", false)) {
                String url = event.optString("url", "");
                if (url.isEmpty() || !networkUrls.contains(url)) continue;
            }
            event.remove("sessionNonce");
            trusted.put(event);
        }
        return trusted;
    }

    private static long parseJsMillis(String value) {
        if (value == null || "null".equals(value) || "undefined".equals(value)) return 0L;
        try {
            String trimmed = value.trim();
            if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
                trimmed = trimmed.substring(1, trimmed.length() - 1);
            }
            return (long) Double.parseDouble(trimmed);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
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

    private static void probeUnknownNetworkEvents(JSONArray events, String userAgent) {
        List<JSONObject> targets = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (int index = 0; index < events.length() && targets.size() < MediaProbe.MAX_PER_SESSION; index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (event == null) continue;
            String url = event.optString("url", "");
            if (!isAllowedPageUrl(url) || hasMediaExtension(url)) continue;
            String mime = event.optString("mimeType", "").trim();
            if (!mime.isEmpty()) continue;
            if (!seen.add(url)) continue;
            targets.add(event);
        }
        if (targets.isEmpty()) return;

        OkHttpClient client = createProbeClient(userAgent);
        int poolSize = Math.min(4, targets.size());
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(poolSize);
        java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(targets.size());
        for (JSONObject event : targets) {
            String url = event.optString("url", "");
            pool.execute(() -> {
                try {
                    MediaProbe.Result result = MediaProbe.classify(client, url);
                    if (result == null || result.mimeType == null || result.mimeType.isEmpty()) return;
                    synchronized (event) {
                        event.put("mimeType", result.mimeType);
                    }
                } catch (JSONException | RuntimeException ignored) {
                    // 单条 Probe 失败不影响其余观察。
                } finally {
                    latch.countDown();
                }
            });
        }
        try {
            latch.await(15, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } finally {
            pool.shutdownNow();
        }
    }

    private static OkHttpClient createProbeClient(String userAgent) {
        OkHttpClient.Builder builder = new OkHttpClient.Builder()
            .connectTimeout(3, TimeUnit.SECONDS)
            .readTimeout(3, TimeUnit.SECONDS)
            .callTimeout(3, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true);
        String ua = userAgent == null ? "" : userAgent.trim();
        if (!ua.isEmpty()) {
            builder.addInterceptor(new Interceptor() {
                @Override
                public Response intercept(Chain chain) throws IOException {
                    Request request = chain.request();
                    if (request.header("User-Agent") != null) return chain.proceed(request);
                    return chain.proceed(request.newBuilder().header("User-Agent", ua).build());
                }
            });
        }
        return builder.build();
    }

    private static boolean hasMediaExtension(String url) {
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        if (path == null) return false;
        return path.toLowerCase(Locale.ROOT).matches(
            ".*\\.(?:m3u8|m3u|mpd|mp4|m4v|m4s|m4a|webm|mov|flv|mkv|aac|mp3|ogg|opus|ts)$"
        );
    }

    private static void cleanup(WebView webView, ViewGroup root, ScriptHandler scriptHandler, JSONArray networkEvents) {
        ServiceWorkerSniffer.uninstall(networkEvents);
        if (scriptHandler != null) scriptHandler.remove();
        webView.stopLoading();
        root.removeView(webView);
        webView.loadUrl("about:blank");
        webView.destroy();
    }
}
