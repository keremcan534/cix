// Şeffaf video (POC), iOS: AVPlayer + AVPlayerLayer with BGRA pixel buffers and a clear background; a Core Image
// video composition puts the stacked frame back together (colour = top half, mask = bottom half, output half
// height). UNBUILT AND UNTESTED: the iOS app has never been built (no Mac, no Apple account).
import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import ExpoModulesCore
import UIKit

public final class AlphaVideoView: ExpoView {
  let onReady = EventDispatcher()
  let onEnd = EventDispatcher()
  let onError = EventDispatcher()

  var source: String?
  var loop = false
  var paused = false
  var muted = true
  var restartKey = 0

  private let player = AVPlayer()
  private let playerLayer = AVPlayerLayer()
  private var loadedSource: String?
  private var appliedRestartKey = 0
  private var statusObservation: NSKeyValueObservation?
  private var endObserver: NSObjectProtocol?
  private var loadTask: Task<Void, Never>?
  private var ready = false
  private var ended = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    isOpaque = false
    clipsToBounds = true
    player.isMuted = true
    player.actionAtItemEnd = .pause
    player.automaticallyWaitsToMinimizeStalling = false
    playerLayer.player = player
    playerLayer.videoGravity = .resizeAspect
    playerLayer.backgroundColor = UIColor.clear.cgColor
    playerLayer.isOpaque = false
    playerLayer.pixelBufferAttributes = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    layer.addSublayer(playerLayer)
  }

  deinit {
    loadTask?.cancel()
    statusObservation?.invalidate()
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    player.pause()
    player.replaceCurrentItem(with: nil)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    playerLayer.frame = bounds
    CATransaction.commit()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    updatePlayback()
  }

  /** Called after each batch of props. */
  func applyProps() {
    player.isMuted = muted
    if source != loadedSource {
      load(source)
    }
    if ready && restartKey != appliedRestartKey {
      appliedRestartKey = restartKey
      ended = false
      player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
    }
    updatePlayback()
  }

  private func updatePlayback() {
    guard ready else { return }
    if paused || ended || window == nil {
      player.pause()
    } else {
      player.play()
    }
  }

  private func unload() {
    loadTask?.cancel()
    loadTask = nil
    statusObservation?.invalidate()
    statusObservation = nil
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    endObserver = nil
    ready = false
    ended = false
    player.pause()
    player.replaceCurrentItem(with: nil)
  }

  private func load(_ src: String?) {
    unload()
    loadedSource = src
    guard let src, !src.isEmpty else { return }
    guard let url = Self.url(from: src) else {
      onError(["message": "Invalid source: \(src)"])
      return
    }
    let asset = AVURLAsset(url: url)
    loadTask = Task { @MainActor [weak self] in
      do {
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
          self?.onError(["message": "No video track"])
          return
        }
        let natural = try await track.load(.naturalSize)
        let duration = try await asset.load(.duration)
        guard let self, !Task.isCancelled, self.loadedSource == src else { return }
        self.start(asset: asset, natural: natural, duration: duration)
      } catch {
        guard let self, !Task.isCancelled, self.loadedSource == src else { return }
        self.onError(["message": error.localizedDescription])
      }
    }
  }

  private func start(asset: AVURLAsset, natural: CGSize, duration: CMTime) {
    let visibleHeight = (natural.height / 2).rounded(.down)
    let composition = AVMutableVideoComposition(asset: asset, applyingCIFiltersWithHandler: Self.combine)
    composition.renderSize = CGSize(width: natural.width, height: visibleHeight)
    let item = AVPlayerItem(asset: asset)
    item.videoComposition = composition
    appliedRestartKey = restartKey

    statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      DispatchQueue.main.async {
        guard let self, self.player.currentItem === item else { return }
        switch item.status {
        case .readyToPlay:
          guard !self.ready else { return }
          self.ready = true
          self.onReady([
            "duration": CMTimeGetSeconds(duration),
            "width": Double(natural.width),
            "height": Double(visibleHeight),
            "encodedHeight": Double(natural.height),
          ])
          self.updatePlayback()
        case .failed:
          self.onError(["message": item.error?.localizedDescription ?? "Playback failed"])
        default:
          break
        }
      }
    }
    endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
      guard let self else { return }
      if self.loop {
        self.player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
        self.player.play()
      } else {
        self.ended = true
        self.onEnd(["at": Date().timeIntervalSince1970 * 1000])
      }
    }
    player.replaceCurrentItem(with: item)
  }

  /// One frame: the source is w × 2h; Core Image's origin is bottom-left, so the colour (top half) is y h…2h and
  /// the mask (bottom half) y 0…h. The colour is moved down onto the mask and blended over a clear image with it.
  /// Core Image works in linear light, so the mask (encoded values) is turned back to its encoded curve first;
  /// otherwise a 50% grey would act as about 21% alpha. To check on a device.
  private static func combine(_ request: AVAsynchronousCIImageFilteringRequest) {
    let source = request.sourceImage
    let width = source.extent.width
    let h = (source.extent.height / 2).rounded(.down)
    let visible = CGRect(x: 0, y: 0, width: width, height: h)
    let color = source
      .cropped(to: CGRect(x: 0, y: source.extent.height - h, width: width, height: h))
      .transformed(by: CGAffineTransform(translationX: 0, y: -(source.extent.height - h)))
    let mask = source.cropped(to: visible).applyingFilter("CILinearToSRGBToneCurve")
    let blend = CIFilter.blendWithMask()
    blend.inputImage = color
    blend.backgroundImage = CIImage(color: .clear).cropped(to: visible)
    blend.maskImage = mask
    request.finish(with: (blend.outputImage ?? color).cropped(to: visible), context: nil)
  }

  private static func url(from src: String) -> URL? {
    if src.hasPrefix("/") {
      return URL(fileURLWithPath: src)
    }
    return URL(string: src)
  }
}
