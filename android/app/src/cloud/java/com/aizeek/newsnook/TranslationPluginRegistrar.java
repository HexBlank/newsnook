package com.aizeek.newsnook;

import com.getcapacitor.BridgeActivity;

/** 轻量云翻译版不注册本地翻译插件，也不会链接 ML Kit。 */
final class TranslationPluginRegistrar {
    private TranslationPluginRegistrar() {}

    static void register(BridgeActivity activity) {
        // Intentionally empty.
    }
}

