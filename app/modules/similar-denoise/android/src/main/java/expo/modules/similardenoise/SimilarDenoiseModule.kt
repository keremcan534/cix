package expo.modules.similardenoise

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS: setEnabled(on) → true once the AI denoise is in the mic's path (AiDenoise). */
class SimilarDenoiseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SimilarDenoise")

    Function("setEnabled") { on: Boolean ->
      AiDenoise.setEnabled(on)
    }
  }
}
