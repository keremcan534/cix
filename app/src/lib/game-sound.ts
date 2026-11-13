// Game sounds: short effects (assets/sfx, made by scripts/make-sfx.py) the games play at the "Oyun sesi" level
// (Settings.gameVolume; 0 is off). They mix with whatever else is playing: a room's voices and music are never
// paused or turned down for them. Sound is a nicety like haptics: a device or browser that can't play one must
// never break the round, so every call here is safe to make anywhere.
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { ensureMixAudioMode } from '@/lib/audio-mode';

const SRC = {
  tap: require('../../assets/sfx/tap.wav'),
  chip: require('../../assets/sfx/chip.wav'),
  spin: require('../../assets/sfx/spin.wav'),
  tick: require('../../assets/sfx/tick.wav'),
  stop: require('../../assets/sfx/stop.wav'),
  coin: require('../../assets/sfx/coin.wav'),
  win: require('../../assets/sfx/win.wav'),
  winBig: require('../../assets/sfx/win-big.wav'),
  jackpot: require('../../assets/sfx/jackpot.wav'),
  lose: require('../../assets/sfx/lose.wav'),
  tease: require('../../assets/sfx/tease.wav'),
  launch: require('../../assets/sfx/launch.wav'),
  boom: require('../../assets/sfx/boom.wav'),
  cashout: require('../../assets/sfx/cashout.wav'),
  card: require('../../assets/sfx/card.wav'),
  dice: require('../../assets/sfx/dice.wav'),
  move: require('../../assets/sfx/move.wav'),
  capture: require('../../assets/sfx/capture.wav'),
  turn: require('../../assets/sfx/turn.wav'),
  shot: require('../../assets/sfx/shot.wav'),
  splash: require('../../assets/sfx/splash.wav'),
  fanfare: require('../../assets/sfx/fanfare.wav'),
} as const;
export type Sfx = keyof typeof SRC;
export const SFX_NAMES = Object.keys(SRC) as Sfx[];

/** Sounds that follow each other faster than they end keep this many players, so one doesn't cut the other off. */
const VOICES: Partial<Record<Sfx, number>> = { tick: 3, coin: 3, stop: 2, chip: 2, move: 2, card: 2, shot: 2 };

// Synced from Settings.gameVolume by the store; module-level so plain event handlers can call playSfx.
let volume = 0.4;
export function setGameVolume(v: number) {
  volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
export const gameVolume = () => volume;

const players = new Map<Sfx, { list: AudioPlayer[]; next: number }>();

/** Plays one effect; `gain` scales it against the others (a quiet tick, a full fanfare). */
export function playSfx(name: Sfx, gain = 1) {
  if (volume <= 0) return;
  try {
    // The same mode the room's music asks for, set once per app run (lib/audio-mode: again in a room broke its echo
    // cancellation).
    void ensureMixAudioMode();
    let e = players.get(name);
    if (!e) players.set(name, (e = { list: [], next: 0 }));
    let p = e.list[e.next];
    if (!p) p = e.list[e.next] = createAudioPlayer(SRC[name]);
    e.next = (e.next + 1) % (VOICES[name] ?? 1);
    p.volume = Math.max(0, Math.min(1, volume * gain));
    void p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // No audio on this device or in this browser: the game goes on without it.
  }
}

/** Loads the effects a screen is about to use, so the first one isn't late. */
export function warmSfx(names: readonly Sfx[]) {
  if (volume <= 0) return;
  try {
    for (const n of names) {
      const e = players.get(n) ?? { list: [], next: 0 };
      if (!e.list[0]) e.list[0] = createAudioPlayer(SRC[n]);
      players.set(n, e);
    }
  } catch {
    // As in playSfx.
  }
}
