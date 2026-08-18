package com.aizeek.newsnook;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.net.HttpURLConnection;
import java.net.URL;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 31)
public class LocalStreamProxyTest {

    @After
    public void tearDown() {
        LocalStreamProxy.getInstance().close();
        MediaSnifferPlugin.clearPlaybackContexts();
    }

    @Test
    public void percentEncodedProgressiveUrlParsesWithoutCrashing() throws Exception {
        String target = "https://cdn.example/mp43/1233789.mp4?st=T8v7DkccQC79eH78ziu0qw&e=1787065100";
        String proxyUrl = LocalStreamProxy.getInstance().buildUrl(target, null);
        assertTrue(proxyUrl.startsWith("http://127.0.0.1:"));
        assertTrue(proxyUrl.contains("/stream?url="));

        HttpURLConnection connection = (HttpURLConnection) new URL(proxyUrl).openConnection();
        connection.setConnectTimeout(3000);
        connection.setReadTimeout(3000);
        try {
            assertEquals(404, connection.getResponseCode());
        } finally {
            connection.disconnect();
        }
    }
}
