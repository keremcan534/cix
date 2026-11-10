package expo.modules.similardenoise;

import android.util.Log;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;

/**
 * "Mikrofon denoise" (AI): RNNoise on the phone's mic, as LiveKit's capture post-processor
 * (com.livekit.reactnative.LiveKitReactNative.audioProcessingController), so it cleans every voice this phone sends
 * (rooms and 1v1 calls) after WebRTC's own processing. Reached by reflection: a LiveKit update that moves it leaves
 * the switch doing nothing (logged) rather than breaking the build. Only full 10 ms frames at 48 kHz (480 samples)
 * are touched; anything else passes as it is.
 */
public final class AiDenoise implements InvocationHandler {
  private static final String TAG = "SimilarDenoise";
  private static final int FRAME = 480;
  private static volatile boolean enabled = false;
  private static boolean attached = false;
  private static AiDenoise instance;

  /** Used on WebRTC's audio thread only. */
  private long state = 0;
  private boolean broken = false;

  private AiDenoise() {}

  /** Turns it on or off; attaches it to LiveKit the first time that can be done. True once attached. */
  public static synchronized boolean setEnabled(boolean on) {
    enabled = on;
    if (!attached) attached = attach();
    return attached;
  }

  public static boolean isAttached() {
    return attached;
  }

  private static boolean attach() {
    try {
      Class<?> iface = Class.forName("com.livekit.reactnative.audio.processing.AudioProcessorInterface");
      Class<?> lk = Class.forName("com.livekit.reactnative.LiveKitReactNative");
      Object lkInstance = lk.getField("INSTANCE").get(null);
      // Throws until WebRTC has started (LiveKitReactNative sets the controller up then): tried again next time.
      Object controller = lk.getMethod("getAudioProcessingController").invoke(lkInstance);
      if (instance == null) instance = new AiDenoise();
      Object proxy = Proxy.newProxyInstance(iface.getClassLoader(), new Class<?>[] {iface}, instance);
      controller.getClass().getMethod("setCapturePostProcessor", iface).invoke(controller, proxy);
      Log.i(TAG, "AI denoise attached");
      return true;
    } catch (Throwable t) {
      Log.w(TAG, "AI denoise not attached yet: " + t);
      return false;
    }
  }

  @Override
  public Object invoke(Object proxy, Method method, Object[] args) {
    switch (method.getName()) {
      case "isEnabled":
        return enabled && !broken;
      case "getName":
        return "similar-rnnoise";
      case "processAudio":
        process((Integer) args[0], (Integer) args[1], (ByteBuffer) args[2]);
        return null;
      case "hashCode":
        return System.identityHashCode(proxy);
      case "equals":
        return proxy == args[0];
      case "toString":
        return "AiDenoise";
      default:
        // initializeAudioProcessing, resetAudioProcessing: nothing to set up (the frame size tells the rate).
        return null;
    }
  }

  private void process(int numBands, int numFrames, ByteBuffer buffer) {
    if (!enabled || broken || numFrames != FRAME || buffer == null || !buffer.isDirect() || buffer.capacity() < FRAME * 4) return;
    try {
      if (state == 0) state = Rnnoise.create();
      if (state != 0) Rnnoise.process(state, buffer);
    } catch (Throwable t) {
      // Never take the mic down: off for the rest of this run.
      broken = true;
      Log.e(TAG, "AI denoise failed, turned off", t);
    }
  }
}
