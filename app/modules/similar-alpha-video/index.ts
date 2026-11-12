// Şeffaf video (POC, yöntem D): one H.264 MP4 whose frame is stacked, colour in the TOP half and the alpha mask
// as greyscale in the BOTTOM half (scripts/alpha-stack.sh makes it). The platform's hardware decoder reads it and
// the GPU puts it back together: Android MediaPlayer → SurfaceTexture → OpenGL ES 2.0 on a TextureView (android/);
// iOS AVPlayer + a Core Image video composition (ios/, never built or tested). The web shows nothing.
// Props: source, loop, paused, muted (default true), restartKey (play again from 0); events onReady, onEnd, onError.
// Unmounting releases the player, textures and EGL. Only the admin test panel uses it (docs/SEFFAF_VIDEO_POC.md).
export { AlphaVideoView, alphaVideoAvailable, alphaVideoMemory } from './src/AlphaVideoView';
export type { AlphaVideoError, AlphaVideoMemory, AlphaVideoProps, AlphaVideoReady } from './src/types';
