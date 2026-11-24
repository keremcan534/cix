package expo.modules.similardjinput

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS: inputs() → the phone's sound inputs now ({ id, kind, name }, DjInput); prefer(id) → the voice engine records
 * from that one (-1: the phone's choice again); true when the engine took it.
 */
class SimilarDjInputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SimilarDjInput")

    Function("inputs") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any>>()
      DjInput.inputs(context)
    }

    Function("prefer") { id: Int ->
      val context = appContext.reactContext ?: return@Function false
      DjInput.prefer(context, id)
    }
  }
}
