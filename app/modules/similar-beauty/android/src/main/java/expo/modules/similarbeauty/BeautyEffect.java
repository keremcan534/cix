package expo.modules.similarbeauty;

import android.util.Log;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;

/**
 * Güzellik filtresi for the camera in video calls: a video effect of the WebRTC library
 * (com.oney.WebRTCModule.videoEffects, named NAME) that the app turns on for my camera track. Each frame's luma
 * plane is smoothed (skin) and brightened by the strength I chose (0 = off: the frame passes untouched). Reached
 * by reflection, so a library update that moves it leaves the filter off (logged) rather than breaking the build;
 * a failing frame goes out as it came, and a filter that keeps failing turns itself off for the run.
 */
public final class BeautyEffect implements InvocationHandler {
  static final String NAME = "similar-beauty";
  private static final String TAG = "SimilarBeauty";
  private static volatile int strength = 0;
  private static boolean registered = false;
  private static int failures = 0;

  // The WebRTC classes, found from the first frame (their package is LiveKit's own: livekit.org.webrtc).
  private Method getBuffer, getRotation, getTimestampNs, retain, toI420, getDataY, getStrideY, getWidth, getHeight, release;
  private Constructor<?> newFrame;

  private BeautyEffect() {}

  public static void setStrength(int value) {
    strength = Math.max(0, Math.min(100, value));
  }

  /** Makes the effect known to the WebRTC library (once). True when it is. */
  public static synchronized boolean register() {
    if (registered) return true;
    try {
      ClassLoader loader = BeautyEffect.class.getClassLoader();
      final Class<?> processor = Class.forName("com.oney.WebRTCModule.videoEffects.VideoFrameProcessor", true, loader);
      Class<?> factory = Class.forName("com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface", true, loader);
      Class<?> provider = Class.forName("com.oney.WebRTCModule.videoEffects.ProcessorProvider", true, loader);
      final ClassLoader pl = processor.getClassLoader();
      Object build =
          Proxy.newProxyInstance(
              factory.getClassLoader(),
              new Class<?>[] {factory},
              (proxy, method, args) -> {
                switch (method.getName()) {
                  case "build":
                    return Proxy.newProxyInstance(pl, new Class<?>[] {processor}, new BeautyEffect());
                  case "hashCode":
                    return System.identityHashCode(proxy);
                  case "equals":
                    return proxy == args[0];
                  default:
                    return "BeautyEffectFactory";
                }
              });
      provider.getMethod("addProcessor", String.class, factory).invoke(null, NAME, build);
      registered = true;
      Log.i(TAG, "beauty effect registered");
    } catch (Throwable t) {
      Log.w(TAG, "beauty effect not registered: " + t);
    }
    return registered;
  }

  @Override
  public Object invoke(Object proxy, Method method, Object[] args) {
    switch (method.getName()) {
      case "process":
        return process(args[0]);
      case "hashCode":
        return System.identityHashCode(proxy);
      case "equals":
        return proxy == args[0];
      default:
        return "BeautyEffect";
    }
  }

  /** The frame to send: a new one with the filter on its luma, or this one (retained: the caller releases it). */
  private Object process(Object frame) {
    int s = strength;
    if (frame == null) return null;
    Object i420 = null;
    try {
      if (s <= 0 || failures > 30) return passThrough(frame);
      if (getBuffer == null) bind(frame);
      Object buffer = getBuffer.invoke(frame);
      i420 = toI420.invoke(buffer);
      if (i420 == null) return passThrough(frame);
      ByteBuffer y = (ByteBuffer) getDataY.invoke(i420);
      int stride = (Integer) getStrideY.invoke(i420);
      int width = (Integer) getWidth.invoke(i420);
      int height = (Integer) getHeight.invoke(i420);
      if (y == null || !y.isDirect() || Beauty.apply(y, width, height, stride, s) != 0) {
        release.invoke(i420);
        return passThrough(frame);
      }
      // The new frame owns the filtered buffer (the caller releases it); the original stays the caller's.
      return newFrame.newInstance(i420, getRotation.invoke(frame), getTimestampNs.invoke(frame));
    } catch (Throwable t) {
      failures++;
      if (failures == 1 || failures == 31) Log.e(TAG, failures > 30 ? "beauty effect off for this run" : "beauty frame failed", t);
      try {
        if (i420 != null) release.invoke(i420);
      } catch (Throwable ignored) {
        // Already gone.
      }
      return passThrough(frame);
    }
  }

  private Object passThrough(Object frame) {
    try {
      if (retain == null) retain = frame.getClass().getMethod("retain");
      retain.invoke(frame);
    } catch (Throwable t) {
      Log.e(TAG, "frame retain failed", t);
    }
    return frame;
  }

  private void bind(Object frame) throws Exception {
    Class<?> frameClass = frame.getClass();
    Class<?> bufferClass = Class.forName(frameClass.getName() + "$Buffer", true, frameClass.getClassLoader());
    Class<?> i420Class = Class.forName(frameClass.getName() + "$I420Buffer", true, frameClass.getClassLoader());
    getBuffer = frameClass.getMethod("getBuffer");
    getRotation = frameClass.getMethod("getRotation");
    getTimestampNs = frameClass.getMethod("getTimestampNs");
    retain = frameClass.getMethod("retain");
    toI420 = bufferClass.getMethod("toI420");
    getDataY = i420Class.getMethod("getDataY");
    getStrideY = i420Class.getMethod("getStrideY");
    getWidth = bufferClass.getMethod("getWidth");
    getHeight = bufferClass.getMethod("getHeight");
    release = bufferClass.getMethod("release");
    newFrame = frameClass.getConstructor(bufferClass, int.class, long.class);
  }
}
