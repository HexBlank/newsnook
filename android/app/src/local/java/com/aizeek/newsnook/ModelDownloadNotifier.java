package com.aizeek.newsnook;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.Locale;

/** local flavor：模型下载通知栏进度。 */
final class ModelDownloadNotifier {
    static final String CHANNEL_ID = "model_download";
    static final int ID_MLKIT = 41002;
    static final int ID_BERGAMOT = 41003;

    private static final long MIN_UPDATE_INTERVAL_MS = 500L;
    private static final int PROGRESS_MAX = 1000;

    private final Context appContext;
    private final int notificationId;
    private final String title;
    private long lastUpdateElapsedMs = 0L;
    private boolean active = false;

    ModelDownloadNotifier(Context context, int notificationId, String title) {
        this.appContext = context.getApplicationContext();
        this.notificationId = notificationId;
        this.title = title;
        ensureChannel();
    }

    void startIndeterminate(String content) {
        active = true;
        lastUpdateElapsedMs = 0L;
        post(content, 0, 0, true);
    }

    void updateBytes(long received, long total) {
        if (!active) startIndeterminate("下载中…");
        long now = SystemClock.elapsedRealtime();
        boolean finished = total > 0 && received >= total;
        if (!finished && now - lastUpdateElapsedMs < MIN_UPDATE_INTERVAL_MS) return;
        lastUpdateElapsedMs = now;

        if (total <= 0) {
            post(formatBytes(received) + " 已下载", 0, 0, true);
            return;
        }
        int progress = (int) Math.min(PROGRESS_MAX, (received * (long) PROGRESS_MAX) / total);
        post(formatBytes(received) + " / " + formatBytes(total), PROGRESS_MAX, progress, false);
    }

    void clear() {
        active = false;
        NotificationManagerCompat.from(appContext).cancel(notificationId);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = appContext.getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "模型下载",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("离线翻译模型下载进度");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private void post(String content, int max, int progress, boolean indeterminate) {
        if (!canPost()) return;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(content))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setProgress(max, progress, indeterminate)
            .setContentIntent(launchPendingIntent())
            .setSilent(true);
        try {
            NotificationManagerCompat.from(appContext).notify(notificationId, builder.build());
        } catch (SecurityException ignored) {
            // 权限在 notify 瞬间被撤销时忽略
        }
    }

    private boolean canPost() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(
                appContext,
                Manifest.permission.POST_NOTIFICATIONS
            ) ==
            PackageManager.PERMISSION_GRANTED;
    }

    private PendingIntent launchPendingIntent() {
        Intent intent = appContext
            .getPackageManager()
            .getLaunchIntentForPackage(appContext.getPackageName());
        if (intent == null) {
            intent = new Intent(appContext, MainActivity.class);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(appContext, notificationId, intent, flags);
    }

    static String formatBytes(long bytes) {
        if (bytes < 0L) bytes = 0L;
        double mb = bytes / (1024.0 * 1024.0);
        if (mb >= 100.0) return String.format(Locale.ROOT, "%.0f MB", mb);
        if (mb >= 10.0) return String.format(Locale.ROOT, "%.1f MB", mb);
        if (mb >= 1.0) return String.format(Locale.ROOT, "%.2f MB", mb);
        return String.format(Locale.ROOT, "%.0f KB", bytes / 1024.0);
    }
}
