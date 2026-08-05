#include <jni.h>

#include <string>
#include <vector>

#include "bergamot_engine.h"

namespace {

std::string jstring_to_utf8(JNIEnv* env, jstring value) {
    if (!value) return "";
    const char* chars = env->GetStringUTFChars(value, nullptr);
    if (!chars) return "";
    std::string out(chars);
    env->ReleaseStringUTFChars(value, chars);
    return out;
}

jobjectArray to_jstring_array(JNIEnv* env, const std::vector<std::string>& values) {
    jclass stringClass = env->FindClass("java/lang/String");
    jobjectArray array = env->NewObjectArray((jsize)values.size(), stringClass, nullptr);
    for (size_t i = 0; i < values.size(); ++i) {
        jstring item = env->NewStringUTF(values[i].c_str());
        env->SetObjectArrayElement(array, (jsize)i, item);
        env->DeleteLocalRef(item);
    }
    return array;
}

}  // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_aizeek_newsnook_BergamotTranslationPlugin_nativeEngineReady(JNIEnv*, jobject) {
    return bergamot_engine::engine_ready() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_com_aizeek_newsnook_BergamotTranslationPlugin_nativeEngineError(JNIEnv* env, jobject) {
    return env->NewStringUTF(bergamot_engine::engine_error());
}

JNIEXPORT jint JNICALL
Java_com_aizeek_newsnook_BergamotTranslationPlugin_nativeLoad(
    JNIEnv* env,
    jobject,
    jstring pairKey,
    jstring configYaml
) {
    return bergamot_engine::load(jstring_to_utf8(env, pairKey), jstring_to_utf8(env, configYaml));
}

JNIEXPORT void JNICALL
Java_com_aizeek_newsnook_BergamotTranslationPlugin_nativeUnload(
    JNIEnv* env,
    jobject,
    jstring pairKey
) {
    bergamot_engine::unload(jstring_to_utf8(env, pairKey));
}

JNIEXPORT jobjectArray JNICALL
Java_com_aizeek_newsnook_BergamotTranslationPlugin_nativeTranslate(
    JNIEnv* env,
    jobject,
    jstring pairKey,
    jobjectArray texts
) {
    try {
        std::string key = jstring_to_utf8(env, pairKey);
        jsize length = env->GetArrayLength(texts);
        std::vector<std::string> input;
        input.reserve((size_t)length);
        for (jsize i = 0; i < length; ++i) {
            auto item = (jstring)env->GetObjectArrayElement(texts, i);
            input.push_back(jstring_to_utf8(env, item));
            env->DeleteLocalRef(item);
        }
        auto output = bergamot_engine::translate(key, input);
        return to_jstring_array(env, output);
    } catch (const std::exception& error) {
        jclass exceptionClass = env->FindClass("java/lang/RuntimeException");
        if (exceptionClass) env->ThrowNew(exceptionClass, error.what());
        return nullptr;
    }
}

}  // extern "C"
