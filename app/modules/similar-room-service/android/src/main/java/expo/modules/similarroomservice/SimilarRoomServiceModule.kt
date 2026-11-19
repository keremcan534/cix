package expo.modules.similarroomservice

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS: start(title, text) while a room or a call is open (call it while the app is on screen), stop() after. */
class SimilarRoomServiceModule : Module() {
  // The running keep-alive task (lib/webrtc-globals): only touched on the UI thread.
  private var keepAlive: Int? = null

  private fun react(ctx: Context): ReactContext? =
    (ctx.applicationContext as? ReactApplication)?.reactHost?.currentReactContext ?: ctx as? ReactContext

  /** Android stops the app's timers in the background unless a headless task runs: one runs as long as the service. */
  private fun holdTimers(ctx: Context) {
    UiThreadUtil.runOnUiThread {
      if (keepAlive == null) {
        try {
          react(ctx)?.let {
            keepAlive = HeadlessJsTaskContext.getInstance(it)
              .startTask(HeadlessJsTaskConfig(KEEP_ALIVE_TASK, Arguments.createMap(), 0, true))
          }
        } catch (e: Exception) {
          // The room still plays; only its timers pause in the background, as they did before.
        }
      }
    }
  }

  private fun releaseTimers(ctx: Context) {
    UiThreadUtil.runOnUiThread {
      val task = keepAlive
      keepAlive = null
      if (task != null) react(ctx)?.let { HeadlessJsTaskContext.getInstance(it).finishTask(task) }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SimilarRoomService")

    Function("start") { title: String, text: String ->
      val ctx = appContext.reactContext ?: return@Function false
      val intent = Intent(ctx, RoomAudioService::class.java)
        .putExtra(RoomAudioService.EXTRA_TITLE, title)
        .putExtra(RoomAudioService.EXTRA_TEXT, text)
      try {
        ContextCompat.startForegroundService(ctx, intent)
        holdTimers(ctx)
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("stop") {
      val ctx = appContext.reactContext ?: return@Function false
      releaseTimers(ctx)
      ctx.stopService(Intent(ctx, RoomAudioService::class.java))
    }
  }

  private companion object {
    const val KEEP_ALIVE_TASK = "SimilarKeepAlive"
  }
}
