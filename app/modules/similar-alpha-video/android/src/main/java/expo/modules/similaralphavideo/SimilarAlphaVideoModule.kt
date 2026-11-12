package expo.modules.similaralphavideo

import android.os.Debug
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS: <AlphaVideoView source loop paused muted restartKey onReady onEnd onError />; memory() → the app's Java and
 * native heap in MB (the test panel's readout). Props are only stored by the setters; the view applies them
 * together once a batch of props has arrived (OnViewDidUpdateProps).
 */
class SimilarAlphaVideoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SimilarAlphaVideo")

    Function("memory") {
      val rt = Runtime.getRuntime()
      mapOf(
        "javaHeapMb" to (rt.totalMemory() - rt.freeMemory()) / 1048576.0,
        "javaMaxMb" to rt.maxMemory() / 1048576.0,
        "nativeHeapMb" to Debug.getNativeHeapAllocatedSize() / 1048576.0
      )
    }

    View(AlphaVideoView::class) {
      Events("onReady", "onEnd", "onError")

      Prop("source") { view: AlphaVideoView, source: String? ->
        view.source = source
      }

      Prop("loop") { view: AlphaVideoView, loop: Boolean ->
        view.loop = loop
      }

      Prop("paused") { view: AlphaVideoView, paused: Boolean ->
        view.paused = paused
      }

      Prop("muted") { view: AlphaVideoView, muted: Boolean ->
        view.muted = muted
      }

      Prop("restartKey") { view: AlphaVideoView, key: Int ->
        view.restartKey = key
      }

      OnViewDidUpdateProps { view: AlphaVideoView ->
        view.applyProps()
      }

      OnViewDestroys { view: AlphaVideoView ->
        view.release()
      }
    }
  }
}
