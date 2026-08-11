package com.aizeek.newsnook;

import android.view.KeyEvent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 墨水屏分页：可选拦截音量键并通知 Web（上=上一页，下=下一页）。
 * 未启用时不拦截，系统音量行为不变。
 */
@CapacitorPlugin(name = "VolumePageTurn")
public class VolumePageTurnPlugin extends Plugin {

    private boolean enabled = false;

    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean value = call.getBoolean("enabled", false);
        enabled = Boolean.TRUE.equals(value);
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void getEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }

    /** @return true 表示已消费该按键 */
    public boolean handleKeyEvent(KeyEvent event) {
        if (!enabled) return false;

        int code = event.getKeyCode();
        boolean isVolume =
            code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN;
        if (!isVolume) return false;

        // 拦截 UP，避免部分机型仍弹出系统音量条
        if (event.getAction() == KeyEvent.ACTION_UP) {
            return true;
        }
        if (event.getAction() != KeyEvent.ACTION_DOWN) return false;
        if (event.getRepeatCount() > 0) return true;

        String direction = code == KeyEvent.KEYCODE_VOLUME_UP ? "prev" : "next";
        JSObject payload = new JSObject();
        payload.put("direction", direction);
        notifyListeners("volumePageTurn", payload);
        return true;
    }
}