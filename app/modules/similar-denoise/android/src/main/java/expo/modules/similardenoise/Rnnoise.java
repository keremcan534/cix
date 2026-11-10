package expo.modules.similardenoise;

import java.nio.ByteBuffer;

/** RNNoise through JNI (src/main/cpp): one state per stream, a 10 ms frame (480 floats at 48 kHz) at a time. */
final class Rnnoise {
  static {
    System.loadLibrary("similardenoise");
  }

  private Rnnoise() {}

  static native long create();

  static native void destroy(long state);

  /** Denoises the first 480 floats of a direct buffer in place; the voice probability, or -1 if it couldn't. */
  static native float process(long state, ByteBuffer buffer);
}
