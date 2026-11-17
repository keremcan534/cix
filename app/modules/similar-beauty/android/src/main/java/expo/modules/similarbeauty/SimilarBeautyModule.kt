package expo.modules.similarbeauty

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS: register() → true once the beauty filter is known to WebRTC; setStrength(0..100) (0 = off); registerMask() →
 * true once the mask is (MaskEffect, right after the filter on my camera); setMask("off" | "eyes" | "mosaic" | "emoji").
 */
class SimilarBeautyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SimilarBeauty")

    Function("register") {
      BeautyEffect.register()
    }

    Function("setStrength") { value: Int ->
      BeautyEffect.setStrength(value)
    }

    Function("registerMask") {
      MaskEffect.register()
    }

    Function("setMask") { kind: String ->
      MaskEffect.setKind(kind)
    }
  }
}
