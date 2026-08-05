package com.aizeek.newsnook;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Firefox Translations / Bergamot 语对目录。
 *
 * <p>路径来自 Mozilla models.json（GCS）；优先选用 Android Release / Release 条目。
 * 首版只开放核心语对，避免一次下太多。
 */
final class BergamotModelCatalog {
    static final String BASE_URL =
        "https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data";

    static final class FileSpec {
        final String remotePath;
        final String localName;
        final long expectedBytes;
        final String sha256;

        FileSpec(String remotePath, String localName, long expectedBytes, String sha256) {
            this.remotePath = remotePath;
            this.localName = localName;
            this.expectedBytes = expectedBytes;
            this.sha256 = sha256;
        }

        String downloadUrl() {
            return BASE_URL + "/" + remotePath;
        }
    }

    static final class PairSpec {
        final String pairKey;
        final String source;
        final String target;
        final List<FileSpec> files;
        final boolean splitVocab;

        PairSpec(String source, String target, boolean splitVocab, List<FileSpec> files) {
            this.source = source;
            this.target = target;
            this.pairKey = source + target;
            this.splitVocab = splitVocab;
            this.files = Collections.unmodifiableList(files);
        }
    }

    private static final Map<String, PairSpec> PAIRS = new LinkedHashMap<>();

    static {
        // en → zh（Release base-memory）
        register(
            "en",
            "zh",
            true,
            file(
                "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported/model.enzh.intgemm.alphas.bin.gz",
                "model.bin",
                43_849_787L,
                "4e5accc141373565ddc8fa1565bceaa8d0c3482a82cab8131c719ebcc6c2157c"
            ),
            file(
                "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported/lex.50.50.enzh.s2t.bin.gz",
                "lex.bin",
                0L,
                ""
            ),
            file(
                "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported/srcvocab.enzh.spm.gz",
                "srcvocab.spm",
                0L,
                ""
            ),
            file(
                "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported/trgvocab.enzh.spm.gz",
                "trgvocab.spm",
                0L,
                ""
            )
        );

        // zh → en（Release Android base-memory）
        register(
            "zh",
            "en",
            false,
            file(
                "models/zh-en/cjk_retrain_base-memory_cNY_yaJCStGwnTeXgW8A5w/exported/model.zhen.intgemm.alphas.bin.gz",
                "model.bin",
                43_977_787L,
                "5cd149601802fc8a18124a1c1306144dbbedc058630c4ddb2d53aa76fa9c7c06"
            ),
            file(
                "models/zh-en/cjk_retrain_base-memory_cNY_yaJCStGwnTeXgW8A5w/exported/lex.50.50.zhen.s2t.bin.gz",
                "lex.bin",
                0L,
                ""
            ),
            file(
                "models/zh-en/cjk_retrain_base-memory_cNY_yaJCStGwnTeXgW8A5w/exported/vocab.zhen.spm.gz",
                "vocab.spm",
                0L,
                ""
            )
        );
    }

    private BergamotModelCatalog() {}

    static PairSpec find(String source, String target) {
        if (source == null || target == null) return null;
        String key = normalize(source) + "-" + normalize(target);
        return PAIRS.get(key);
    }

    static List<String> supportedPairKeys() {
        return new ArrayList<>(PAIRS.keySet());
    }

    static String normalize(String code) {
        String lower = code.trim().toLowerCase(Locale.ROOT);
        if ("zh-hans".equals(lower) || "zh-cn".equals(lower) || "zh".equals(lower)) return "zh";
        if ("zh-hant".equals(lower) || "zh-tw".equals(lower)) return "zh";
        return lower;
    }

    private static void register(String source, String target, boolean splitVocab, FileSpec... files) {
        List<FileSpec> list = new ArrayList<>();
        Collections.addAll(list, files);
        PAIRS.put(source + "-" + target, new PairSpec(source, target, splitVocab, list));
    }

    private static FileSpec file(String remotePath, String localName, long bytes, String sha256) {
        return new FileSpec(remotePath, localName, bytes, sha256);
    }
}
