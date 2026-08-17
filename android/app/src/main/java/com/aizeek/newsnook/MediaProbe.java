package com.aizeek.newsnook;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Locale;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

final class MediaProbe {
    static final int MAX_BYTES = 65536;
    static final int MAX_PER_SESSION = 12;

    static final class Result {
        final String mimeType;
        Result(String mimeType) { this.mimeType = mimeType; }
    }

    static Result classify(OkHttpClient client, String url) {
        try {
            Request head = new Request.Builder().url(url).head().build();
            try {
                try (Response response = client.newCall(head).execute()) {
                    String mime = contentType(response);
                    if (isMediaMime(mime) || isManifestMime(mime)) return new Result(mime);
                }
            } catch (IOException ignored) {
                // HEAD 失败或非媒体 MIME 时仍尝试 Range GET。
            }
            Request get = new Request.Builder()
                .url(url)
                .header("Range", "bytes=0-" + (MAX_BYTES - 1))
                .get()
                .build();
            try (Response response = client.newCall(get).execute()) {
                String mime = contentType(response);
                byte[] prefix = readPrefix(response.body(), MAX_BYTES);
                String text = new String(prefix, java.nio.charset.StandardCharsets.UTF_8);
                if (text.startsWith("#EXTM3U") || text.contains("#EXTM3U")) {
                    return new Result("application/vnd.apple.mpegurl");
                }
                if (text.contains("<MPD") || text.contains("application/dash+xml")) {
                    return new Result("application/dash+xml");
                }
                if (indexOf(prefix, "ftyp") >= 0) return new Result("video/mp4");
                if (isMediaMime(mime)) return new Result(mime);
            }
        } catch (IOException | IllegalArgumentException ignored) {
            return null;
        }
        return null;
    }

    /** Reads at most {@code maxBytes} from the body. Closing the response aborts any remainder. */
    private static byte[] readPrefix(ResponseBody body, int maxBytes) throws IOException {
        if (body == null || maxBytes <= 0) return new byte[0];
        InputStream stream = body.byteStream();
        byte[] buffer = new byte[maxBytes];
        int total = 0;
        while (total < maxBytes) {
            int n = stream.read(buffer, total, maxBytes - total);
            if (n < 0) break;
            total += n;
        }
        if (total == maxBytes) return buffer;
        return Arrays.copyOf(buffer, total);
    }

    private static int indexOf(byte[] haystack, String ascii) {
        byte[] needle = ascii.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        outer:
        for (int i = 0; i + needle.length <= haystack.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) continue outer;
            }
            return i;
        }
        return -1;
    }

    private static String contentType(Response response) {
        String header = response.header("Content-Type");
        if (header == null) return "";
        int semi = header.indexOf(';');
        return (semi < 0 ? header : header.substring(0, semi)).trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isMediaMime(String mime) {
        return mime.startsWith("video/") || mime.startsWith("audio/");
    }

    private static boolean isManifestMime(String mime) {
        return mime.contains("mpegurl") || mime.equals("application/dash+xml");
    }
}
