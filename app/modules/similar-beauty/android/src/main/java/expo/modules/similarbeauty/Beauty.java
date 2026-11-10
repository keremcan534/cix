package expo.modules.similarbeauty;

import java.nio.ByteBuffer;

/** The beauty filter through JNI (src/main/cpp/beauty.c): an 8-bit luma plane, in place. */
final class Beauty {
  static {
    System.loadLibrary("similarbeauty");
  }

  private Beauty() {}

  /** 0 when done, -1 when refused (the plane is then left as it was). Strength 1..100. */
  static native int apply(ByteBuffer y, int width, int height, int stride, int strength);
}
