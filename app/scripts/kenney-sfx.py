#!/usr/bin/env python3
"""The games' table sounds from real recordings: Kenney's Casino Audio (kenney.nl, CC0: free for commercial use, no
credit needed) for chips, cards, dice and coins. The wins keep their music (scripts/make-sfx.py) with real chips
falling under it. Writes 44.1 kHz mono WAV files into assets/sfx under the names lib/game-sound.ts loads.

Run: python3 scripts/kenney-sfx.py <folder with Kenney's Audio/*.ogg>   (needs ffmpeg on the PATH)
The pack itself is not kept in the repository; only the files made from it are."""
import os
import subprocess
import sys
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')


def load(src, name):
    """A Kenney clip as mono floats at SR (ffmpeg decodes the Ogg)."""
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', os.path.join(src, name + '.ogg'), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0


def ours(name):
    """One of the made-from-code sounds already in assets/sfx, brought to SR."""
    with wave.open(os.path.join(OUT, name + '.wav')) as w:
        rate = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768.0
    if rate == SR:
        return x
    n = int(len(x) * SR / rate)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)


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
    x = x / max(np.max(np.abs(x)), 1e-9) * peak
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    print(f'{name}.wav  {len(x) / SR:.2f} s')


def main(src):
    k = lambda n: load(src, n)
    # Plain table sounds: the recordings themselves.
    write('tap', trim(k('chip-lay-2'), 140), 0.7)
    write('chip', trim(k('chips-stack-1')))
    write('tick', trim(k('chips-collide-4'), 70), 0.6)
    write('stop', trim(mix([(k('chip-lay-3'), 0, 1.0), (trim(k('card-place-2')), 0, 0.55)]), 260))
    write('coin', trim(k('chips-collide-1')))
    write('card', trim(k('card-place-1')))
    write('dice', trim(k('dice-throw-1')))
    write('move', trim(k('card-slide-4')))
    write('capture', trim(mix([(k('chips-collide-2'), 0, 1.0), (k('card-shove-1'), 0.03, 0.7)])))
    # A shower of coins: handfuls of chips falling one after another.
    shower = mix([(k('chips-handle-5'), 0, 1.0), (k('chips-stack-3'), 0.18, 0.8), (k('chips-handle-1'), 0.36, 0.9), (k('chips-collide-3'), 0.62, 0.6), (k('chips-stack-5'), 0.8, 0.5)])
    write('coins', trim(shower))
    # The wins: their music (made again first, so a second run doesn't pile chips on chips) with real chips falling
    # under it, the music the loudest.
    subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'make-sfx.py'), 'win', 'win-big', 'jackpot', 'cashout'], check=True)
    music = {n: ours(n) for n in ('win', 'win-big', 'jackpot', 'cashout')}
    write('win', mix([(music['win'], 0, 1.0), (trim(k('chips-handle-6')), 0.05, 0.55)]))
    write('win-big', mix([(music['win-big'], 0, 1.0), (shower, 0.12, 0.5)]))
    write('jackpot', mix([(music['jackpot'], 0, 1.0), (shower, 0.1, 0.45), (shower, 0.9, 0.4), (shower, 1.7, 0.35)]))
    write('cashout', mix([(music['cashout'], 0, 1.0), (trim(k('chips-handle-5')), 0.08, 0.6)]))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
