package expo.modules.similaralphavideo

import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * The GL side of AlphaVideoView, on its own thread with its own EGL context. The decoder writes into an external
 * (OES) texture through a SurfaceTexture; each new frame is drawn into the TextureView's surface as one quad:
 * colour from the frame's top half, alpha from the luma of its bottom half, premultiplied, aspect-fit (the visible
 * picture is half the encoded height) on a transparent background.
 *
 * start() sets up EGL and hands the video Surface back through onVideoSurface (on the GL thread). release() tears
 * everything down on the GL thread (SurfaceTexture, Surface, texture, program, EGL surface and context) and ends
 * the thread; it waits up to 500 ms so the output surface is free before the TextureView releases it.
 */
internal class AlphaVideoRenderer(private val output: SurfaceTexture) : SurfaceTexture.OnFrameAvailableListener {
  private val thread = HandlerThread("AlphaVideoGL").apply { start() }
  private val handler = Handler(thread.looper)

  // GL-thread state.
  private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var context: EGLContext = EGL14.EGL_NO_CONTEXT
  private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE
  private var program = 0
  private var texture = 0
  private var aPosition = 0
  private var aUv = 0
  private var uTexMatrix = 0
  private var uHalfTexel = 0
  private var uSampler = 0
  private var videoTexture: SurfaceTexture? = null
  private var videoSurface: Surface? = null
  private var hasFrame = false
  private var torn = false
  private val texMatrix = FloatArray(16)
  private val quad: FloatBuffer = ByteBuffer.allocateDirect(16 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

  @Volatile private var videoWidth = 0
  @Volatile private var videoHeight = 0

  fun start(onVideoSurface: (Surface) -> Unit, onFailure: (String) -> Unit) {
    handler.post {
      try {
        setUp()
        videoSurface?.let(onVideoSurface)
      } catch (e: Exception) {
        tearDown()
        onFailure("GL: ${e.message ?: e.javaClass.simpleName}")
      }
    }
  }

  /** The decoded frame's size (encoded, both halves). */
  fun setVideoSize(width: Int, height: Int) {
    videoWidth = width
    videoHeight = height
    redraw()
  }

  /** Draws the last frame again (the view's size or the video size changed while paused). */
  fun redraw() {
    handler.post { draw(update = false) }
  }

  fun release() {
    val done = CountDownLatch(1)
    val posted = handler.post {
      tearDown()
      done.countDown()
    }
    if (posted) {
      try {
        done.await(500, TimeUnit.MILLISECONDS)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
    // Frames still queued after the teardown find torn = true and do nothing.
    thread.quitSafely()
  }

  override fun onFrameAvailable(surfaceTexture: SurfaceTexture) {
    // Delivered on the GL thread (setOnFrameAvailableListener with our handler).
    draw(update = true)
  }

  // --- GL thread --------------------------------------------------------------------------------------------

  private fun setUp() {
    display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    check(display != EGL14.EGL_NO_DISPLAY) { "no EGL display" }
    val version = IntArray(2)
    check(EGL14.eglInitialize(display, version, 0, version, 1)) { "eglInitialize failed" }
    val attribs = intArrayOf(
      EGL14.EGL_RED_SIZE, 8,
      EGL14.EGL_GREEN_SIZE, 8,
      EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_ALPHA_SIZE, 8,
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT,
      EGL14.EGL_NONE
    )
    val configs = arrayOfNulls<EGLConfig>(1)
    val count = IntArray(1)
    check(EGL14.eglChooseConfig(display, attribs, 0, configs, 0, 1, count, 0) && count[0] > 0) { "no RGBA8888 EGL config" }
    val config = configs[0]!!
    context = EGL14.eglCreateContext(display, config, EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
    check(context != EGL14.EGL_NO_CONTEXT) { "eglCreateContext failed" }
    eglSurface = EGL14.eglCreateWindowSurface(display, config, output, intArrayOf(EGL14.EGL_NONE), 0)
    check(eglSurface != EGL14.EGL_NO_SURFACE) { "eglCreateWindowSurface failed" }
    check(EGL14.eglMakeCurrent(display, eglSurface, eglSurface, context)) { "eglMakeCurrent failed" }

    program = buildProgram()
    aPosition = GLES20.glGetAttribLocation(program, "aPosition")
    aUv = GLES20.glGetAttribLocation(program, "aUv")
    uTexMatrix = GLES20.glGetUniformLocation(program, "uTexMatrix")
    uHalfTexel = GLES20.glGetUniformLocation(program, "uHalfTexel")
    uSampler = GLES20.glGetUniformLocation(program, "uTexture")

    val ids = IntArray(1)
    GLES20.glGenTextures(1, ids, 0)
    texture = ids[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texture)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

    val st = SurfaceTexture(texture)
    st.setOnFrameAvailableListener(this, handler)
    videoTexture = st
    videoSurface = Surface(st)

    // Transparent until the first frame arrives.
    GLES20.glClearColor(0f, 0f, 0f, 0f)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
    EGL14.eglSwapBuffers(display, eglSurface)
  }

  private fun draw(update: Boolean) {
    if (torn || eglSurface == EGL14.EGL_NO_SURFACE) return
    val st = videoTexture ?: return
    try {
      if (!EGL14.eglMakeCurrent(display, eglSurface, eglSurface, context)) return
      if (update) {
        st.updateTexImage()
        hasFrame = true
      }
      if (!hasFrame) return
      st.getTransformMatrix(texMatrix)

      val size = IntArray(1)
      EGL14.eglQuerySurface(display, eglSurface, EGL14.EGL_WIDTH, size, 0)
      val w = size[0]
      EGL14.eglQuerySurface(display, eglSurface, EGL14.EGL_HEIGHT, size, 0)
      val h = size[0]
      GLES20.glViewport(0, 0, w, h)
      GLES20.glClearColor(0f, 0f, 0f, 0f)
      GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

      val vw = videoWidth
      val vh = videoHeight
      if (w > 0 && h > 0 && vw > 0 && vh > 1) {
        // Aspect-fit the visible picture (vw × vh/2) into the view, centred; half extents in clip space.
        val scale = min(w.toFloat() / vw, h.toFloat() / (vh / 2f))
        val sx = vw * scale / w
        val sy = (vh / 2f) * scale / h
        quad.clear()
        quad.put(floatArrayOf(
          -sx, -sy, 0f, 0f,
          sx, -sy, 1f, 0f,
          -sx, sy, 0f, 1f,
          sx, sy, 1f, 1f
        ))
        GLES20.glUseProgram(program)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texture)
        GLES20.glUniform1i(uSampler, 0)
        GLES20.glUniformMatrix4fv(uTexMatrix, 1, false, texMatrix, 0)
        GLES20.glUniform1f(uHalfTexel, 0.5f / vh)
        quad.position(0)
        GLES20.glVertexAttribPointer(aPosition, 2, GLES20.GL_FLOAT, false, 16, quad)
        GLES20.glEnableVertexAttribArray(aPosition)
        quad.position(2)
        GLES20.glVertexAttribPointer(aUv, 2, GLES20.GL_FLOAT, false, 16, quad)
        GLES20.glEnableVertexAttribArray(aUv)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(aPosition)
        GLES20.glDisableVertexAttribArray(aUv)
      }
      EGL14.eglSwapBuffers(display, eglSurface)
    } catch (e: RuntimeException) {
      // updateTexImage after the SurfaceTexture was abandoned (the view is going away): nothing to draw.
    }
  }

  private fun tearDown() {
    if (torn) return
    torn = true
    videoTexture?.setOnFrameAvailableListener(null)
    videoSurface?.release()
    videoSurface = null
    videoTexture?.release()
    videoTexture = null
    if (display != EGL14.EGL_NO_DISPLAY) {
      if (context != EGL14.EGL_NO_CONTEXT && eglSurface != EGL14.EGL_NO_SURFACE) {
        EGL14.eglMakeCurrent(display, eglSurface, eglSurface, context)
        if (texture != 0) GLES20.glDeleteTextures(1, intArrayOf(texture), 0)
        if (program != 0) GLES20.glDeleteProgram(program)
      }
      texture = 0
      program = 0
      EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
      if (eglSurface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, eglSurface)
      if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context)
      EGL14.eglReleaseThread()
      // No eglTerminate: the default display is shared by the whole process (WebRTC's video renders on it too).
    }
    eglSurface = EGL14.EGL_NO_SURFACE
    context = EGL14.EGL_NO_CONTEXT
    display = EGL14.EGL_NO_DISPLAY
  }

  private fun buildProgram(): Int {
    val vs = compile(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER)
    val fs = compile(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER)
    val p = GLES20.glCreateProgram()
    GLES20.glAttachShader(p, vs)
    GLES20.glAttachShader(p, fs)
    GLES20.glLinkProgram(p)
    // The program keeps the shaders; flagging them now frees them with it.
    GLES20.glDeleteShader(vs)
    GLES20.glDeleteShader(fs)
    val status = IntArray(1)
    GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, status, 0)
    if (status[0] == 0) {
      val log = GLES20.glGetProgramInfoLog(p)
      GLES20.glDeleteProgram(p)
      throw IllegalStateException("link: $log")
    }
    return p
  }

  private fun compile(type: Int, source: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, source)
    GLES20.glCompileShader(shader)
    val status = IntArray(1)
    GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
    if (status[0] == 0) {
      val log = GLES20.glGetShaderInfoLog(shader)
      GLES20.glDeleteShader(shader)
      throw IllegalStateException("shader: $log")
    }
    return shader
  }

  private companion object {
    // aUv runs (0,0) bottom-left to (1,1) top-right of the visible picture (GL orientation, as uTexMatrix expects).
    // Top-down that is colour at (u, v·0.5) and alpha at (u, 0.5 + v·0.5) of the decoded frame; bottom-up (GL)
    // the colour half is v 0.5…1 and the mask half v 0…0.5. Half a texel is kept off the seam on both sides so
    // linear filtering never mixes a colour row with a mask row.
    val VERTEX_SHADER = """
      attribute vec4 aPosition;
      attribute vec2 aUv;
      uniform mat4 uTexMatrix;
      uniform float uHalfTexel;
      varying vec2 vColor;
      varying vec2 vAlpha;
      void main() {
        gl_Position = aPosition;
        float colorV = 0.5 + uHalfTexel + (0.5 - uHalfTexel) * aUv.y;
        float alphaV = (0.5 - uHalfTexel) * aUv.y;
        vColor = (uTexMatrix * vec4(aUv.x, colorV, 0.0, 1.0)).xy;
        vAlpha = (uTexMatrix * vec4(aUv.x, alphaV, 0.0, 1.0)).xy;
      }
    """.trimIndent()

    // The mask is grey, so its luma (BT.709 weights) is the alpha. Output premultiplied, as Android composes it.
    val FRAGMENT_SHADER = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      uniform samplerExternalOES uTexture;
      varying vec2 vColor;
      varying vec2 vAlpha;
      void main() {
        vec3 rgb = texture2D(uTexture, vColor).rgb;
        float a = clamp(dot(texture2D(uTexture, vAlpha).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        gl_FragColor = vec4(rgb * a, a);
      }
    """.trimIndent()
  }
}
