package com.aizeek.newsnook;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.GZIPInputStream;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Bergamot 语对模型落盘：从 Mozilla GCS 拉 .gz，解压到应用私有目录。
 * 目录：filesDir/models/bergamot/{src}-{tgt}/
 */
final class BergamotModelStore {
    interface ProgressListener {
        void onProgress(long received, long total);
    }

    private final File rootDir;

    BergamotModelStore(Context context) {
        rootDir = new File(context.getFilesDir(), "models/bergamot");
    }

    File pairDir(BergamotModelCatalog.PairSpec pair) {
        return new File(rootDir, pair.source + "-" + pair.target);
    }

    boolean isReady(BergamotModelCatalog.PairSpec pair) {
        File dir = pairDir(pair);
        for (BergamotModelCatalog.FileSpec file : pair.files) {
            File local = new File(dir, file.localName);
            if (!local.isFile() || local.length() <= 0L) return false;
            if (file.expectedBytes > 0L && local.length() < file.expectedBytes * 9 / 10) return false;
            if (file.sha256 != null && !file.sha256.isEmpty()) {
                try {
                    if (!file.sha256.equalsIgnoreCase(sha256Hex(local))) return false;
                } catch (Exception error) {
                    return false;
                }
            }
        }
        return true;
    }

    List<String> downloadedPairKeys() {
        List<String> keys = new ArrayList<>();
        for (String key : BergamotModelCatalog.supportedPairKeys()) {
            String[] parts = key.split("-", 2);
            if (parts.length != 2) continue;
            BergamotModelCatalog.PairSpec pair = BergamotModelCatalog.find(parts[0], parts[1]);
            if (pair != null && isReady(pair)) keys.add(key);
        }
        return keys;
    }

    void delete(BergamotModelCatalog.PairSpec pair) {
        File dir = pairDir(pair);
        if (!dir.exists()) return;
        File[] children = dir.listFiles();
        if (children != null) {
            for (File child : children) {
                //noinspection ResultOfMethodCallIgnored
                child.delete();
            }
        }
        //noinspection ResultOfMethodCallIgnored
        dir.delete();
    }

    void download(
        BergamotModelCatalog.PairSpec pair,
        OkHttpClient client,
        ProgressListener progress
    ) throws IOException {
        File dir = pairDir(pair);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("无法创建模型目录");
        }

        long totalKnown = 0L;
        for (BergamotModelCatalog.FileSpec file : pair.files) {
            if (file.expectedBytes > 0L) totalKnown += file.expectedBytes;
        }
        long received = 0L;

        for (BergamotModelCatalog.FileSpec file : pair.files) {
            File target = new File(dir, file.localName);
            File partial = new File(dir, file.localName + ".partial");
            if (partial.exists()) {
                //noinspection ResultOfMethodCallIgnored
                partial.delete();
            }

            Request request = new Request.Builder().url(file.downloadUrl()).get().build();
            try (Response response = client.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    throw new IOException(
                        "下载失败 HTTP " + response.code() + "：" + file.localName
                    );
                }
                ResponseBody body = response.body();
                if (body == null) throw new IOException("空响应：" + file.localName);

                try (
                    InputStream gzip = new GZIPInputStream(body.byteStream());
                    OutputStream out = new FileOutputStream(partial)
                ) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = gzip.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        received += read;
                        if (progress != null) {
                            progress.onProgress(received, totalKnown > 0L ? totalKnown : -1L);
                        }
                    }
                    out.flush();
                }
            }

            if (partial.length() <= 0L) {
                //noinspection ResultOfMethodCallIgnored
                partial.delete();
                throw new IOException("下载文件为空：" + file.localName);
            }
            if (file.expectedBytes > 0L && partial.length() < file.expectedBytes * 9 / 10) {
                //noinspection ResultOfMethodCallIgnored
                partial.delete();
                throw new IOException("下载文件过小：" + file.localName);
            }
            if (file.sha256 != null && !file.sha256.isEmpty()) {
                try {
                    if (!file.sha256.equalsIgnoreCase(sha256Hex(partial))) {
                        //noinspection ResultOfMethodCallIgnored
                        partial.delete();
                        throw new IOException("模型校验失败：" + file.localName);
                    }
                } catch (IOException error) {
                    throw error;
                } catch (Exception error) {
                    //noinspection ResultOfMethodCallIgnored
                    partial.delete();
                    throw new IOException("无法校验模型：" + file.localName, error);
                }
            }

            if (target.exists()) {
                //noinspection ResultOfMethodCallIgnored
                target.delete();
            }
            if (!partial.renameTo(target)) {
                throw new IOException("无法写入：" + file.localName);
            }
        }
    }

    /** 生成 Bergamot Service 所需的 YAML 配置。 */
    String buildConfigYaml(BergamotModelCatalog.PairSpec pair) {
        File dir = pairDir(pair);
        File model = new File(dir, "model.bin");
        File lex = new File(dir, "lex.bin");
        File srcVocab = new File(dir, pair.splitVocab ? "srcvocab.spm" : "vocab.spm");
        File trgVocab = new File(dir, pair.splitVocab ? "trgvocab.spm" : "vocab.spm");

        StringBuilder yaml = new StringBuilder();
        yaml.append("bergamot-mode: native\n");
        yaml.append("models:\n");
        yaml.append("  - ").append(yamlPath(model)).append('\n');
        yaml.append("vocabs:\n");
        yaml.append("  - ").append(yamlPath(srcVocab)).append('\n');
        yaml.append("  - ").append(yamlPath(trgVocab)).append('\n');
        yaml.append("shortlist:\n");
        yaml.append("  - ").append(yamlPath(lex)).append('\n');
        yaml.append("  - false\n");
        yaml.append("beam-size: 1\n");
        yaml.append("normalize: 1.0\n");
        yaml.append("word-penalty: 0\n");
        yaml.append("max-length-break: 128\n");
        yaml.append("mini-batch-words: 1024\n");
        yaml.append("workspace: 128\n");
        yaml.append("max-length-factor: 2.0\n");
        yaml.append("skip-cost: true\n");
        yaml.append("cpu-threads: 0\n");
        yaml.append("quiet: true\n");
        yaml.append("quiet-translation: true\n");
        yaml.append("gemm-precision: int8shiftAlphaAll\n");
        return yaml.toString();
    }

    private static String yamlPath(File file) {
        return file.getAbsolutePath().replace('\\', '/');
    }

    private static String sha256Hex(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        byte[] hash = digest.digest();
        StringBuilder sb = new StringBuilder(hash.length * 2);
        for (byte b : hash) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }
}
