package com.aizeek.newsnook;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;

public class OriginHeaderStoreTest {

    private static final String PAGE = "https://news.example/articles/42";
    private static final String PAGE_MEDIA = "https://news.example/play.m3u8";
    private static final String CDN = "https://v1.cdn.example/seg.ts";

    @Before
    public void reset() {
        OriginHeaderStore.clear();
    }

    @Test
    public void originOmitsDefaultPorts() {
        assertEquals("https://v1.cdn.example", OriginHeaderStore.originOf("https://v1.cdn.example:443/a"));
        assertEquals("http://news.example", OriginHeaderStore.originOf("http://news.example:80/a"));
        assertEquals("https://news.example:8443", OriginHeaderStore.originOf("https://news.example:8443/a"));
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

    private static Map<String, String> headers(String... pairs) {
        Map<String, String> map = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) map.put(pairs[i], pairs[i + 1]);
        return Collections.unmodifiableMap(map);
    }
}
