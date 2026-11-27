package expo.modules.similarbeauty;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.media.FaceDetector;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetectorOptions;
import com.google.mlkit.vision.face.FaceLandmark;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.Buffer;
import java.nio.ByteBuffer;
import java.nio.ShortBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Maske for the camera in video calls, so the other side can't recognize me: a video effect of the WebRTC library
 * (com.oney.WebRTCModule.videoEffects, named NAME) that runs right after the beauty filter (BeautyEffect) on my camera
 * track. Kinds: off (the frame passes untouched), eyes (a masquerade over the eyes), mosaic (the face in big blocks),
 * emoji (a drawn smiling face over it). The face is found by Google ML Kit's face detection (its model ships in the APK,
 * no network) in a small grey copy of the frame, up to 25 times a second on a background thread, never holding up a
 * frame; android.media.FaceDetector stands in on a phone where ML Kit doesn't run. Each face is followed (ML Kit's
 * tracking id), smoothed less the faster it moves, and placed ahead along its motion for the frames until the next
 * find; the mask turns with the head (the line between the eyes) and sizes with the face (owners, 27 Nov 2026: the
 * mask slid behind the face and didn't sit on it). Privacy first: while a mask is on and no face
 * was found in the last HOLD_MS (or the finder doesn't work on this phone), the whole picture goes out in big blocks,
 * and a frame that fails goes out black, never as it came. Reached by reflection like BeautyEffect: a library update
 * that moves these classes leaves the mask unregistered (logged; registerMask() is false), not a broken build.
 *
 * <p>Frame ownership. The library's chain (VideoEffectProcessor.onFrameCaptured) hands each effect the frame the one
 * before it returned and never releases that frame itself, so an effect after another one owns its input. This one,
 * always second, gives that frame back as it is (off) or releases it once its own frame is made; first or alone in a
 * chain it would release a frame it doesn't own. tests/mask.test.ts fails when the library's chain changes.
 */
public final class MaskEffect implements InvocationHandler {
  static final String NAME = "similar-mask";
  private static final String TAG = "SimilarMask";

  private static final int OFF = 0, EYES = 1, MOSAIC = 2, EMOJI = 3;
  /** Faces are looked for at most this often (ms), and only when the last find is done: up to 25 times a second. */
  private static final long FIND_EVERY_MS = 40;
  /** A face found this long ago (ms) still places the mask; after that the whole picture goes in blocks. */
  private static final long HOLD_MS = 500;
  /** How far ahead (ms) a face is carried along its motion between finds. */
  private static final long AHEAD_MS = 120;
  /** The short side of the grey copy (px): ML Kit finds a face at arm's length in it. */
  private static final int SNAP = 288;
  private static final int MAX_FACES = 3;
  /** The older finder (android.media.FaceDetector): a face is surely there; a weaker one next to it is covered too. */
  private static final float SURE = 0.4f, MAYBE = 0.3f;
  /** The mask's tilt is drawn in steps of this many degrees (each step one cached picture). */
  private static final int ROLL_STEP = 4;

  private static volatile int kind = OFF;
  private static boolean registered = false;
  // A small black buffer made on the first masked frame and never written again, for a frame that fails when there is
  // no memory left for a new one. Shared by every camera, each use one more reference to it.
  private static volatile Object spare;
  private static volatile boolean spareTried = false;

  // The face finder's thread, shared by every camera (one at a time); it ends after 5 idle seconds. A little below the
  // camera's own threads, but not in Android's background group, which would starve it during a call.
  private static final ThreadPoolExecutor FINDER =
      new ThreadPoolExecutor(
          1,
          1,
          5,
          TimeUnit.SECONDS,
          new LinkedBlockingQueue<Runnable>(),
          r -> {
            Thread t =
                new Thread(
                    () -> {
                      Process.setThreadPriority(Process.THREAD_PRIORITY_DEFAULT + Process.THREAD_PRIORITY_LESS_FAVORABLE);
                      r.run();
                    },
                    "SimilarMaskFaces");
            t.setDaemon(true);
            return t;
          });

  static {
    FINDER.allowCoreThreadTimeOut(true);
  }

  private final Api f;
  // The capture thread's own (process and what it calls).
  private long nextFind = 0;
  private int lastW = 640, lastH = 480, failures = 0;
  private byte[] rowA = new byte[0], rowB = new byte[0], scratchBytes = new byte[0];
  private int[] colsA = new int[0], colsB = new int[0], scratchInts = new int[0];
  // The mask pictures drawn lately (kind, frame turn and tilt step), the least used dropped past 24.
  private final Map<Integer, Sprite> sprites =
      new LinkedHashMap<Integer, Sprite>(32, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<Integer, Sprite> eldest) {
          return size() > 24;
        }
      };
  // Handed to the finder: the capture thread fills `snap` only while `finding` is false, the finder reads it while it
  // is true and then publishes `faces` (never changed after).
  private final AtomicBoolean finding = new AtomicBoolean(false);
  private byte[] snap = new byte[0];
  private volatile Faces faces;

  private MaskEffect(Api api) {
    f = api;
  }

  /** "off", "eyes", "mosaic", "emoji". A name this build doesn't know (a newer app's mask) covers with mosaic. */
  public static void setKind(String value) {
    if (value == null || "off".equals(value)) kind = OFF;
    else if ("eyes".equals(value)) kind = EYES;
    else if ("emoji".equals(value)) kind = EMOJI;
    else kind = MOSAIC;
  }

  /** Makes the effect known to the WebRTC library (once). True when it is. */
  public static synchronized boolean register() {
    if (registered) return true;
    try {
      ClassLoader loader = MaskEffect.class.getClassLoader();
      final Class<?> processor = Class.forName("com.oney.WebRTCModule.videoEffects.VideoFrameProcessor", true, loader);
      Class<?> factory = Class.forName("com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface", true, loader);
      Class<?> provider = Class.forName("com.oney.WebRTCModule.videoEffects.ProcessorProvider", true, loader);
      // Every frame method this effect uses, found now: a missing one leaves the mask unregistered (the call screen
      // then has no mask to offer), never a mask that can't work.
      final Api api = new Api(processor);
      final ClassLoader pl = processor.getClassLoader();
      Object build =
          Proxy.newProxyInstance(
              factory.getClassLoader(),
              new Class<?>[] {factory},
              (proxy, method, args) -> {
                switch (method.getName()) {
                  case "build":
                    return Proxy.newProxyInstance(pl, new Class<?>[] {processor}, new MaskEffect(api));
                  case "hashCode":
                    return System.identityHashCode(proxy);
                  case "equals":
                    return proxy == args[0];
                  default:
                    return "MaskEffectFactory";
                }
              });
      provider.getMethod("addProcessor", String.class, factory).invoke(null, NAME, build);
      registered = true;
      Log.i(TAG, "mask effect registered");
    } catch (Throwable t) {
      Log.w(TAG, "mask effect not registered: " + t);
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
        return "MaskEffect";
    }
  }

  /**
   * The frame to send. Off: the frame I was handed, as it is. On: a new frame with the mask, and the one I was handed
   * released (it is mine: see the class comment).
   */
  private Object process(Object frame) {
    if (frame == null) return null;
    int k = kind;
    if (k == OFF) return frame;
    if (!spareTried) keepSpare();
    Object i420 = null;
    try {
      i420 = f.toI420.invoke(f.getBuffer.invoke(frame));
      if (i420 == null) throw new IllegalStateException("no I420 buffer");
      Object rotation = f.getRotation.invoke(frame);
      cover(i420, (Integer) rotation, k);
      Object out = f.newFrame.newInstance(i420, rotation, f.getTimestampNs.invoke(frame));
      i420 = null;
      release(frame);
      return out;
    } catch (Throwable t) {
      return withheld(frame, i420, t);
    }
  }

  /**
   * A frame that failed while a mask is on goes out black, never as it came: its own converted buffer painted black,
   * else a new black one of its size, else the spare one.
   */
  private Object withheld(Object frame, Object i420, Throwable cause) {
    failures++;
    if (failures == 1 || failures % 300 == 0) Log.e(TAG, "mask frame failed (" + failures + "), sending black", cause);
    Object rotation = 0;
    Object ts = 0L;
    int w = lastW, h = lastH;
    try {
      rotation = f.getRotation.invoke(frame);
      ts = f.getTimestampNs.invoke(frame);
      Object buffer = f.getBuffer.invoke(frame);
      w = (Integer) f.getWidth.invoke(buffer);
      h = (Integer) f.getHeight.invoke(buffer);
    } catch (Throwable ignored) {
      // The black frame goes without them.
    }
    Object out = i420 != null ? blackFrame(i420, rotation, ts) : null;
    if (out == null) {
      Object fresh = null;
      try {
        fresh = f.allocate.invoke(null, w, h);
      } catch (Throwable t) {
        Log.e(TAG, "black frame failed", t);
      }
      if (fresh != null) out = blackFrame(fresh, rotation, ts);
    }
    if (out == null) out = spareFrame(rotation, ts);
    // Not even the spare (it couldn't be made either): the error goes up and the app stops, rather than my face.
    if (out == null) throw new IllegalStateException("mask: no frame to send", cause);
    release(frame);
    return out;
  }

  /** Makes the spare black buffer (one try, on the first masked frame, while there is memory). */
  private void keepSpare() {
    synchronized (MaskEffect.class) {
      if (spareTried) return;
      spareTried = true;
      Object b = null;
      try {
        b = f.allocate.invoke(null, 160, 90);
        black(b);
        spare = b;
      } catch (Throwable t) {
        if (b != null) releaseBuffer(b);
        Log.w(TAG, "no spare black frame: " + t);
      }
    }
  }

  /** The spare black buffer in a new frame (one more reference to it), or null without one. */
  private Object spareFrame(Object rotation, Object ts) {
    Object b = spare;
    if (b == null) return null;
    try {
      f.retainBuffer.invoke(b);
    } catch (Throwable t) {
      return null;
    }
    try {
      return f.newFrame.newInstance(b, rotation, ts);
    } catch (Throwable t) {
      releaseBuffer(b);
      return null;
    }
  }

  /** The buffer painted black, in a new frame; null when that fails (the buffer is then released). */
  private Object blackFrame(Object i420, Object rotation, Object ts) {
    try {
      black(i420);
      return f.newFrame.newInstance(i420, rotation, ts);
    } catch (Throwable t) {
      releaseBuffer(i420);
      return null;
    }
  }

  private void release(Object frame) {
    try {
      f.releaseFrame.invoke(frame);
    } catch (Throwable t) {
      Log.e(TAG, "frame release failed", t);
    }
  }

  private void releaseBuffer(Object buffer) {
    try {
      f.releaseBuffer.invoke(buffer);
    } catch (Throwable t) {
      Log.e(TAG, "buffer release failed", t);
    }
  }

  /** Y 16, U and V 128 over the whole buffer. */
  private void black(Object i420) throws Exception {
    int w = (Integer) f.getWidth.invoke(i420);
    int h = (Integer) f.getHeight.invoke(i420);
    int cw = (w + 1) / 2, ch = (h + 1) / 2;
    paint((ByteBuffer) f.getDataY.invoke(i420), (Integer) f.getStrideY.invoke(i420), w, h, (byte) 16);
    paint((ByteBuffer) f.getDataU.invoke(i420), (Integer) f.getStrideU.invoke(i420), cw, ch, (byte) 128);
    paint((ByteBuffer) f.getDataV.invoke(i420), (Integer) f.getStrideV.invoke(i420), cw, ch, (byte) 128);
  }

  /** One value over w x h of a plane, row by row (rows `stride` apart). */
  private void paint(ByteBuffer p, int stride, int w, int h, byte value) {
    byte[] row = bytes(w);
    Arrays.fill(row, 0, w, value);
    for (int r = 0; r < h; r++) {
      seek(p, r * stride);
      p.put(row, 0, w);
    }
  }

  /**
   * The mask on the frame, in place. Y is w x h, U and V are half that (rounded up), each plane with its own stride.
   * Each face found lately gets the mask; without one, the whole picture goes in blocks.
   */
  private void cover(Object i420, int rotation, int k) throws Exception {
    int w = (Integer) f.getWidth.invoke(i420);
    int h = (Integer) f.getHeight.invoke(i420);
    ByteBuffer y = (ByteBuffer) f.getDataY.invoke(i420);
    ByteBuffer u = (ByteBuffer) f.getDataU.invoke(i420);
    ByteBuffer v = (ByteBuffer) f.getDataV.invoke(i420);
    int sy = (Integer) f.getStrideY.invoke(i420);
    int su = (Integer) f.getStrideU.invoke(i420);
    int sv = (Integer) f.getStrideV.invoke(i420);
    int cw = (w + 1) / 2, ch = (h + 1) / 2;
    if (w < 16 || h < 16 || y == null || u == null || v == null || sy < w || su < cw || sv < cw
        || y.limit() < (long) sy * (h - 1) + w
        || u.limit() < (long) su * (ch - 1) + cw
        || v.limit() < (long) sv * (ch - 1) + cw) {
      throw new IllegalStateException("unexpected I420 layout " + w + "x" + h);
    }
    lastW = w;
    lastH = h;
    int rot = ((rotation % 360) + 360) % 360;
    long now = SystemClock.elapsedRealtime();
    if (now >= nextFind && Detector.works() && finding.compareAndSet(false, true)) {
      nextFind = now + FIND_EVERY_MS;
      snapshot(y, sy, w, h, rot, now);
    }
    // The faces found lately, in this frame's size: WebRTC may scale the camera's frames down or up mid-call (same
    // picture, same shape), anything else (another shape or turn) waits for the next find.
    Faces seen = faces;
    if (seen == null
        || seen.rot != rot
        || now - seen.at > HOLD_MS
        || Math.abs((long) seen.w * h - (long) seen.h * w) > (long) seen.w * h / 100) {
      int block = Math.max(16, Math.round(Math.max(w, h) / 12f)) & ~1;
      blocks(y, sy, 0, 0, w, h, 0, 0, block);
      blocks(u, su, 0, 0, cw, ch, 0, 0, block / 2);
      blocks(v, sv, 0, 0, cw, ch, 0, 0, block / 2);
      return;
    }
    float zoom = w / (float) seen.w;
    boolean turned = rot == 90 || rot == 270;
    // Carried ahead along its motion since the copy was taken (never more than AHEAD_MS), so it doesn't trail the face.
    float ahead = Math.min(AHEAD_MS, Math.max(0, now - seen.at));
    for (int i = 0; i < seen.n; i++) {
      float e = seen.e[i] * zoom;
      float moved = (float) Math.hypot(seen.vx[i], seen.vy[i]) * ahead * zoom;
      // A margin for what the motion can't foresee: more while the face moves.
      float pad = Math.min(e, seen.pad[i] * zoom + 0.5f * moved);
      // The mask's centre and half size, upright, in eye distances from the point between the eyes (the eyes ML Kit
      // finds are ~6.3 cm apart: a face is ~2.3 of them wide and ~3.2 tall, its middle ~0.35 below the eyes).
      float ox, oy, hw, hh;
      if (k == EYES) {
        ox = 0f;
        oy = -0.05f;
        hw = 1.3f;
        hh = 0.6f;
      } else if (k == EMOJI) {
        ox = 0f;
        oy = 0.35f;
        hw = 1.6f;
        hh = 1.6f;
      } else {
        ox = 0f;
        oy = 0.35f;
        hw = 1.45f;
        hh = 1.95f;
      }
      // The head's tilt (upright, degrees, clockwise on screen): the offset turns with it, and so does the picture.
      int step = Math.round(seen.roll[i] / ROLL_STEP);
      double tilt = Math.toRadians(step * ROLL_STEP);
      float cos = (float) Math.cos(tilt), sin = (float) Math.sin(tilt);
      float tx = ox * cos - oy * sin, ty = ox * sin + oy * cos;
      // In the frame's own orientation: the offset turned with the rotation, the sizes swapped on a quarter turn.
      float dx = tx * e, dy = ty * e, bx, by;
      switch (rot) {
        case 90:
          bx = dy;
          by = -dx;
          break;
        case 180:
          bx = -dx;
          by = -dy;
          break;
        case 270:
          bx = -dy;
          by = dx;
          break;
        default:
          bx = dx;
          by = dy;
      }
      float cx = seen.x[i] * zoom + seen.vx[i] * ahead * zoom + bx, cy = seen.y[i] * zoom + seen.vy[i] * ahead * zoom + by;
      if (k == MOSAIC) {
        // The tilted face's box, upright: its bounding box at this tilt.
        float uw = hw * Math.abs(cos) + hh * Math.abs(sin), uh = hw * Math.abs(sin) + hh * Math.abs(cos);
        float halfX = (turned ? uh : uw) * e + pad, halfY = (turned ? uw : uh) * e + pad;
        // Even edges, so the chroma box (half of it) lines up with the luma one.
        int x0 = ((int) Math.floor(cx - halfX)) & ~1, y0 = ((int) Math.floor(cy - halfY)) & ~1;
        int x1 = (((int) Math.ceil(cx + halfX)) + 1) & ~1, y1 = (((int) Math.ceil(cy + halfY)) + 1) & ~1;
        int block = Math.max(8, Math.round(e / 2.2f)) & ~1;
        blocks(y, sy, Math.max(0, x0), Math.max(0, y0), Math.min(w, x1), Math.min(h, y1), x0, y0, block);
        int cx0 = Math.max(0, x0 / 2), cy0 = Math.max(0, y0 / 2), cx1 = Math.min(cw, x1 / 2), cy1 = Math.min(ch, y1 / 2);
        blocks(u, su, cx0, cy0, cx1, cy1, x0 / 2, y0 / 2, block / 2);
        blocks(v, sv, cx0, cy0, cx1, cy1, x0 / 2, y0 / 2, block / 2);
      } else {
        // The picture holds the mask turned by the tilt (and by the frame's turn); its size in the frame follows the
        // mask's own width, 2 * hw eye distances, plus the margin all round.
        Sprite s = sprite(k, rot, step);
        float scale = 2f * hw * e / s.pw;
        float grow = 1f + 2f * pad / (2f * hw * e);
        float halfX = s.w * scale * grow / 2f, halfY = s.h * scale * grow / 2f;
        int x0 = ((int) Math.floor(cx - halfX)) & ~1, y0 = ((int) Math.floor(cy - halfY)) & ~1;
        int x1 = (((int) Math.ceil(cx + halfX)) + 1) & ~1, y1 = (((int) Math.ceil(cy + halfY)) + 1) & ~1;
        paste(y, sy, w, h, s.y, s.a, s.w, s.h, x0, y0, x1 - x0, y1 - y0);
        paste(u, su, cw, ch, s.u, s.ca, s.w / 2, s.h / 2, x0 / 2, y0 / 2, (x1 - x0) / 2, (y1 - y0) / 2);
        paste(v, sv, cw, ch, s.v, s.ca, s.w / 2, s.h / 2, x0 / 2, y0 / 2, (x1 - x0) / 2, (y1 - y0) / 2);
      }
    }
  }

  /**
   * A small grey copy of the luma (the frame's own orientation, short side SNAP px, each pixel the mean of 4 samples)
   * handed to the finder. Only while `finding` is set (by the caller), so the finder isn't reading it.
   */
  private void snapshot(ByteBuffer y, int stride, int w, int h, int rot, long at) {
    try {
      float scale = Math.max(1f, Math.min(w, h) / (float) SNAP);
      int sw = Math.max(2, Math.round(w / scale) & ~1);
      int sh = Math.max(2, Math.round(h / scale) & ~1);
      if (snap.length < sw * sh) snap = new byte[sw * sh];
      if (rowA.length < w) {
        rowA = new byte[w];
        rowB = new byte[w];
      }
      if (colsA.length < sw) {
        colsA = new int[sw];
        colsB = new int[sw];
      }
      for (int i = 0; i < sw; i++) {
        colsA[i] = Math.min(w - 1, (int) ((i + 0.25f) * w / sw));
        colsB[i] = Math.min(w - 1, (int) ((i + 0.75f) * w / sw));
      }
      byte[] copy = snap;
      for (int j = 0; j < sh; j++) {
        seek(y, Math.min(h - 1, (int) ((j + 0.25f) * h / sh)) * stride);
        y.get(rowA, 0, w);
        seek(y, Math.min(h - 1, (int) ((j + 0.75f) * h / sh)) * stride);
        y.get(rowB, 0, w);
        int o = j * sw;
        for (int i = 0; i < sw; i++) {
          int a = colsA[i], b = colsB[i];
          copy[o + i] = (byte) (((rowA[a] & 0xFF) + (rowA[b] & 0xFF) + (rowB[a] & 0xFF) + (rowB[b] & 0xFF) + 2) >> 2);
        }
      }
      FINDER.execute(() -> find(copy, sw, sh, rot, w, h, at));
    } catch (Throwable t) {
      finding.set(false);
      Log.w(TAG, "face copy failed: " + t);
    }
  }

  /** On the finder's thread: the faces in the copy, for the frames that follow. */
  private void find(byte[] copy, int sw, int sh, int rot, int w, int h, long at) {
    try {
      Faces found = Detector.find(copy, sw, sh, rot, w, h, at, faces);
      if (found != null) faces = found;
    } catch (Throwable t) {
      Log.w(TAG, "face finding failed: " + t);
    } finally {
      finding.set(false);
    }
  }

  /**
   * Big blocks over [x0, x1) x [y0, y1) of one plane (rows `stride` apart). The block grid starts at (gx, gy), so the
   * luma and chroma blocks line up; each block is the mean of up to 8 x 8 of its pixels.
   */
  private void blocks(ByteBuffer p, int stride, int x0, int y0, int x1, int y1, int gx, int gy, int block) {
    if (x1 <= x0 || y1 <= y0 || block < 1) return;
    int len = x1 - x0;
    byte[] row = bytes(len);
    for (int top = y0 - Math.floorMod(y0 - gy, block); top < y1; top += block) {
      int r0 = Math.max(top, y0), r1 = Math.min(top + block, y1);
      for (int left = x0 - Math.floorMod(x0 - gx, block); left < x1; left += block) {
        int c0 = Math.max(left, x0), c1 = Math.min(left + block, x1);
        Arrays.fill(row, c0 - x0, c1 - x0, (byte) mean(p, stride, c0, r0, c1, r1));
      }
      for (int r = r0; r < r1; r++) {
        seek(p, r * stride + x0);
        p.put(row, 0, len);
      }
    }
  }

  private static int mean(ByteBuffer p, int stride, int x0, int y0, int x1, int y1) {
    int nx = Math.min(8, x1 - x0), ny = Math.min(8, y1 - y0), sum = 0;
    for (int j = 0; j < ny; j++) {
      int row = (y0 + (2 * j + 1) * (y1 - y0) / (2 * ny)) * stride;
      for (int i = 0; i < nx; i++) sum += p.get(row + x0 + (2 * i + 1) * (x1 - x0) / (2 * nx)) & 0xFF;
    }
    return (sum + nx * ny / 2) / (nx * ny);
  }

  /**
   * The picture (pw x ph, with its alpha) stretched over the box at (bx, by), bw x bh, of one plane (planeW x planeH,
   * rows `stride` apart); the part outside the plane is left out.
   */
  private void paste(
      ByteBuffer p,
      int stride,
      int planeW,
      int planeH,
      byte[] pic,
      byte[] alpha,
      int pw,
      int ph,
      int bx,
      int by,
      int bw,
      int bh) {
    if (bw <= 0 || bh <= 0) return;
    int x0 = Math.max(0, bx), x1 = Math.min(planeW, bx + bw);
    int y0 = Math.max(0, by), y1 = Math.min(planeH, by + bh);
    if (x1 <= x0 || y1 <= y0) return;
    int len = x1 - x0;
    byte[] row = bytes(len);
    int[] col = ints(len);
    for (int i = 0; i < len; i++) col[i] = (x0 + i - bx) * pw / bw;
    for (int r = y0; r < y1; r++) {
      int base = (r - by) * ph / bh * pw;
      int at = r * stride + x0;
      seek(p, at);
      p.get(row, 0, len);
      for (int i = 0; i < len; i++) {
        int q = base + col[i];
        int a = alpha[q] & 0xFF;
        if (a == 0) continue;
        int c = pic[q] & 0xFF;
        if (a < 255) {
          int bg = row[i] & 0xFF;
          c = bg + (c - bg) * a / 255;
        }
        row[i] = (byte) c;
      }
      seek(p, at);
      p.put(row, 0, len);
    }
  }

  private byte[] bytes(int len) {
    if (scratchBytes.length < len) scratchBytes = new byte[len];
    return scratchBytes;
  }

  private int[] ints(int len) {
    if (scratchInts.length < len) scratchInts = new int[len];
    return scratchInts;
  }

  /** Through Buffer: ByteBuffer's own position(int) is newer than some of the phones this runs on. */
  private static void seek(ByteBuffer b, int position) {
    ((Buffer) b).position(position);
  }

  private Sprite sprite(int k, int rot, int step) {
    int key = (k * 4 + rot / 90) * 1000 + step + 500;
    Sprite s = sprites.get(key);
    if (s == null) {
      s = render(k, rot, step * ROLL_STEP);
      sprites.put(key, s);
    }
    return s;
  }

  /**
   * The mask drawn upright (emoji 256 x 256, eyes 288 x 132), tilted by the head's `roll` (degrees, clockwise on the
   * upright picture) and turned back by the frame's rotation, so it sits on the face on the other side's screen; in YUV
   * with its alpha (chroma: each 2 x 2, weighted by alpha).
   */
  private static Sprite render(int k, int rot, int roll) {
    int pw = k == EMOJI ? 256 : 288, ph = k == EMOJI ? 256 : 132;
    double t = Math.toRadians(roll);
    float ac = (float) Math.abs(Math.cos(t)), as0 = (float) Math.abs(Math.sin(t));
    int bw = ((int) Math.ceil(pw * ac + ph * as0) + 1) & ~1, bh = ((int) Math.ceil(pw * as0 + ph * ac) + 1) & ~1;
    boolean turned = rot == 90 || rot == 270;
    int w = turned ? bh : bw, h = turned ? bw : bh;
    Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    canvas.translate(w / 2f, h / 2f);
    canvas.rotate(-rot);
    canvas.rotate(roll);
    canvas.translate(-pw / 2f, -ph / 2f);
    if (k == EMOJI) drawEmoji(canvas, pw);
    else drawEyes(canvas, pw, ph);
    int[] px = new int[w * h];
    bitmap.getPixels(px, 0, w, 0, 0, w, h);
    bitmap.recycle();
    byte[] ys = new byte[w * h], as = new byte[w * h];
    for (int i = 0; i < px.length; i++) {
      ys[i] = (byte) lumaOf(px[i]);
      as[i] = (byte) (px[i] >>> 24);
    }
    int cw = w / 2, ch = h / 2;
    byte[] us = new byte[cw * ch], vs = new byte[cw * ch], cas = new byte[cw * ch];
    for (int j = 0; j < ch; j++) {
      for (int i = 0; i < cw; i++) {
        int sa = 0, su = 0, sv = 0;
        for (int q = 0; q < 4; q++) {
          int c = px[(2 * j + (q >> 1)) * w + 2 * i + (q & 1)];
          int a = c >>> 24;
          sa += a;
          su += a * uOf(c);
          sv += a * vOf(c);
        }
        int o = j * cw + i;
        cas[o] = (byte) ((sa + 2) / 4);
        us[o] = (byte) (sa > 0 ? su / sa : 128);
        vs[o] = (byte) (sa > 0 ? sv / sa : 128);
      }
    }
    return new Sprite(pw, w, h, ys, as, us, vs, cas);
  }

  // BT.601 in video range, as the library's own YUV conversion.
  private static int lumaOf(int c) {
    int r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
    return 16 + ((66 * r + 129 * g + 25 * b + 128) >> 8);
  }

  private static int uOf(int c) {
    int r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
    return 128 + ((-38 * r - 74 * g + 112 * b + 128) >> 8);
  }

  private static int vOf(int c) {
    int r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
    return 128 + ((112 * r - 94 * g - 18 * b + 128) >> 8);
  }

  /**
   * A smiling face drawn here (the same on every phone, no emoji font): a golden disc with light from the top left,
   * closed smiling eyes, rosy cheeks and a wide smile, a soft rim so its edge sits on the face.
   */
  private static void drawEmoji(Canvas canvas, int size) {
    float c = size / 2f, r = size * 0.48f;
    Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);
    disc.setShader(new RadialGradient(c - r * 0.35f, c - r * 0.4f, r * 1.5f, new int[] {0xFFFFE98A, 0xFFFFC93C, 0xFFF2A516}, new float[] {0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
    canvas.drawCircle(c, c, r, disc);
    Paint rim = new Paint(Paint.ANTI_ALIAS_FLAG);
    rim.setStyle(Paint.Style.STROKE);
    rim.setStrokeWidth(size * 0.025f);
    rim.setColor(0xFFE0901A);
    canvas.drawCircle(c, c, r - size * 0.012f, rim);
    Paint cheek = new Paint(Paint.ANTI_ALIAS_FLAG);
    cheek.setColor(0x66FF6F91);
    canvas.drawOval(new RectF(c - r * 0.78f, c + r * 0.08f, c - r * 0.38f, c + r * 0.34f), cheek);
    canvas.drawOval(new RectF(c + r * 0.38f, c + r * 0.08f, c + r * 0.78f, c + r * 0.34f), cheek);
    Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    line.setStyle(Paint.Style.STROKE);
    line.setStrokeCap(Paint.Cap.ROUND);
    line.setStrokeWidth(size * 0.045f);
    line.setColor(0xFF5B3A12);
    // Closed, smiling eyes: arcs bowed up.
    canvas.drawArc(new RectF(c - r * 0.62f, c - r * 0.42f, c - r * 0.18f, c - r * 0.02f), 200, 140, false, line);
    canvas.drawArc(new RectF(c + r * 0.18f, c - r * 0.42f, c + r * 0.62f, c - r * 0.02f), 200, 140, false, line);
    // The smile: an open mouth with a tongue.
    Path mouth = new Path();
    mouth.moveTo(c - r * 0.5f, c + r * 0.22f);
    mouth.quadTo(c, c + r * 0.95f, c + r * 0.5f, c + r * 0.22f);
    mouth.quadTo(c, c + r * 0.38f, c - r * 0.5f, c + r * 0.22f);
    mouth.close();
    Paint inside = new Paint(Paint.ANTI_ALIAS_FLAG);
    inside.setColor(0xFF7A2E1C);
    canvas.drawPath(mouth, inside);
    Paint tongue = new Paint(Paint.ANTI_ALIAS_FLAG);
    tongue.setColor(0xFFFF7A8A);
    canvas.drawOval(new RectF(c - r * 0.2f, c + r * 0.46f, c + r * 0.2f, c + r * 0.62f), tongue);
    line.setStrokeWidth(size * 0.03f);
    canvas.drawPath(mouth, line);
  }

  /**
   * A masquerade over both eyes and the brows: night-blue satin lit from above, a gold rim, a gold filigree line along the
   * top and small stones at the corners; closed (nothing of the eyes shows, only a darker hollow where they are).
   */
  private static void drawEyes(Canvas canvas, int w, int h) {
    float rim = h * 0.055f;
    Matrix fit = new Matrix();
    fit.setScale((w - 2 * rim) / 100f, (h - 2 * rim) / 100f);
    fit.postTranslate(rim, rim);
    // The outline on a 100 x 100 grid: two lobes swept up at the outer ends, a dip over the bridge of the nose, a notch
    // for the nose.
    Path mask = new Path();
    mask.moveTo(0, 30);
    mask.cubicTo(6, 6, 22, 4, 32, 8);
    mask.cubicTo(42, 12, 46, 20, 50, 22);
    mask.cubicTo(54, 20, 58, 12, 68, 8);
    mask.cubicTo(78, 4, 94, 6, 100, 30);
    mask.cubicTo(100, 70, 88, 98, 72, 96);
    mask.cubicTo(62, 95, 56, 76, 50, 74);
    mask.cubicTo(44, 76, 38, 95, 28, 96);
    mask.cubicTo(12, 98, 0, 70, 0, 30);
    mask.close();
    mask.transform(fit);
    Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    fill.setShader(new LinearGradient(0, 0, 0, h, new int[] {0xFF3A2A6E, 0xFF1C1238, 0xFF0E0820}, new float[] {0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
    canvas.drawPath(mask, fill);
    // The hollows where the eyes are, darker, with a gold line round them.
    Paint hollow = new Paint(Paint.ANTI_ALIAS_FLAG);
    hollow.setColor(0xFF0A0614);
    Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    ring.setStyle(Paint.Style.STROKE);
    ring.setStrokeWidth(rim * 0.5f);
    ring.setColor(0xFFD9B15A);
    RectF eye = new RectF(17, 38, 42, 66);
    fit.mapRect(eye);
    canvas.drawOval(eye, hollow);
    canvas.drawOval(eye, ring);
    eye.set(58, 38, 83, 66);
    fit.mapRect(eye);
    canvas.drawOval(eye, hollow);
    canvas.drawOval(eye, ring);
    // A soft sheen along the top.
    Paint sheen = new Paint(Paint.ANTI_ALIAS_FLAG);
    sheen.setShader(new LinearGradient(0, 0, 0, h * 0.45f, 0x40FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
    canvas.drawPath(mask, sheen);
    // Filigree: a gold line that follows the top edge a little inside it.
    Path lace = new Path();
    lace.moveTo(8, 30);
    lace.cubicTo(14, 14, 26, 14, 34, 18);
    lace.cubicTo(42, 22, 46, 30, 50, 31);
    lace.cubicTo(54, 30, 58, 22, 66, 18);
    lace.cubicTo(74, 14, 86, 14, 92, 30);
    lace.transform(fit);
    Paint gold = new Paint(Paint.ANTI_ALIAS_FLAG);
    gold.setStyle(Paint.Style.STROKE);
    gold.setStrokeCap(Paint.Cap.ROUND);
    gold.setStrokeWidth(rim * 0.45f);
    gold.setShader(new LinearGradient(0, 0, w, 0, new int[] {0xFFB8862B, 0xFFFFE49A, 0xFFB8862B}, null, Shader.TileMode.CLAMP));
    canvas.drawPath(lace, gold);
    // The rim.
    Paint edge = new Paint(Paint.ANTI_ALIAS_FLAG);
    edge.setStyle(Paint.Style.STROKE);
    edge.setStrokeWidth(rim);
    edge.setShader(new LinearGradient(0, 0, w, h, new int[] {0xFFFFE49A, 0xFFC9962E, 0xFFFFE49A}, null, Shader.TileMode.CLAMP));
    canvas.drawPath(mask, edge);
    // Stones at the outer corners and over the nose.
    Paint stone = new Paint(Paint.ANTI_ALIAS_FLAG);
    float[] at = {6, 28, 94, 28, 50, 26};
    fit.mapPoints(at);
    for (int i = 0; i < at.length; i += 2) {
      stone.setShader(new RadialGradient(at[i] - rim * 0.3f, at[i + 1] - rim * 0.3f, rim * 1.2f, 0xFFFFD1E8, 0xFFE0457B, Shader.TileMode.CLAMP));
      canvas.drawCircle(at[i], at[i + 1], rim * (i == 4 ? 0.9f : 1.1f), stone);
    }
  }

  /** The WebRTC frame classes (LiveKit's own package, livekit.org.webrtc), found from the effect interface. */
  private static final class Api {
    final Method getBuffer, getRotation, getTimestampNs, releaseFrame;
    final Method toI420, getWidth, getHeight, retainBuffer, releaseBuffer;
    final Method getDataY, getDataU, getDataV, getStrideY, getStrideU, getStrideV;
    final Method allocate;
    final Constructor<?> newFrame;

    Api(Class<?> processor) throws Exception {
      Class<?> frameClass = null;
      for (Method m : processor.getMethods()) {
        if ("process".equals(m.getName()) && m.getParameterTypes().length == 2) frameClass = m.getReturnType();
      }
      if (frameClass == null) throw new NoSuchMethodException("VideoFrameProcessor.process");
      ClassLoader cl = frameClass.getClassLoader();
      String name = frameClass.getName();
      Class<?> buffer = Class.forName(name + "$Buffer", false, cl);
      Class<?> i420 = Class.forName(name + "$I420Buffer", false, cl);
      Class<?> javaI420 = Class.forName(name.substring(0, name.lastIndexOf('.') + 1) + "JavaI420Buffer", false, cl);
      getBuffer = frameClass.getMethod("getBuffer");
      getRotation = frameClass.getMethod("getRotation");
      getTimestampNs = frameClass.getMethod("getTimestampNs");
      releaseFrame = frameClass.getMethod("release");
      newFrame = frameClass.getConstructor(buffer, int.class, long.class);
      toI420 = buffer.getMethod("toI420");
      getWidth = buffer.getMethod("getWidth");
      getHeight = buffer.getMethod("getHeight");
      retainBuffer = buffer.getMethod("retain");
      releaseBuffer = buffer.getMethod("release");
      getDataY = i420.getMethod("getDataY");
      getDataU = i420.getMethod("getDataU");
      getDataV = i420.getMethod("getDataV");
      getStrideY = i420.getMethod("getStrideY");
      getStrideU = i420.getMethod("getStrideU");
      getStrideV = i420.getMethod("getStrideV");
      allocate = javaI420.getMethod("allocate", int.class, int.class);
    }
  }

  /**
   * Faces found in one copy, in the frame's coordinates: the point between the eyes, the eye distance, the head's tilt
   * (upright, degrees, clockwise), the motion (px per ms) and a margin; `at` is when the copy was taken.
   */
  private static final class Faces {
    final int n, w, h, rot;
    final long at;
    final float[] x, y, e, roll, vx, vy, pad;

    Faces(int n, float[] x, float[] y, float[] e, float[] roll, float[] vx, float[] vy, float[] pad, int w, int h, int rot, long at) {
      this.n = n;
      this.x = x;
      this.y = y;
      this.e = e;
      this.roll = roll;
      this.vx = vx;
      this.vy = vy;
      this.pad = pad;
      this.w = w;
      this.h = h;
      this.rot = rot;
      this.at = at;
    }
  }

  /** A mask picture in the frame's orientation: luma and its alpha (w x h, both even), chroma and alpha at half. */
  private static final class Sprite {
    /** The mask's own width before the tilt (px): what 2 * hw eye distances are. */
    final int pw, w, h;
    final byte[] y, a, u, v, ca;

    Sprite(int pw, int w, int h, byte[] y, byte[] a, byte[] u, byte[] v, byte[] ca) {
      this.pw = pw;
      this.w = w;
      this.h = h;
      this.y = y;
      this.a = a;
      this.u = u;
      this.v = v;
      this.ca = ca;
    }
  }

  /** One face as a finder saw it, in the frame's coordinates (tracking id -1 when the finder has none). */
  private static final class Raw {
    final float x, y, e, roll;
    final int id;

    Raw(float x, float y, float e, float roll, int id) {
      this.x = x;
      this.y = y;
      this.e = e;
      this.roll = roll;
      this.id = id;
    }
  }

  /**
   * The finders, on the finder's thread only: ML Kit, else android.media.FaceDetector. Each find is matched to the faces
   * before (ML Kit's tracking id, else the nearest), smoothed less the faster the face moves, and given its motion.
   */
  private static final class Detector {
    private static int[] ids = new int[0];

    /** False once both finders failed for good on this phone: then the whole picture stays in blocks. */
    static boolean works() {
      return MlKit.works() || Legacy.works();
    }

    /**
     * The faces in a grey copy (sw x sh, the frame's orientation; `rot` turns it upright), in the frame's coordinates
     * (w x h), followed on from `before`; null when no face is there.
     */
    static synchronized Faces find(byte[] copy, int sw, int sh, int rot, int w, int h, long at, Faces before) {
      List<Raw> raw = MlKit.works() ? MlKit.find(copy, sw, sh, rot, w, h) : null;
      if (raw == null && !MlKit.works()) raw = Legacy.find(copy, sw, sh, rot, w, h);
      if (raw == null || raw.isEmpty()) return null;
      int m = Math.min(MAX_FACES, raw.size());
      float[] xs = new float[m], ys = new float[m], es = new float[m], rolls = new float[m];
      float[] vxs = new float[m], vys = new float[m], pads = new float[m];
      int[] nextIds = new int[m];
      boolean same = before != null && before.w == w && before.h == h && before.rot == rot && at - before.at < 600 && before.at < at;
      float dt = same ? Math.max(1, at - before.at) : 1;
      boolean[] taken = new boolean[same ? before.n : 0];
      for (int i = 0; i < m; i++) {
        Raw f = raw.get(i);
        nextIds[i] = f.id;
        int j = -1;
        if (same) {
          // The same face: its tracking id, else the nearest one within an eye distance and a half.
          double best = 1.5 * f.e;
          for (int q = 0; q < before.n; q++) {
            if (taken[q]) continue;
            if (f.id >= 0 && q < ids.length && ids[q] == f.id) {
              j = q;
              break;
            }
            double d = Math.hypot(f.x - before.x[q], f.y - before.y[q]);
            if (d < best) {
              best = d;
              j = q;
            }
          }
          if (j >= 0) taken[j] = true;
        }
        if (j < 0) {
          xs[i] = f.x;
          ys[i] = f.y;
          es[i] = f.e;
          rolls[i] = f.roll;
          pads[i] = 0.25f * f.e;
          continue;
        }
        // Where the face was expected now, and how far off the find is: a still face is smoothed a lot (no jitter),
        // a moving one hardly (no lag).
        float px = before.x[j] + before.vx[j] * dt, py = before.y[j] + before.vy[j] * dt;
        float off = (float) Math.hypot(f.x - px, f.y - py) / Math.max(1f, f.e);
        float k = Math.min(1f, 0.4f + 1.6f * off);
        xs[i] = px + k * (f.x - px);
        ys[i] = py + k * (f.y - py);
        es[i] = before.e[j] + Math.min(1f, 0.35f + 2f * Math.abs(f.e - before.e[j]) / Math.max(1f, f.e)) * (f.e - before.e[j]);
        float dr = f.roll - before.roll[j];
        rolls[i] = before.roll[j] + (Math.abs(dr) > 12 ? 0.8f : 0.45f) * dr;
        // Its motion, itself smoothed, and never more than two eye distances in 100 ms.
        float cap = 2f * es[i] / 100f;
        vxs[i] = clamp(0.5f * before.vx[j] + 0.5f * (xs[i] - before.x[j]) / dt, cap);
        vys[i] = clamp(0.5f * before.vy[j] + 0.5f * (ys[i] - before.y[j]) / dt, cap);
        pads[i] = 0.12f * es[i] + Math.min(0.6f * es[i], off * es[i]);
      }
      ids = nextIds;
      return new Faces(m, xs, ys, es, rolls, vxs, vys, pads, w, h, rot, at);
    }

    private static float clamp(float v, float cap) {
      return Math.max(-cap, Math.min(cap, v));
    }

    /** A point of the upright picture back in the copy's own orientation (sw x sh). */
    static PointF back(float ux, float uy, int rot, int sw, int sh) {
      switch (rot) {
        case 90:
          return new PointF(uy, sh - ux);
        case 180:
          return new PointF(sw - ux, sh - uy);
        case 270:
          return new PointF(sw - uy, ux);
        default:
          return new PointF(ux, uy);
      }
    }
  }

  /** Google ML Kit's face detection (fast mode, eye points, tracking), its model in the APK. */
  private static final class MlKit {
    private static volatile boolean broken = false;
    private static int errors = 0;
    private static com.google.mlkit.vision.face.FaceDetector client;
    private static byte[] nv21 = new byte[0];

    static boolean works() {
      return !broken;
    }

    /** The faces in the copy, or null when finding failed (after five failures in a row, ML Kit is off for this run). */
    static List<Raw> find(byte[] copy, int sw, int sh, int rot, int w, int h) {
      try {
        if (client == null) {
          FaceDetectorOptions options =
              new FaceDetectorOptions.Builder()
                  .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                  .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                  .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                  .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
                  .setMinFaceSize(0.1f)
                  .enableTracking()
                  .build();
          client = FaceDetection.getClient(options);
          Log.i(TAG, "ML Kit face finder on");
        }
        // NV21 of the grey copy: its luma, then neutral chroma.
        int size = sw * sh, total = size + 2 * ((sw + 1) / 2) * ((sh + 1) / 2);
        if (nv21.length != total) {
          nv21 = new byte[total];
          Arrays.fill(nv21, size, total, (byte) 128);
        }
        System.arraycopy(copy, 0, nv21, 0, size);
        InputImage image = InputImage.fromByteArray(nv21, sw, sh, rot, InputImage.IMAGE_FORMAT_NV21);
        List<Face> found = Tasks.await(client.process(image), 600, TimeUnit.MILLISECONDS);
        errors = 0;
        float kx = w / (float) sw, ky = h / (float) sh, ke = (kx + ky) / 2f;
        List<Raw> out = new ArrayList<>();
        for (Face face : found) {
          if (out.size() >= MAX_FACES) break;
          Rect box = face.getBoundingBox();
          FaceLandmark a = face.getLandmark(FaceLandmark.LEFT_EYE), b = face.getLandmark(FaceLandmark.RIGHT_EYE);
          float ux, uy, eye, roll;
          if (a != null && b != null) {
            PointF pa = a.getPosition(), pb = b.getPosition();
            PointF l = pa.x <= pb.x ? pa : pb, r = pa.x <= pb.x ? pb : pa;
            ux = (l.x + r.x) / 2f;
            uy = (l.y + r.y) / 2f;
            eye = (float) Math.hypot(r.x - l.x, r.y - l.y);
            roll = (float) Math.toDegrees(Math.atan2(r.y - l.y, r.x - l.x));
          } else {
            ux = box.exactCenterX();
            uy = box.top + 0.4f * box.height();
            eye = box.width() / 2.3f;
            roll = -face.getHeadEulerAngleZ();
          }
          // A face turned sideways has its eyes closer together on the picture than its size: the box keeps the mask
          // as big as the face.
          eye = Math.max(eye, box.width() / 2.6f);
          PointF p = Detector.back(ux, uy, rot, sw, sh);
          Integer id = face.getTrackingId();
          out.add(new Raw(p.x * kx, p.y * ky, eye * ke, Math.max(-60f, Math.min(60f, roll)), id == null ? -1 : id));
        }
        return out;
      } catch (Throwable t) {
        if (t instanceof LinkageError || ++errors >= 5) {
          broken = true;
          Log.e(TAG, "ML Kit face finder off for this run: the older finder takes over", t);
        }
        return null;
      }
    }
  }

  /** android.media.FaceDetector (frontal faces, the point between the eyes): only where ML Kit doesn't run. */
  private static final class Legacy {
    private static volatile boolean broken = false;
    private static int errors = 0;
    private static FaceDetector detector;
    private static Bitmap bitmap;
    private static short[] pixels = new short[0];
    private static ShortBuffer pixelBuffer;
    private static int width = 0, height = 0;
    private static final FaceDetector.Face[] found = new FaceDetector.Face[MAX_FACES];
    private static final PointF mid = new PointF();

    static boolean works() {
      return !broken;
    }

    /** The faces in the copy, or null when none is surely there or finding failed. */
    static List<Raw> find(byte[] copy, int sw, int sh, int rot, int w, int h) {
      boolean turned = rot == 90 || rot == 270;
      int uw = turned ? sh : sw, uh = turned ? sw : sh;
      int n;
      try {
        if (detector == null || uw != width || uh != height) {
          detector = null;
          Arrays.fill(found, null);
          bitmap = Bitmap.createBitmap(uw, uh, Bitmap.Config.RGB_565);
          pixels = new short[uw * uh];
          pixelBuffer = ShortBuffer.wrap(pixels);
          width = uw;
          height = uh;
          try {
            detector = new FaceDetector(uw, uh, MAX_FACES);
          } catch (Throwable t) {
            broken = true;
            Log.e(TAG, "no face finder on this phone: whole picture in blocks", t);
            return null;
          }
        }
        // Upright grey in RGB 565 (r = g = b): the copy read along the rotation.
        for (int ry = 0; ry < uh; ry++) {
          int base, step;
          switch (rot) {
            case 90:
              base = (sh - 1) * sw + ry;
              step = -sw;
              break;
            case 180:
              base = (sh - 1 - ry) * sw + sw - 1;
              step = -1;
              break;
            case 270:
              base = sw - 1 - ry;
              step = sw;
              break;
            default:
              base = ry * sw;
              step = 1;
          }
          int o = ry * uw;
          for (int rx = 0; rx < uw; rx++) {
            int g = copy[base + rx * step] & 0xFF;
            pixels[o + rx] = (short) (((g >> 3) << 11) | ((g >> 2) << 5) | (g >> 3));
          }
        }
        ((Buffer) pixelBuffer).rewind();
        bitmap.copyPixelsFromBuffer(pixelBuffer);
        n = detector.findFaces(bitmap, found);
        errors = 0;
      } catch (Throwable t) {
        if (++errors >= 5) {
          broken = true;
          Log.e(TAG, "face finder off for this run: whole picture in blocks", t);
        }
        return null;
      }
      float kx = w / (float) sw, ky = h / (float) sh, ke = (kx + ky) / 2f;
      List<Raw> out = new ArrayList<>();
      boolean sure = false;
      for (int i = 0; i < n && i < MAX_FACES; i++) {
        FaceDetector.Face face = found[i];
        if (face == null || face.confidence() < MAYBE) continue;
        sure |= face.confidence() >= SURE;
        face.getMidPoint(mid);
        PointF p = Detector.back(mid.x, mid.y, rot, sw, sh);
        out.add(new Raw(p.x * kx, p.y * ky, face.eyesDistance() * ke, 0f, -1));
      }
      return sure ? out : null;
    }
  }
}
