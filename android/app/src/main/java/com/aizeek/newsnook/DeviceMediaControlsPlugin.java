package com.aizeek.newsnook;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.media.AudioManager;
import android.provider.Settings;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 全屏视频手势需要的两项系统能力：窗口亮度与媒体音量。
 *
 * 亮度只改当前窗口（WindowManager.LayoutParams.screenBrightness），不写系统设置，
 * 因此不需要 WRITE_SETTINGS 权限，退出全屏时恢复跟随系统即可。
 */
@CapacitorPlugin(name = "DeviceMediaControls")
public class DeviceMediaControlsPlugin extends Plugin {

    private static final float BRIGHTNESS_FOLLOW_SYSTEM = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
    /** Settings.System.SCREEN_BRIGHTNESS 的常规量程，仅用于给出初始基准值。 */
    private static final float SYSTEM_BRIGHTNESS_SCALE = 255f;
    private Integer orientationBeforeVideo;

    @PluginMethod
    public void getBrightness(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity 不可用");
            return;
        }

        float current = activity.getWindow().getAttributes().screenBrightness;
        call.resolve(level(current >= 0 ? current : systemBrightness()));
    }

    @PluginMethod
    public void setBrightness(PluginCall call) {
        Double requested = call.getDouble("value");
        if (requested == null) {
            call.reject("缺少亮度值");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity 不可用");
            return;
        }

        final float target = clamp01(requested.floatValue());
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowManager.LayoutParams params = window.getAttributes();
            params.screenBrightness = target;
            window.setAttributes(params);
            call.resolve(level(target));
        });
    }

    @PluginMethod
    public void clearBrightness(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowManager.LayoutParams params = window.getAttributes();
            params.screenBrightness = BRIGHTNESS_FOLLOW_SYSTEM;
            window.setAttributes(params);
            call.resolve();
        });
    }

    @PluginMethod
    public void getVolume(PluginCall call) {
        AudioManager audio = audioManager();
        if (audio == null) {
            call.reject("音频服务不可用");
            return;
        }

        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        if (max <= 0) {
            call.resolve(level(0f));
            return;
        }
        call.resolve(level((float) audio.getStreamVolume(AudioManager.STREAM_MUSIC) / max));
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double requested = call.getDouble("value");
        if (requested == null) {
            call.reject("缺少音量值");
            return;
        }

        AudioManager audio = audioManager();
        if (audio == null) {
            call.reject("音频服务不可用");
            return;
        }

        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        if (max <= 0) {
            call.resolve(level(0f));
            return;
        }

        int steps = Math.round(clamp01(requested.floatValue()) * max);
        try {
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, steps, 0);
        } catch (SecurityException error) {
            // 勿扰模式下系统会拒绝改音量，返回当前真实值让 UI 保持诚实
            call.resolve(level((float) audio.getStreamVolume(AudioManager.STREAM_MUSIC) / max));
            return;
        }
        call.resolve(level((float) audio.getStreamVolume(AudioManager.STREAM_MUSIC) / max));
    }

    @PluginMethod
    public void lockOrientation(PluginCall call) {
        String orientation = call.getString("orientation");
        final int requestedOrientation;
        if ("landscape".equals(orientation)) {
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
        } else if ("portrait".equals(orientation)) {
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
        } else {
            call.reject("Unsupported orientation");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }

        activity.runOnUiThread(() -> {
            if (orientationBeforeVideo == null) {
                orientationBeforeVideo = activity.getRequestedOrientation();
            }
            activity.setRequestedOrientation(requestedOrientation);
            call.resolve();
        });
    }

    @PluginMethod
    public void unlockOrientation(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            orientationBeforeVideo = null;
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            int restore = orientationBeforeVideo == null
                ? ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                : orientationBeforeVideo;
            orientationBeforeVideo = null;
            activity.setRequestedOrientation(restore);
            call.resolve();
        });
    }

    private AudioManager audioManager() {
        Context context = getContext();
        return context == null ? null : (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }

    private float systemBrightness() {
        Context context = getContext();
        if (context == null) return 1f;
        try {
            int raw = Settings.System.getInt(
                context.getContentResolver(),
                Settings.System.SCREEN_BRIGHTNESS
            );
            return clamp01(raw / SYSTEM_BRIGHTNESS_SCALE);
        } catch (Settings.SettingNotFoundException error) {
            return 1f;
        }
    }

    private static JSObject level(float value) {
        JSObject result = new JSObject();
        result.put("value", clamp01(value));
        return result;
    }

    private static float clamp01(float value) {
        if (Float.isNaN(value)) return 0f;
        return Math.max(0f, Math.min(1f, value));
    }
}
