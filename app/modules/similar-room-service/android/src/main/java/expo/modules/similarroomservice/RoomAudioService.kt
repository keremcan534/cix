package expo.modules.similarroomservice

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Keeps a voice room (or a call) alive while the app is in the background: Android stops the mic and may stop the
 * sound of an app without a foreground service. Started while the app is on screen (Android 14 allows a mic service
 * only then), stopped when the room closes. Its notification opens the app.
 */
class RoomAudioService : Service() {
  private var wake: PowerManager.WakeLock? = null
  // Already in the foreground: a refresh (the mic allowed later) that Android refuses keeps the service as it was.
  private var foreground = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Similar Club"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Odadasın"
    val notification = build(title, text)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        // The mic type only with the mic permission (otherwise Android refuses the whole service): then sound only.
        val mic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or (if (mic) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
        try {
          startForeground(NOTIFICATION_ID, notification, types)
        } catch (e: Exception) {
          startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        }
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // Not allowed right now (e.g. started from the background): nothing to keep alive.
      if (!foreground) stopSelf()
      return START_NOT_STICKY
    }
    foreground = true
    if (wake == null) {
      wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "similarclub:room")
        .apply { setReferenceCounted(false); acquire(6 * 60 * 60 * 1000L) }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wake?.let { if (it.isHeld) it.release() }
    wake = null
    super.onDestroy()
  }

  // The app swiped away from recents: the room ends with it.
  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun build(title: String, text: String): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Açık oda", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Uygulama arka plandayken odanın sesi ve mikrofonun açık kalır"
          setShowBadge(false)
        },
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP }
    val tap = open?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    return NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(tap)
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  companion object {
    const val CHANNEL = "room_audio"
    const val NOTIFICATION_ID = 4207
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
  }
}
