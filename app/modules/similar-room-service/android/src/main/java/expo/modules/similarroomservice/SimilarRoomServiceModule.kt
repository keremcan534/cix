package expo.modules.similarroomservice

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS: start(title, text) while a room or a call is open (call it while the app is on screen), stop() after. */
class SimilarRoomServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SimilarRoomService")

    Function("start") { title: String, text: String ->
      val ctx = appContext.reactContext ?: return@Function false
      val intent = Intent(ctx, RoomAudioService::class.java)
        .putExtra(RoomAudioService.EXTRA_TITLE, title)
        .putExtra(RoomAudioService.EXTRA_TEXT, text)
      try {
        ContextCompat.startForegroundService(ctx, intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("stop") {
      val ctx = appContext.reactContext ?: return@Function false
      ctx.stopService(Intent(ctx, RoomAudioService::class.java))
    }
  }
}
