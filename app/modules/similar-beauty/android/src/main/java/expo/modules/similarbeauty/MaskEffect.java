package expo.modules.similarbeauty;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.graphics.Rect;
import android.graphics.RectF;
import android.media.FaceDetector;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.Buffer;
import java.nio.ByteBuffer;
import java.nio.ShortBuffer;
import java.util.Arrays;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Maske for the camera in video calls, so the other side can't recognize me: a video effect of the WebRTC library
 * (com.oney.WebRTCModule.videoEffects, named NAME) that runs right after the beauty filter (BeautyEffect) on my camera
 * track. Kinds: off (the frame passes untouched), eyes (a masquerade over the eyes), mosaic (the face in big blocks),
 * emoji (an emoji over the face). The face is found by android.media.FaceDetector in a small grey copy of the frame
 * turned upright, on a background thread at most five times a second, never holding up a frame; the mask stays where
 * the face was last found, smoothed, with a margin for the way it moves. Privacy first: while a mask is on and no face
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
  /** Faces are looked for at most this often (ms): five times a second. */
  private static final long FIND_EVERY_MS = 200;
  /** A face found this long ago (ms) still places the mask; after that the whole picture goes in blocks. */
  private static final long HOLD_MS = 700;
  /** The short side of the grey copy (px). The finder needs 20 px between the eyes in it: a face at arm's length. */
  private static final int SNAP = 240;
  private static final int MAX_FACES = 3;
  /** A face is surely there (FaceDetector.Face.CONFIDENCE_THRESHOLD); a weaker one next to it is covered too. */
  private static final float SURE = 0.4f, MAYBE = 0.3f;
  /** U+1F60A, smiling face with smiling eyes (from its code point: the source stays ASCII). */
  private static final String EMOJI_TEXT = new String(Character.toChars(0x1F60A));

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
  private Sprite sprite;
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
    for (int i = 0; i < seen.n; i++) {
      float e = seen.e[i] * zoom;
      float pad = seen.pad[i] * zoom;
      // The mask's centre and half size, upright, in eye distances from the point between the eyes.
      float ox, oy, hw, hh;
      if (k == EYES) {
        ox = 0f;
        oy = -0.1f;
        hw = 1.45f;
        hh = 0.68f;
      } else if (k == EMOJI) {
        ox = 0f;
        oy = 0.15f;
        hw = 2.1f;
        hh = 2.1f;
      } else {
        ox = 0f;
        oy = 0.15f;
        hw = 1.8f;
        hh = 2.2f;
      }
      // In the frame's own orientation: the offset turned with the rotation, the sizes swapped on a quarter turn.
      float dx = ox * e, dy = oy * e, bx, by;
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
      float cx = seen.x[i] * zoom + bx, cy = seen.y[i] * zoom + by;
      float halfX = (turned ? hh : hw) * e + pad, halfY = (turned ? hw : hh) * e + pad;
      // Even edges, so the chroma box (half of it) lines up with the luma one.
      int x0 = ((int) Math.floor(cx - halfX)) & ~1, y0 = ((int) Math.floor(cy - halfY)) & ~1;
      int x1 = (((int) Math.ceil(cx + halfX)) + 1) & ~1, y1 = (((int) Math.ceil(cy + halfY)) + 1) & ~1;
      if (k == MOSAIC) {
        int block = Math.max(8, Math.round(3.6f * e / 7f)) & ~1;
        blocks(y, sy, Math.max(0, x0), Math.max(0, y0), Math.min(w, x1), Math.min(h, y1), x0, y0, block);
        int cx0 = Math.max(0, x0 / 2), cy0 = Math.max(0, y0 / 2), cx1 = Math.min(cw, x1 / 2), cy1 = Math.min(ch, y1 / 2);
        blocks(u, su, cx0, cy0, cx1, cy1, x0 / 2, y0 / 2, block / 2);
        blocks(v, sv, cx0, cy0, cx1, cy1, x0 / 2, y0 / 2, block / 2);
      } else {
        Sprite s = sprite(k, rot);
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

  private Sprite sprite(int k, int rot) {
    Sprite s = sprite;
    if (s == null || s.kind != k || s.rot != rot) {
      s = render(k, rot);
      sprite = s;
    }
    return s;
  }

  /**
   * The mask drawn upright (emoji 256 x 256, eyes 288 x 136) and turned back by the frame's rotation, so it is upright
   * on the other side's screen; in YUV with its alpha (chroma: each 2 x 2, weighted by alpha).
   */
  private static Sprite render(int k, int rot) {
    int pw = k == EMOJI ? 256 : 288, ph = k == EMOJI ? 256 : 136;
    boolean turned = rot == 90 || rot == 270;
    int w = turned ? ph : pw, h = turned ? pw : ph;
    Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    canvas.translate(w / 2f, h / 2f);
    canvas.rotate(-rot);
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
    return new Sprite(k, rot, w, h, ys, as, us, vs, cas);
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

  /** An emoji face over a disc of its yellow: the disc covers the face even where the emoji font draws less. */
  private static void drawEmoji(Canvas canvas, int size) {
    float c = size / 2f;
    Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);
    disc.setColor(0xFFFFC93C);
    canvas.drawCircle(c, c, size * 0.48f, disc);
    Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    text.setTextSize(size * 0.8f);
    Rect bounds = new Rect();
    text.getTextBounds(EMOJI_TEXT, 0, EMOJI_TEXT.length(), bounds);
    int big = Math.max(bounds.width(), bounds.height());
    if (big > 0) {
      text.setTextSize(text.getTextSize() * size * 0.98f / big);
      text.getTextBounds(EMOJI_TEXT, 0, EMOJI_TEXT.length(), bounds);
    }
    canvas.drawText(EMOJI_TEXT, c - bounds.exactCenterX(), c - bounds.exactCenterY(), text);
  }

  /** A masquerade over both eyes and the brows: dark satin with a gold rim, closed (nothing of the eyes shows). */
  private static void drawEyes(Canvas canvas, int w, int h) {
    float rim = h * 0.06f;
    Matrix fit = new Matrix();
    fit.setScale((w - 2 * rim) / 100f, (h - 2 * rim) / 100f);
    fit.postTranslate(rim, rim);
    // The outline on a 100 x 100 grid: two lobes, a dip over the bridge of the nose, a notch for the nose.
    Path mask = new Path();
    mask.moveTo(0, 42);
    mask.cubicTo(4, 10, 20, 0, 30, 2);
    mask.cubicTo(40, 4, 46, 16, 50, 18);
    mask.cubicTo(54, 16, 60, 4, 70, 2);
    mask.cubicTo(80, 0, 96, 10, 100, 42);
    mask.cubicTo(98, 80, 86, 100, 72, 98);
    mask.cubicTo(62, 96, 56, 74, 50, 72);
    mask.cubicTo(44, 74, 38, 96, 28, 98);
    mask.cubicTo(14, 100, 2, 80, 0, 42);
    mask.close();
    mask.transform(fit);
    Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    fill.setColor(0xFF1B1026);
    canvas.drawPath(mask, fill);
    Paint lid = new Paint(Paint.ANTI_ALIAS_FLAG);
    lid.setColor(0xFF33224A);
    RectF eye = new RectF(20, 44, 43, 68);
    fit.mapRect(eye);
    canvas.drawOval(eye, lid);
    eye.set(57, 44, 80, 68);
    fit.mapRect(eye);
    canvas.drawOval(eye, lid);
    Paint edge = new Paint(Paint.ANTI_ALIAS_FLAG);
    edge.setStyle(Paint.Style.STROKE);
    edge.setStrokeWidth(rim);
    edge.setColor(0xFFE9C46A);
    canvas.drawPath(mask, edge);
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

  /** Faces found in one copy, in the frame's coordinates: the point between the eyes, the eye distance, a margin. */
  private static final class Faces {
    final int n, w, h, rot;
    final long at;
    final float[] x, y, e, pad;

    Faces(int n, float[] x, float[] y, float[] e, float[] pad, int w, int h, int rot, long at) {
      this.n = n;
      this.x = x;
      this.y = y;
      this.e = e;
      this.pad = pad;
      this.w = w;
      this.h = h;
      this.rot = rot;
      this.at = at;
    }

    /** The face closest to (px, py), or -1. */
    int nearest(float px, float py) {
      int best = -1;
      double bestD = Double.MAX_VALUE;
      for (int i = 0; i < n; i++) {
        double d = Math.hypot(px - x[i], py - y[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }
  }

  /** A mask picture in the frame's orientation: luma and its alpha (w x h, both even), chroma and alpha at half. */
  private static final class Sprite {
    final int kind, rot, w, h;
    final byte[] y, a, u, v, ca;

    Sprite(int kind, int rot, int w, int h, byte[] y, byte[] a, byte[] u, byte[] v, byte[] ca) {
      this.kind = kind;
      this.rot = rot;
      this.w = w;
      this.h = h;
      this.y = y;
      this.a = a;
      this.u = u;
      this.v = v;
      this.ca = ca;
    }
  }

  /** android.media.FaceDetector, on the finder's thread only (one detector, kept while the copy's size stays). */
  private static final class Detector {
    private static volatile boolean broken = false;
    private static int errors = 0;
    private static FaceDetector detector;
    private static Bitmap bitmap;
    private static short[] pixels = new short[0];
    private static ShortBuffer pixelBuffer;
    private static int width = 0, height = 0;
    private static final FaceDetector.Face[] found = new FaceDetector.Face[MAX_FACES];
    private static final PointF mid = new PointF();

    /** False once the finder failed for good on this phone: then the whole picture stays in blocks. */
    static boolean works() {
      return !broken;
    }

    /**
     * The faces in a grey copy (sw x sh, the frame's orientation turned by `rot` to be upright), in the frame's
     * coordinates (w x h), smoothed with the faces found before; null when no face is surely there.
     */
    static synchronized Faces find(byte[] copy, int sw, int sh, int rot, int w, int h, long at, Faces before) {
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
      float[] xs = new float[MAX_FACES], ys = new float[MAX_FACES], es = new float[MAX_FACES], pads = new float[MAX_FACES];
      int m = 0;
      boolean sure = false;
      for (int i = 0; i < n && i < MAX_FACES; i++) {
        FaceDetector.Face face = found[i];
        if (face == null || face.confidence() < MAYBE) continue;
        sure |= face.confidence() >= SURE;
        face.getMidPoint(mid);
        // Back from upright to the copy's own orientation, then to the frame's size.
        float bx, by;
        switch (rot) {
          case 90:
            bx = mid.y;
            by = sh - mid.x;
            break;
          case 180:
            bx = sw - mid.x;
            by = sh - mid.y;
            break;
          case 270:
            bx = sw - mid.y;
            by = mid.x;
            break;
          default:
            bx = mid.x;
            by = mid.y;
        }
        xs[m] = bx * kx;
        ys[m] = by * ky;
        es[m] = face.eyesDistance() * ke;
        m++;
      }
      if (!sure) return null;
      // Smoothed with the face found before nearest to it when it barely moved (less jitter), and a margin at least as
      // big as its last move (up to 1.5 eye distances): it goes on moving until the next find.
      boolean same = before != null && before.w == w && before.h == h && before.rot == rot && at - before.at < 1000;
      for (int i = 0; i < m; i++) {
        float e = es[i];
        float pad = 0.25f * e;
        int j = same ? before.nearest(xs[i], ys[i]) : -1;
        if (j >= 0) {
          float d = (float) Math.hypot(xs[i] - before.x[j], ys[i] - before.y[j]);
          if (d < 0.5f * e) {
            xs[i] = before.x[j] + 0.65f * (xs[i] - before.x[j]);
            ys[i] = before.y[j] + 0.65f * (ys[i] - before.y[j]);
            es[i] = before.e[j] + 0.5f * (e - before.e[j]);
          }
          pad = Math.max(pad, Math.max(d, 0.6f * before.pad[j]));
        }
        pads[i] = Math.min(pad, 1.5f * es[i]);
      }
      return new Faces(m, xs, ys, es, pads, w, h, rot, at);
    }
  }
}
