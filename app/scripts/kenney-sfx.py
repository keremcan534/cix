#!/usr/bin/env python3
"""The games' sounds from real recordings, all by Kenney (kenney.nl, CC0: free for commercial use, no credit needed),
the packs downloaded from OpenGameArt (docs/VARLIK_KAYNAKLARI.md lists each pack and its page):

- Casino Audio: chips, cards and dice (the table sounds), the thunk of a reel coming to rest.
- 85 Short music jingles: the wins' music (steel drums, pizzicato strings, saxophone, 8-bit, played together in
  unison for the bigger wins) and the lost round.
- Sci-Fi Sounds: the rocket's engine and explosion, the blows of a win's show, the climbing whoosh, the metal body
  of the slot machine's clunks.
- RPG sound effects: coins, the lever's latch and clicks. UI SFX Set: the reels' ratchet.
- Interface Sounds: the ring of a coin and of a cash-out, the button press.

Writes 44.1 kHz 16-bit mono WAV files into assets/sfx under the names lib/game-sound.ts loads. scripts/make-sfx.py
makes the rest from code and leaves these names alone (its RECORDED list).

Run: python3 scripts/kenney-sfx.py <folder with the unzipped packs> [name ...]   (needs ffmpeg on the PATH)
Clips are found by file name anywhere under the folder; no names: all of them. The packs themselves are not kept in
the repository; only the files made from them are."""
import os
import subprocess
import sys
import wave

import numpy as np

SR = 44100
MUSIC = 0.27  # the music's loudness (the RMS of its loudest 300 ms): every jingle sounds as loud as the others
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
FILES = {}


def find(src):
    """Every clip under `src` by file name (without extension)."""
    for root, _, names in os.walk(src):
        for n in names:
            stem, ext = os.path.splitext(n)
            if ext.lower() in ('.ogg', '.mp3', '.wav'):
                FILES.setdefault(stem, []).append(os.path.join(root, n))


def load(_src, name, exact=False):
    """A Kenney clip as mono floats at SR (ffmpeg decodes it). `exact`: decoded as floats, so the peaks an Ogg file
    overshoots by aren't clipped (the table sounds were made from 16-bit samples and stay so)."""
    paths = FILES.get(name, [])
    if len(paths) != 1:
        sys.exit(f'{name}: {"not found" if not paths else "found twice: " + ", ".join(paths)}')
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', paths[0], '-ac', '1', '-ar', str(SR), '-f', 'f32le' if exact else 's16le', '-'],
        check=True, capture_output=True,
    ).stdout
    if exact:
        return np.frombuffer(raw, dtype='<f4').astype(np.float64)
    return np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0


def trim(x, ms=None, floor=0.004):
    """Silence cut from the start, the end at `ms` (faded out) or where it dies away."""
    on = np.flatnonzero(np.abs(x) > floor)
    if len(on) == 0:
        return x
    x = x[max(0, on[0] - int(0.002 * SR)):]
    if ms is not None:
        x = x[: int(SR * ms / 1000)]
    else:
        on = np.flatnonzero(np.abs(x) > floor)
        x = x[: on[-1] + int(0.02 * SR)]
    f = min(len(x), int(0.015 * SR))
    x = x.copy()
    x[-f:] *= np.linspace(1, 0, f)
    return x


def mix(parts):
    """(clip, start s, gain) layered into one sound."""
    end = max(int(at * SR) + len(c) for c, at, _ in parts)
    y = np.zeros(end)
    for c, at, g in parts:
        i = int(at * SR)
        y[i:i + len(c)] += c * g
    return y


def write(name, x, peak=0.89):
    """Written with its peak at `peak` (None: as it is)."""
    if peak is not None:
        x = x / max(np.max(np.abs(x)), 1e-9) * peak
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    print(f'{name}.wav  {len(x) / SR:.2f} s')


# --- The newer sounds: starts cut to the first note or hit, levels matched, tails faded.


def start(x, rel=0.08):
    """The clip from its first real sound (a note, a hit): `rel` of its peak, 2 ms before, faded in over 1 ms."""
    on = np.flatnonzero(np.abs(x) > rel * np.max(np.abs(x)))
    x = x[max(0, on[0] - int(0.002 * SR)):].copy() if len(on) else x.copy()
    n = int(0.001 * SR)
    x[:n] *= np.linspace(0, 1, n)
    return x


def level(x):
    """How loud a clip sounds at its loudest: the RMS of its loudest 300 ms."""
    w = int(0.3 * SR)
    if len(x) <= w:
        return np.sqrt(np.mean(x ** 2))
    c = np.concatenate([[0], np.cumsum(x ** 2)])
    return np.sqrt(np.max(c[w:] - c[:-w]) / w)


def norm(x):
    """A clip brought to one loudness, so the gains in a mix mean what they say."""
    return x / max(level(x), 1e-9) * 0.1


def tail(x, sec, fade=0.08):
    """Cut at `sec`, the last `fade` seconds faded out."""
    x = x[: int(SR * sec)].copy()
    f = min(len(x), int(SR * fade))
    x[-f:] *= np.linspace(1, 0, f) ** 2
    return x


def decay(x, tau):
    """Dying away with time constant `tau` s: a hit with nothing of the recording's tail (room, noise) after it."""
    return x * np.exp(-np.arange(len(x)) / SR / tau)


def lowpass(x, cutoff):
    """One-pole low-pass; `cutoff` (Hz) may be an array (a sweep)."""
    a = 1 - np.exp(-2 * np.pi * np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape) / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def varispeed(x, sec, r0, r1):
    """`sec` seconds of the clip played at a speed going from r0 to r1 (pitch with it): an engine spooling up."""
    n = int(SR * sec)
    rate = r0 * (r1 / r0) ** (np.arange(n) / n)
    pos = np.cumsum(rate)
    pos = pos[pos < len(x) - 1]
    return np.interp(pos, np.arange(len(x)), x)


def limit(x, ceiling=0.89, release=0.06):
    """Peaks held under `ceiling` (3 ms look-ahead, smooth release) instead of turning the whole sound down."""
    need = np.minimum(1.0, ceiling / np.maximum(np.abs(x), 1e-9))
    w = int(0.003 * SR)
    ahead = np.lib.stride_tricks.sliding_window_view(np.concatenate([need, np.ones(w)]), w + 1).min(axis=1)
    k = 1 - np.exp(-1 / (release * SR))
    g = np.empty_like(x)
    cur = 1.0
    for i, t in enumerate(ahead):
        cur = t if t < cur else cur + (t - cur) * k
        g[i] = cur
    return x * g


def finish(name, x, loud=None):
    """Written at a loudness (`loud`: the RMS of its loudest 300 ms) with peaks held under -1 dBFS, or (no `loud`)
    with its peak at -1 dBFS."""
    if loud is None:
        write(name, x)
    else:
        write(name, limit(x / max(level(x), 1e-9) * loud), None)


def main(src, only):
    find(src)
    k = lambda n: load(src, n)
    f = lambda n: load(src, n, True)
    made = {}

    def out(name, make):
        if not only or name in only:
            make()
        made[name] = True

    # Plain table sounds: the recordings themselves.
    out('chip', lambda: write('chip', trim(k('chips-stack-1'))))
    out('tick', lambda: write('tick', trim(k('chips-collide-4'), 70), 0.6))
    out('card', lambda: write('card', trim(k('card-place-1'))))
    out('dice', lambda: write('dice', trim(k('dice-throw-1'))))
    out('move', lambda: write('move', trim(k('card-slide-4'))))
    out('capture', lambda: write('capture', trim(mix([(k('chips-collide-2'), 0, 1.0), (k('card-shove-1'), 0.03, 0.7)]))))

    j = lambda n: norm(start(f(n)))

    # The slot machine (owners, Nov 2026: no hiss, no whoosh; a button press barely heard). Every click and hit is cut
    # to its first milliseconds and dies away fast, so nothing of a recording's room or noise comes with it.
    def click(n, ms=14, tau=0.0035, rel=0.3):
        return norm(decay(start(f(n), rel)[: int(SR * ms / 1000)], tau))

    def ratchet(sec, gap0, gap1, g0, g1, seed):
        """A pawl on a toothed wheel: ticks `gap0` → `gap1` s apart, gain g0 → g1, two clicks taking turns, uneven."""
        r = np.random.default_rng(seed)
        ticks = [click('switch2'), click('metalClick')]
        parts, t, i = [], 0.0, 0
        while t < sec:
            u = t / sec
            parts.append((ticks[i % 2], t, g0 * (g1 / g0) ** u * (0.85 + 0.3 * r.random())))
            t += (gap0 + (gap1 - gap0) * u) * (0.9 + 0.2 * r.random())
            i += 1
        return lowpass(mix(parts), 5000)

    # A button pressed in: the soft "tock" of a UI select, softened, 45 ms.
    out('tap', lambda: write('tap', tail(lowpass(start(f('select_002'), 0.3), 6000), 0.045, 0.02), 0.5))
    # A reel coming to rest: a chip set down hard (from its hit, not its slide) on a deep metal body. A thunk, no tail.
    thunk = decay(lowpass(mix([(norm(start(f('chip-lay-3'), 0.3)), 0, 1.0), (j('impactMetal_004'), 0, 0.55)]), 4000), 0.06)
    out('stop', lambda: finish('stop', tail(thunk, 0.22, 0.05)))
    # The reels set off: the clutch's soft clunk, then the ratchet speeding up and dying away.
    clunk = decay(lowpass(mix([(j('metalLatch'), 0, 1.0), (j('impactMetal_004'), 0, 0.6)]), 2600), 0.09)
    spin = mix([(clunk, 0, 1.0), (ratchet(0.62, 0.045, 0.024, 0.55, 0.04, 5), 0.045, 1.0)])
    out('spin', lambda: finish('spin', tail(spin, 0.75, 0.1)))
    # The lever pulled: the grip's click, the ratchet climbing as the spring stretches (a creak, rising), then the
    # heavy latch: the latch, a deep metal hit and the click of its catch.
    spring = varispeed(start(f('creak3')), 0.32, 1.0, 1.3)
    latch = mix([(decay(j('metalLatch'), 0.12), 0, 1.0), (decay(j('impactMetal_002'), 0.12), 0, 0.9), (click('metalClick', 20, 0.008), 0.004, 0.5)])
    lever = mix([(click('metalClick', 20, 0.008), 0, 0.8), (ratchet(0.3, 0.05, 0.032, 0.4, 1.0, 6), 0.03, 1.0),
                 (norm(lowpass(spring, 3500)), 0.02, 0.22), (latch, 0.34, 1.6)])
    out('lever', lambda: finish('lever', tail(lever, 0.66, 0.15)))

    # Coins (RPG sound effects): one coin is a buckle's last clink ringing, with a small glass ring on it; coins
    # pouring are handfuls one after another over chips falling (Casino Audio).
    clink = start(f('beltHandle2'), 0.6)
    out('coin', lambda: finish('coin', tail(mix([(norm(clink), 0, 1.0), (j('glass_002'), 0.003, 0.3)]), 0.22, 0.1)))
    chips = mix([(f('chips-handle-5'), 0, 1.0), (f('chips-stack-3'), 0.18, 0.8), (f('chips-handle-1'), 0.36, 0.9)])
    coins = tail(mix([(j('handleCoins'), 0, 1.0), (j('handleCoins2'), 0.14, 0.8), (j('handleCoins2'), 0.33, 0.65),
                      (j('handleCoins'), 0.46, 0.6), (norm(start(chips)), 0.08, 0.35)]), 1.45, 0.35)
    out('coins', lambda: finish('coins', coins, 0.16))

    # A blow: a deep metal hit, a low boom under it and a crack on top (Sci-Fi Sounds).
    hit = tail(mix([(j('impactMetal_001'), 0, 1.0), (j('lowFrequency_explosion_001'), 0, 0.8),
                    (j('explosionCrunch_000'), 0, 0.22)]), 0.85, 0.3)
    out('impact', lambda: finish('impact', hit))

    # The music (85 Short music jingles), all at one tempo (a note every 116 ms), so they can be layered and
    # chained. One motif runs through the wins, D E F# G: steel drums and pizzicato for a small win; a rising run into
    # it for a game won; the whole band (saxophone and 8-bit too) with blows and coins for a big win; a trill before
    # all that for the jackpot.
    def band(n, parts):
        """The same jingle (number `n`) by several instruments in unison: (set, gain)."""
        return mix([(j(f'jingles_{s}{n:02d}'), 0, g) for s, g in parts])

    beat = 0.116
    # The sets number their jingles differently: the 8-bit set's D E F# G is 03 where the others' is 10, and so on.
    light = [('STEEL', 1.0), ('PIZZA', 0.5)]
    whole = [('STEEL', 1.0), ('PIZZA', 0.6), ('SAX', 0.5)]
    cadence = lambda parts, nes=0.0: mix([(band(10, parts), 0, 1.0), (j('jingles_NES03'), 0, nes)])
    run = lambda parts, nes=0.0: tail(mix([(band(2, parts), 0, 1.0), (j('jingles_NES12'), 0, nes)]), 6 * beat, 0.03)
    trill = tail(mix([(band(3, [('STEEL', 1.0), ('PIZZA', 0.6), ('SAX', 0.4)]), 0, 1.0), (j('jingles_NES13'), 0, 0.15)]), 6 * beat, 0.03)
    out('win', lambda: finish('win', tail(cadence(light), 1.0, 0.12), MUSIC))
    # A game won at a table (and Fener's star shower starting): the rising run into the motif, no blows.
    fanfare = mix([(run(light), 0, 0.85), (cadence(light + [('SAX', 0.35)]), 6 * beat, 1.0)])
    out('fanfare', lambda: finish('fanfare', tail(fanfare, 1.75, 0.25), MUSIC))
    # BÜYÜK KAZANÇ: a blow, the run and the motif by the whole band, a second blow on it, coins pouring.
    big = mix([(hit, 0, 0.35), (run(whole, 0.18), 0, 0.9), (cadence(whole, 0.18), 6 * beat, 1.0), (hit, 6 * beat, 0.5),
               (coins, 6 * beat + 0.2, 0.4)])
    out('win-big', lambda: finish('win-big', tail(big, 2.3, 0.45), MUSIC))
    jackpot = mix([(trill, 0, 0.75), (hit, 6 * beat, 0.3), (run(whole, 0.18), 6 * beat, 0.9), (cadence(whole, 0.18), 12 * beat, 1.0),
                   (hit, 12 * beat, 0.55), (coins, 12 * beat + 0.1, 0.45), (coins, 12 * beat + 0.7, 0.35)])
    out('jackpot', lambda: finish('jackpot', tail(jackpot, 3.3, 0.5), MUSIC))
    # A win's title stepping up: "ta-DA" up a fifth, a soft blow on the second note.
    step = band(16, light)
    out('levelup', lambda: finish('levelup', tail(mix([(step, 0, 1.0), (hit, beat, 0.3)]), 0.8, 0.2), MUSIC))
    # A round lost: two plucked notes stepping down. Kept softer than the wins.
    out('lose', lambda: finish('lose', tail(j('jingles_PIZZA09'), 0.55, 0.12), MUSIC * 0.6))

    # The rocket (Sci-Fi Sounds): ignition, the thrusters roaring as the engine spools up, then gone.
    def launch():
        sec = 1.5
        roar = start(f('thrusterFire_003'))[: int(SR * sec)]
        x = np.arange(len(roar)) / SR
        roar = lowpass(roar, 900 + 7000 * np.minimum(1, x / 0.35)) * np.minimum(1, x / 0.06)
        engine = varispeed(start(f('spaceEngineLow_001')), sec, 0.7, 1.6)
        thump = tail(start(f('lowFrequency_explosion_001')), 0.5, 0.3)
        y = mix([(norm(roar), 0, 1.0), (norm(engine), 0, 0.55), (norm(thump), 0, 0.6)])
        e = np.clip((sec - np.arange(len(y)) / SR) / 0.7, 0, 1) ** 1.5
        finish('launch', y * e)
    out('launch', launch)
    # An explosion: a crunch for the blast, a long low boom under it, the metal hit for the thump.
    boom = mix([(j('explosionCrunch_000'), 0, 1.0), (j('lowFrequency_explosion_000'), 0, 1.1), (j('impactMetal_003'), 0, 0.4)])
    out('boom', lambda: finish('boom', tail(boom, 1.5, 0.6)))
    # Cashing out: a handful of coins with a bright ring over it ("ka-ching") and the steel drums' "ta-DA".
    cash = mix([(j('handleCoins'), 0, 1.0), (j('handleCoins2'), 0.12, 0.6), (j('glass_004'), 0.02, 0.5),
                (j('glass_001'), 0.02, 0.3), (step, 0.02, 0.45)])
    out('cashout', lambda: finish('cashout', tail(cash, 0.95, 0.3), 0.17))

    # The amount climbing: the big engine spooling up two octaves with an explosion's tail played backwards under it.
    def riser():
        sec = 1.9
        engine = varispeed(start(f('spaceEngineLarge_001')), sec, 0.55, 2.2)
        swell = norm(trim(f('explosionCrunch_004')))[::-1]
        swell = swell[-int(SR * sec):] if len(swell) > SR * sec else np.concatenate([np.zeros(int(SR * sec) - len(swell)), swell])
        y = mix([(norm(engine), 0, 1.0), (swell, 0, 0.45)])
        x = np.arange(len(y)) / SR
        y *= (0.08 + 0.92 * (x / sec) ** 1.6) * np.clip((sec - x) / 0.05, 0, 1)
        finish('riser', y)
    out('riser', riser)

    unknown = set(only) - set(made)
    if unknown:
        sys.exit(f'not made here: {", ".join(sorted(unknown))}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], set(sys.argv[2:]))
