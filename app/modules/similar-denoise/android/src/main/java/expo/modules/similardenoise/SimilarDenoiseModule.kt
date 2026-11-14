package expo.modules.similardenoise

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS: setEnabled(on) → true once the AI denoise is in the mic's path (AiDenoise); status() → whether it is and how
 * many 10 ms frames it has cleaned, so a phone where it doesn't run can be seen (Efektler ve ses); setPhoneNs(on) →
 * the phone's own noise suppressor for "Ham mikrofon" (PhoneNoiseSuppressor).
 */
class SimilarDenoiseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SimilarDenoise")

    Function("setEnabled") { on: Boolean ->
      AiDenoise.setEnabled(on)
    }

    Function("setPhoneNs") { on: Boolean ->
      PhoneNoiseSuppressor.set(on)
    }

    Function("status") {
      mapOf("attached" to AiDenoise.isAttached(), "frames" to AiDenoise.frames().toDouble())
    }
  }
}
