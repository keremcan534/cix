package expo.modules.similardenoise;

import android.util.Log;

/**
 * "Ham mikrofon": the phone's own noise suppressor (Android's NoiseSuppressor effect, which WebRTC's audio device
 * module starts with the mic on Android 10+) on or off. Reached by reflection, as AiDenoise reaches LiveKit: a WebRTC
 * build without the switch leaves it as it is (logged) rather than breaking the build. WebRTC refuses the change while
 * the mic is recording; then it takes effect from the next time the mic opens (the next room).
 */
final class PhoneNoiseSuppressor {
  private static final String TAG = "SimilarDenoise";

  private PhoneNoiseSuppressor() {}

  static boolean set(boolean on) {
    try {
      Class<?> options = Class.forName("com.oney.WebRTCModule.WebRTCModuleOptions");
      Object instance = options.getMethod("getInstance").invoke(null);
      Object adm = options.getField("audioDeviceModule").get(instance);
      if (adm == null) return false;
      Object took = adm.getClass().getMethod("setNoiseSuppressorEnabled", boolean.class).invoke(adm, on);
      boolean ok = Boolean.TRUE.equals(took);
      Log.i(TAG, "phone noise suppressor " + (on ? "on" : "off") + (ok ? "" : " (not now: the mic is recording, or the phone has none)"));
      return ok;
    } catch (Throwable t) {
      Log.w(TAG, "phone noise suppressor not switched: " + t);
      return false;
    }
  }
}
