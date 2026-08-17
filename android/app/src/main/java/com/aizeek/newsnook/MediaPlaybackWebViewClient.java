package com.aizeek.newsnook;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import okhttp3.MediaType;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/** 为已登记的媒体会话流式补齐 Referer/Cookie/代理，不缓存或改写媒体字节。 */
final class MediaPlaybackWebViewClient extends BridgeWebViewClient {

    MediaPlaybackWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse local = super.shouldInterceptRequest(view, request);
        if (local != null || !"GET".equalsIgnoreCase(request.getMethod())) return local;

        String url = request.getUrl().toString();
        MediaSnifferPlugin.PlaybackContext context = MediaSnifferPlugin.findPlaybackContext(url);
        if (context == null) return null;

        Request.Builder builder = new Request.Builder().url(url);
        for (Map.Entry<String, String> header : context.headers.entrySet()) {
            builder.header(header.getKey(), header.getValue());
        }
        for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet()) {
            String name = header.getKey();
            if ("range".equalsIgnoreCase(name) || "accept".equalsIgnoreCase(name)) {
                builder.header(name, header.getValue());
            }
        }
        Response response = null;
        try {
            response = context.client.newCall(builder.build()).execute();
            ResponseBody body = response.body();
            if (body == null) {
                response.close();
                return null;
            }
            MediaType contentType = body.contentType();
            String mimeType = contentType == null
                ? "application/octet-stream"
                : contentType.type() + "/" + contentType.subtype();
            String encoding = contentType == null || contentType.charset() == null
                ? null
                : contentType.charset().name();
            Map<String, String> headers = new HashMap<>();
            for (String name : response.headers().names()) {
                headers.put(name, response.header(name, ""));
            }
            String reason = response.message();
            if (reason == null || reason.isEmpty()) reason = "HTTP " + response.code();
            return new WebResourceResponse(
                mimeType,
                encoding,
                response.code(),
                reason,
                headers,
                body.byteStream()
            );
        } catch (IOException | IllegalArgumentException error) {
            if (response != null) response.close();
            return null;
        }
    }
}
