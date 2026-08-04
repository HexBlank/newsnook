package com.aizeek.newsnook;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.TranslateRemoteModel;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONException;

/** 仅 local flavor 编译：Capacitor 边界不向 Web 层泄漏 ML Kit SDK 类型。 */
@CapacitorPlugin(name = "MlKitTranslation")
public class MlKitTranslationPlugin extends Plugin {

    private final RemoteModelManager modelManager = RemoteModelManager.getInstance();

    @PluginMethod
    public void getModelState(PluginCall call) {
        LanguagePair pair = readPair(call);
        if (pair == null) return;
        resolveModelState(call, pair);
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        LanguagePair pair = readPair(call);
        if (pair == null) return;

        Translator translator = createTranslator(pair);
        DownloadConditions.Builder conditions = new DownloadConditions.Builder();
        if (call.getBoolean("wifiOnly", true)) conditions.requireWifi();
        translator
            .downloadModelIfNeeded(conditions.build())
            .addOnSuccessListener(ignored -> {
                translator.close();
                resolveModelState(call, pair);
            })
            .addOnFailureListener(error -> {
                translator.close();
                call.reject("语言包下载失败：" + safeMessage(error), error);
            });
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        LanguagePair pair = readPair(call);
        if (pair == null) return;

        Set<String> languages = new HashSet<>();
        languages.add(pair.source);
        languages.add(pair.target);
        List<Task<Void>> tasks = new ArrayList<>();
        for (String language : languages) {
            tasks.add(modelManager.deleteDownloadedModel(new TranslateRemoteModel.Builder(language).build()));
        }
        Tasks.whenAll(tasks)
            .addOnSuccessListener(ignored -> resolveModelState(call, pair))
            .addOnFailureListener(error -> call.reject("语言包删除失败：" + safeMessage(error), error));
    }

    @PluginMethod
    public void translate(PluginCall call) {
        LanguagePair pair = readPair(call);
        if (pair == null) return;
        JSArray input = call.getArray("texts");
        if (input == null || input.length() == 0) {
            call.reject("缺少待翻译文本");
            return;
        }

        List<String> texts = new ArrayList<>();
        try {
            for (int index = 0; index < input.length(); index++) texts.add(input.getString(index));
        } catch (JSONException error) {
            call.reject("待翻译文本格式不正确", error);
            return;
        }

        Translator translator = createTranslator(pair);
        modelManager.getDownloadedModels(TranslateRemoteModel.class)
            .addOnSuccessListener(models -> {
                Set<String> downloaded = languageSet(models);
                if (!downloaded.contains(pair.source) || !downloaded.contains(pair.target)) {
                    translator.close();
                    call.reject("MODEL_NOT_DOWNLOADED：请先在翻译设置中下载离线语言包");
                    return;
                }
                translateNext(call, translator, texts, new ArrayList<>(), 0);
            })
            .addOnFailureListener(error -> {
                translator.close();
                call.reject("无法读取语言包状态：" + safeMessage(error), error);
            });
    }

    private void translateNext(
        PluginCall call,
        Translator translator,
        List<String> texts,
        List<String> output,
        int index
    ) {
        if (index >= texts.size()) {
            translator.close();
            JSObject result = new JSObject();
            result.put("translations", new JSArray(output));
            call.resolve(result);
            return;
        }

        translator.translate(texts.get(index))
            .addOnSuccessListener(translated -> {
                output.add(translated);
                translateNext(call, translator, texts, output, index + 1);
            })
            .addOnFailureListener(error -> {
                translator.close();
                call.reject("本地翻译失败：" + safeMessage(error), error);
            });
    }

    private void resolveModelState(PluginCall call, LanguagePair pair) {
        modelManager.getDownloadedModels(TranslateRemoteModel.class)
            .addOnSuccessListener(models -> {
                Set<String> downloaded = languageSet(models);
                JSObject result = new JSObject();
                result.put("ready", downloaded.contains(pair.source) && downloaded.contains(pair.target));
                result.put("downloadedLanguages", new JSArray(downloaded));
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("无法读取语言包状态：" + safeMessage(error), error));
    }

    private Set<String> languageSet(Set<TranslateRemoteModel> models) {
        Set<String> languages = new HashSet<>();
        for (TranslateRemoteModel model : models) languages.add(model.getLanguage());
        return languages;
    }

    private Translator createTranslator(LanguagePair pair) {
        TranslatorOptions options = new TranslatorOptions.Builder()
            .setSourceLanguage(pair.source)
            .setTargetLanguage(pair.target)
            .build();
        return Translation.getClient(options);
    }

    private LanguagePair readPair(PluginCall call) {
        String source = TranslateLanguage.fromLanguageTag(call.getString("sourceLanguage", ""));
        String target = TranslateLanguage.fromLanguageTag(call.getString("targetLanguage", ""));
        if (source == null || target == null) {
            call.reject("ML Kit 不支持所选语言");
            return null;
        }
        if (source.equals(target)) {
            call.reject("原文语言与译文语言不能相同");
            return null;
        }
        return new LanguagePair(source, target);
    }

    private String safeMessage(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private static class LanguagePair {
        final String source;
        final String target;

        LanguagePair(String source, String target) {
            this.source = source;
            this.target = target;
        }
    }
}
