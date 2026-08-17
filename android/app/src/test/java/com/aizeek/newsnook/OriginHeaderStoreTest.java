package com.aizeek.newsnook;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import okhttp3.OkHttpClient;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class OriginHeaderStoreTest {

    private static final String PAGE = "https://news.example/articles/42";
    private static final String PAGE_MEDIA = "https://news.example/play.m3u8";
    private static final String CDN = "https://v1.cdn.example/seg.ts";

    @Before
    public void reset() {
        OriginHeaderStore.clear();
        MediaSnifferPlugin.clearPlaybackContexts();
    }

    @Test
    public void originOmitsDefaultPorts() {
        assertEquals("https://v1.cdn.example", OriginHeaderStore.originOf("https://v1.cdn.example:443/a"));
        assertEquals("http://news.example", OriginHeaderStore.originOf("http://news.example:80/a"));
        assertEquals("https://news.example:8443", OriginHeaderStore.originOf("https://news.example:8443/a"));
        assertEquals("https://news.example", OriginHeaderStore.originOf("https://News.Example/a"));
        assertEquals(
            "https://cdn_video.example.com",
            OriginHeaderStore.originOf("https://cdn_video.example.com/play.m3u8")
        );
    }

    @Test
    public void sameOriginHlsThenProgressiveInterceptFalseLeavesWebViewStack() {
        MediaSnifferPlugin.registerPlaybackContext(
            "https://news.example/play.m3u8",
            "hls",
            true,
            false,
            Collections.emptyMap(),
            PAGE,
            new OkHttpClient()
        );
        MediaSnifferPlugin.registerPlaybackContext(
            "https://news.example/video.mp4",
            "progressive",
            false,
            false,
            Collections.emptyMap(),
            PAGE,
            null
        );
        assertNull(MediaSnifferPlugin.findPlaybackContext("https://news.example/video.mp4"));
        assertNull(MediaSnifferPlugin.findPlaybackContext("https://news.example/play.m3u8"));
        assertNull(MediaSnifferPlugin.findPlaybackContext("https://news.example/seg.ts"));
    }

    @Test
    public void laterPreparePlaybackOverwritesSameOriginSession() {
        MediaSnifferPlugin.registerPlaybackContext(
            "https://news.example/a.m3u8",
            "hls",
            true,
            false,
            Collections.emptyMap(),
            PAGE,
            new OkHttpClient()
        );
        MediaSnifferPlugin.registerPlaybackContext(
            "https://news.example/b.m3u8",
            "hls",
            true,
            false,
            Collections.emptyMap(),
            PAGE,
            new OkHttpClient()
        );
        MediaSnifferPlugin.PlaybackContext found =
            MediaSnifferPlugin.findPlaybackContext("https://news.example/seg.ts");
        assertNotNull(found);
        assertEquals("https://news.example/b.m3u8", found.originalUrl);
    }

    @Test
    public void noteIgnoresRangeAndMergesLatest() {
        OriginHeaderStore.note(PAGE_MEDIA, headers(
            "Cookie", "sid=1",
            "Authorization", "Bearer secret",
            "Range", "bytes=0-1",
            "User-Agent", "NewsNook"
        ));
        OriginHeaderStore.note(PAGE_MEDIA, headers("Accept", "application/vnd.apple.mpegurl"));
        Map<String, String> same = OriginHeaderStore.headersFor(PAGE_MEDIA, PAGE, url -> null);
        assertEquals("Bearer secret", same.get("authorization"));
        assertEquals("NewsNook", same.get("user-agent"));
        assertEquals("application/vnd.apple.mpegurl", same.get("accept"));
        assertFalse(same.containsKey("range"));
        assertFalse(same.containsKey("Range"));
    }

    @Test
    public void sameOriginKeepsAuthorizationCrossOriginDoesNot() {
        OriginHeaderStore.note(PAGE, headers(
            "Cookie", "sid=1",
            "Authorization", "Bearer secret",
            "Referer", PAGE,
            "User-Agent", "NewsNook"
        ));
        OriginHeaderStore.note(CDN, headers("Referer", PAGE, "User-Agent", "NewsNook"));

        Map<String, String> same = OriginHeaderStore.headersFor(PAGE_MEDIA, PAGE, url -> "sid=1");
        assertEquals("sid=1", same.get("cookie"));
        assertEquals("Bearer secret", same.get("authorization"));

        Map<String, String> cross = OriginHeaderStore.headersFor(CDN, PAGE, url -> "cdn=1");
        assertEquals("cdn=1", cross.get("cookie"));
        assertNull(cross.get("authorization"));
        assertEquals("https://news.example/", cross.get("referer"));
    }

    @Test
    public void cookieManagerIsOriginScoped() {
        OriginHeaderStore.note(PAGE, headers("Authorization", "Bearer secret"));
        Map<String, String> cross = OriginHeaderStore.headersFor(
            CDN,
            PAGE,
            url -> url.startsWith("https://news.example") ? "page=1" : ""
        );
        assertNull(cross.get("cookie"));
        assertNull(cross.get("authorization"));
    }

    @Test
    public void notedOriginsClearedAtStartDoNotLeak() {
        OriginHeaderStore.note(PAGE, headers("User-Agent", "NewsNook"));
        OriginHeaderStore.note(CDN, headers("Referer", PAGE, "User-Agent", "NewsNook"));
        assertTrue(OriginHeaderStore.notedOrigins().contains("https://news.example"));
        assertTrue(OriginHeaderStore.notedOrigins().contains("https://v1.cdn.example"));
        OriginHeaderStore.clear();
        assertTrue(OriginHeaderStore.notedOrigins().isEmpty());
    }

    private static Map<String, String> headers(String... pairs) {
        Map<String, String> map = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) map.put(pairs[i], pairs[i + 1]);
        return Collections.unmodifiableMap(map);
    }
}
