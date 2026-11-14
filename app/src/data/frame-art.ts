// The illustrated frames' measurements (assets/frames; components/fx/frame-art draws them), as shares of the
// picture's side: `hole` is the radius of the empty centre the photo sits in, `reach` how far the picture goes from
// its centre to the side, up and down (the wings, the crown, the hanging gems). Measured from each picture's opaque
// pixels, so a seat can keep the whole picture inside its own cell (lib/seat-cell).
export type FrameArtSize = { hole: number; reach: { x: number; top: number; bottom: number } };

export const FRAME_ART_SIZES: Record<string, FrameArtSize> = {
  'fr-silver': { hole: 0.2775, reach: { x: 0.417, top: 0.489, bottom: 0.439 } },
  'fr-frost': { hole: 0.2411, reach: { x: 0.367, top: 0.489, bottom: 0.389 } },
  'fr-rose': { hole: 0.2441, reach: { x: 0.362, top: 0.489, bottom: 0.373 } },
  'fr-laurel': { hole: 0.2502, reach: { x: 0.37, top: 0.492, bottom: 0.381 } },
  'fr-crown-silver': { hole: 0.2091, reach: { x: 0.323, top: 0.492, bottom: 0.437 } },
  'fr-crown-gold': { hole: 0.1777, reach: { x: 0.303, top: 0.478, bottom: 0.431 } },
  'fr-wing-coral': { hole: 0.2065, reach: { x: 0.32, top: 0.456, bottom: 0.437 } },
  'fr-wing-sky': { hole: 0.2092, reach: { x: 0.325, top: 0.464, bottom: 0.442 } },
};
