package expo.modules.similaralphavideo

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.SurfaceTexture
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * A transparent video: a TextureView (not opaque) the GL renderer draws the combined picture into, and a
 * MediaPlayer decoding the stacked MP4 into the renderer's SurfaceTexture. Everything here runs on the main
 * thread; the renderer has its own GL thread. The player never asks for audio focus, so a voice room's audio is
 * not interrupted, and it is muted (volume 0) unless muted=false.
 *
 * Lifecycle: the TextureView's surface appears → renderer (EGL + OES texture + video Surface) → player. The
 * surface going away (detach) or release() (unmount) frees the player first, then the renderer.
 */
@SuppressLint("ViewConstructor")
class AlphaVideoView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext), TextureView.SurfaceTextureListener {

  private val onReady by EventDispatcher<Map<String, Any>>()
  private val onEnd by EventDispatcher<Map<String, Any>>()
  private val onError by EventDispatcher<Map<String, Any>>()

  var source: String? = null
  var loop = false
  var paused = false
  var muted = true
  var restartKey = 0

  private val main = Handler(Looper.getMainLooper())
  private val textureView = TextureView(context)
  private var renderer: AlphaVideoRenderer? = null
  private var videoSurface: Surface? = null
  private var player: MediaPlayer? = null
  private var playerSource: String? = null
  private var prepared = false
  private var ended = false
  private var appliedRestartKey = 0
  private var released = false

  init {
    textureView.isOpaque = false
    textureView.surfaceTextureListener = this
    addView(textureView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  // React Native sets this view's frame; the TextureView simply fills it.
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val w = r - l
    val h = b - t
    textureView.measure(
      View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)
    )
    textureView.layout(0, 0, w, h)
  }

  /** Called after each batch of props. */
  fun applyProps() {
    if (released) return
    if (source != playerSource) {
      releasePlayer()
      maybeCreatePlayer()
    }
    val mp = player ?: return
    // Volume and looping can't be set while preparing; onPrepared applies them.
    if (!prepared) return
    val volume = if (muted) 0f else 1f
    mp.setVolume(volume, volume)
    mp.isLooping = loop
    if (restartKey != appliedRestartKey) {
      appliedRestartKey = restartKey
      ended = false
      mp.seekTo(0)
    }
    if (paused) {
      if (mp.isPlaying) mp.pause()
    } else if (!mp.isPlaying && !ended) {
      // After the end (no loop) only a new restartKey plays it again.
      mp.start()
    }
  }

  /** Unmount: frees the player, the GL thread, its textures and EGL. Safe to call more than once. */
  fun release() {
    released = true
    releasePlayer()
    releaseRenderer()
    textureView.surfaceTextureListener = null
  }

  // --- TextureView.SurfaceTextureListener -------------------------------------------------------------------

  override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
    if (released) return
    releaseRenderer()
    val created = AlphaVideoRenderer(surface)
    renderer = created
    created.start(
      onVideoSurface = { s -> main.post { if (!released && renderer === created) onVideoSurface(s) } },
      onFailure = { message -> main.post { if (!released && renderer === created) fail(message) } }
    )
  }

  override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
    renderer?.redraw()
  }

  override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
    // The output is going away (view detached): the player stops writing first, then GL lets go of it. Returning
    // true lets the TextureView release its SurfaceTexture.
    releasePlayer()
    releaseRenderer()
    return true
  }

  override fun onSurfaceTextureUpdated(surface: SurfaceTexture) = Unit

  // --- Player -----------------------------------------------------------------------------------------------

  private fun onVideoSurface(surface: Surface) {
    videoSurface = surface
    maybeCreatePlayer()
  }

  private fun maybeCreatePlayer() {
    val src = source
    val surface = videoSurface
    if (released || player != null || src.isNullOrEmpty() || surface == null) {
      if (player == null) playerSource = null
      return
    }
    val mp = MediaPlayer()
    player = mp
    playerSource = src
    prepared = false
    ended = false
    appliedRestartKey = restartKey
    try {
      mp.setSurface(surface)
      mp.setOnVideoSizeChangedListener { _, w, h -> renderer?.setVideoSize(w, h) }
      mp.setOnPreparedListener { p -> onPrepared(p) }
      mp.setOnCompletionListener { p ->
        if (p === player && !p.isLooping) {
          ended = true
          onEnd(mapOf("at" to System.currentTimeMillis().toDouble()))
        }
      }
      mp.setOnErrorListener { p, what, extra ->
        if (p === player) fail("MediaPlayer error $what/$extra")
        true
      }
      setDataSource(mp, src)
      mp.prepareAsync()
    } catch (e: Exception) {
      fail(e.message ?: e.javaClass.simpleName)
    }
  }

  private fun onPrepared(mp: MediaPlayer) {
    if (mp !== player || released) return
    prepared = true
    val volume = if (muted) 0f else 1f
    mp.setVolume(volume, volume)
    mp.isLooping = loop
    appliedRestartKey = restartKey
    val w = mp.videoWidth
    val h = mp.videoHeight
    renderer?.setVideoSize(w, h)
    onReady(
      mapOf(
        "duration" to mp.duration / 1000.0,
        "width" to w,
        // The visible picture is the top half of the encoded frame.
        "height" to h / 2,
        "encodedHeight" to h
      )
    )
    if (paused) mp.seekTo(0) else mp.start()
  }

  /**
   * file:// paths, content:// and android.resource:// URIs, http(s) (the dev server in development builds) and a
   * bare name: a video bundled into a release build (React Native puts it in res/raw under that name).
   */
  private fun setDataSource(mp: MediaPlayer, src: String) {
    val uri = Uri.parse(src)
    when (uri.scheme) {
      null, "" -> {
        val id = context.resources.getIdentifier(src, "raw", context.packageName)
        require(id != 0) { "Bundled video not found: $src" }
        val afd = context.resources.openRawResourceFd(id)
        try {
          mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        } finally {
          afd.close()
        }
      }
      "file" -> mp.setDataSource(uri.path)
      else -> mp.setDataSource(context, uri)
    }
  }

  private fun fail(message: String) {
    releasePlayer()
    // Keeps the same source from being retried on every prop batch; a new source tries again.
    playerSource = source
    onError(mapOf("message" to message))
  }

  private fun releasePlayer() {
    val mp = player ?: return
    player = null
    prepared = false
    playerSource = null
    try {
      mp.setOnPreparedListener(null)
      mp.setOnCompletionListener(null)
      mp.setOnErrorListener(null)
      mp.setOnVideoSizeChangedListener(null)
      mp.reset()
    } catch (e: Exception) {
      // Already in an error state; release() below still frees it.
    }
    mp.release()
  }

  private fun releaseRenderer() {
    videoSurface = null
    val r = renderer ?: return
    renderer = null
    r.release()
  }
}
