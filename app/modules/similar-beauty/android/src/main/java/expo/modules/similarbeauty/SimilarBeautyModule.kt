package expo.modules.similarbeauty

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS: register() → true once the effect is known to WebRTC; setStrength(0..100) (0 = off). */
class SimilarBeautyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SimilarBeauty")

    Function("register") {
      BeautyEffect.register()
    }

    Function("setStrength") { value: Int ->
      BeautyEffect.setStrength(value)
    }
  }
}
