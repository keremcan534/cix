// Bilye Şelalesi: the path the screen shows for a round. The round's target is already decided (lib/bilye/rules,
// the server in a live build); this picks one of the recorded launches of that strength that really end there
// (lib/bilye/table SEEDS) and flies it again, so the ball's every bounce is the simulation's own.
//
// Pure functions only (no app, storage or React imports).
import { BALL_R, FIELD, HEIGHT, LAUNCH, RAIL_Y, WIDTH, type Lane } from '@/lib/bilye/board';
import { fly, type Flight } from '@/lib/bilye/physics';
import type { BilyeRound } from '@/lib/bilye/rules';
import { SEEDS } from '@/lib/bilye/table';

/** The launch channel's centre line, right of the field. */
export const CHANNEL_X = FIELD + (WIDTH - FIELD) / 2;
/** Frames of the shot up the channel and over the top rail, before the field. */
const UP_FRAMES = 30;
const OVER_FRAMES = 22;

export type BilyePath = Flight & {
  /** Frames before the ball enters the field (its hits count from there). */
  lead: number;
};

/** The flight into `round.target`, with the shot up the channel in front of it. */
export function bilyePath(round: BilyeRound): BilyePath {
  const seeds = SEEDS[round.lane][round.target];
  const flight = fly(round.lane, seeds[round.variant % seeds.length]);
  const lead: number[] = [];
  // Up the channel, slowing towards the top.
  const bottom = HEIGHT - BALL_R - 6;
  for (let i = 0; i < UP_FRAMES; i++) {
    const t = i / UP_FRAMES;
    const ease = 1 - (1 - t) * (1 - t);
    lead.push(CHANNEL_X, bottom + (RAIL_Y - bottom) * ease);
  }
  // Round the corner at the top and along the rail to where the field takes over.
  const x0 = flight.points[0];
  const y0 = flight.points[1];
  for (let i = 0; i < OVER_FRAMES; i++) {
    const t = i / OVER_FRAMES;
    const lift = 4 * t * (1 - t);
    lead.push(CHANNEL_X + (x0 - CHANNEL_X) * t, RAIL_Y + (y0 - RAIL_Y) * t - lift * 10);
  }
  const frames = lead.length / 2;
  return {
    target: flight.target,
    points: [...lead, ...flight.points],
    hits: flight.hits.map((h) => ({ frame: h.frame + frames, peg: h.peg })),
    lead: frames,
  };
}

/** Where a strength's balls leave the rail (for the aim mark on the board). */
export const launchX = (lane: Lane) => LAUNCH[lane].x;
