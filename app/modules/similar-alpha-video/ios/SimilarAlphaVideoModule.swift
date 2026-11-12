// Şeffaf video (POC), iOS. UNBUILT AND UNTESTED: the iOS app has never been built (no Mac, no Apple account).
// The same props and events as Android (android/…/SimilarAlphaVideoModule.kt).
import ExpoModulesCore

public final class SimilarAlphaVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SimilarAlphaVideo")

    // Android reports the Java/native heap; iOS has no cheap equivalent here, so the readout shows "–".
    Function("memory") { () -> [String: Double] in
      return [:]
    }

    View(AlphaVideoView.self) {
      Events("onReady", "onEnd", "onError")

      Prop("source") { (view: AlphaVideoView, source: String?) in
        view.source = source
      }

      Prop("loop") { (view: AlphaVideoView, loop: Bool) in
        view.loop = loop
      }

      Prop("paused") { (view: AlphaVideoView, paused: Bool) in
        view.paused = paused
      }

      Prop("muted") { (view: AlphaVideoView, muted: Bool) in
        view.muted = muted
      }

      Prop("restartKey") { (view: AlphaVideoView, key: Int) in
        view.restartKey = key
      }

      OnViewDidUpdateProps { (view: AlphaVideoView) in
        view.applyProps()
      }
    }
  }
}
