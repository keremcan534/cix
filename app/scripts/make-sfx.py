#!/usr/bin/env python3
"""Game sound effects, made from code (no recording, no download): short tones, clicks and noise sweeps written as
22.05 kHz mono WAV files into assets/sfx. They are stand-ins a sound designer's set can replace file for file
(lib/game-sound.ts names them). Run: python3 scripts/make-sfx.py"""
import os
import wave

import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
rng = np.random.default_rng(7)


def t(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack=0.004, decay=6.0):
    """Fast attack, exponential decay over the sound's length."""
    x = np.arange(n) / SR
    a = np.minimum(1.0, x / max(attack, 1e-4))
    return a * np.exp(-decay * x / max(n / SR, 1e-4))


def tone(freq, sec, decay=6.0, attack=0.004, partials=((1, 1.0),)):
    x = t(sec)
    y = sum(g * np.sin(2 * np.pi * freq * m * x) for m, g in partials)
    return y * env(len(x), attack, decay)


def bell(freq, sec, decay=5.0):
    """A soft bell: the note, a detuned octave and two inharmonic partials."""
    return tone(freq, sec, decay, 0.003, ((1, 1.0), (2.0, 0.42), (2.76, 0.22), (5.4, 0.08)))


def noise(sec):
    return rng.uniform(-1, 1, int(SR * sec))


def lowpass(y, cutoff):
    """One-pole low-pass; `cutoff` may be an array (a sweep)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), y.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    out = np.empty_like(y)
    acc = 0.0
    for i in range(len(y)):
        acc += a[i] * (y[i] - acc)
        out[i] = acc
    return out


def highpass(y, cutoff):
    return y - lowpass(y, cutoff)


def sweep(f0, f1, sec, decay=3.0, attack=0.01):
    x = t(sec)
    f = f0 * (f1 / f0) ** (x / sec)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), attack, decay)


def at(parts, total):
    """Mix (start_sec, samples) pairs into one buffer."""
    out = np.zeros(int(SR * total))
    for start, y in parts:
        i = int(SR * start)
        n = min(len(y), len(out) - i)
        if n > 0:
            out[i:i + n] += y[:n]
    return out


def echo(y, delay=0.085, gain=0.28, repeats=3):
    out = np.concatenate([y, np.zeros(int(SR * delay * repeats))])
    for k in range(1, repeats + 1):
        i = int(SR * delay * k)
        out[i:i + len(y)] += y * gain ** k
    return out


def fade(y, sec=0.012):
    n = min(len(y), int(SR * sec))
    y = y.copy()
    y[-n:] *= np.linspace(1, 0, n)
    return y


def save(name, y, peak=0.8):
    y = fade(np.tanh(y * 1.2))
    y = y / max(1e-9, np.max(np.abs(y))) * peak
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((y * 32767).astype('<i2').tobytes())
    return len(y) / SR


C5, D5, E5, G5, A5, C6, D6, E6, G6, C7 = 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5, 1568.0, 2093.0

SOUNDS = {
    # A soft key press.
    'tap': lambda: tone(1250, 0.05, 9, 0.001) * 0.8 + highpass(noise(0.05), 3000) * env(int(SR * 0.05), 0.001, 30) * 0.25,
    # A chip set down on felt: a dull knock and a short clack.
    'chip': lambda: at([(0, lowpass(noise(0.05), 1800) * env(int(SR * 0.05), 0.001, 14)), (0.012, tone(2300, 0.06, 12, 0.001) * 0.5), (0.05, tone(3100, 0.04, 14, 0.001) * 0.3)], 0.12),
    # Reels or a wheel set off.
    'spin': lambda: lowpass(noise(0.32), np.linspace(500, 5200, int(SR * 0.32))) * np.sin(np.pi * t(0.32) / 0.32) ** 0.8,
    # One step of a wheel, a reel or a counter.
    'tick': lambda: tone(1750, 0.028, 10, 0.0005) * 0.7 + highpass(noise(0.028), 2500) * env(int(SR * 0.028), 0.0005, 40) * 0.4,
    # A reel comes to rest.
    'stop': lambda: at([(0, sweep(190, 95, 0.11, 7, 0.001)), (0, lowpass(noise(0.04), 2600) * env(int(SR * 0.04), 0.0005, 18) * 0.7)], 0.13),
    # A coin on coins.
    'coin': lambda: echo(tone(4186, 0.14, 9, 0.0005, ((1, 1.0), (1.47, 0.6), (2.09, 0.3))) * 0.9, 0.031, 0.35, 2),
    # A small win.
    'win': lambda: echo(at([(0, bell(C6, 0.3)), (0.09, bell(E6, 0.3)), (0.18, bell(G6, 0.45))], 0.65), 0.09, 0.25, 2),
    # A big win: a rising run and a held chord.
    'win-big': lambda: echo(at([(0, bell(C5, 0.3)), (0.1, bell(E5, 0.3)), (0.2, bell(G5, 0.3)), (0.3, bell(C6, 0.35)), (0.42, bell(E6, 0.35)), (0.55, bell(G6, 0.9, 3) + bell(C6, 0.9, 3) * 0.7 + bell(E6, 0.9, 3) * 0.6)], 1.5), 0.11, 0.3, 3),
    # The top prize: a fanfare over falling coins.
    'jackpot': lambda: echo(
        at(
            [(i * 0.11, bell(f, 0.32)) for i, f in enumerate([C5, E5, G5, C6, G5, C6, E6, G6])]
            + [(0.9, bell(C6, 1.2, 2.4) + bell(E6, 1.2, 2.4) * 0.8 + bell(G6, 1.2, 2.4) * 0.7 + bell(C7, 1.2, 2.4) * 0.4)]
            + [(0.95 + i * 0.07, tone(3600 + 900 * rng.random(), 0.09, 10, 0.0005, ((1, 1.0), (1.47, 0.5))) * 0.35) for i in range(14)],
            2.3,
        ),
        0.12,
        0.3,
        3,
    ),
    # A round lost: a short, low note. Kept quiet.
    'lose': lambda: sweep(300, 170, 0.22, 5, 0.004) * 0.6,
    # Something is about to land: a rising hum.
    'tease': lambda: (sweep(220, 660, 1.0, 0.2, 0.2) * 0.5 + sweep(331, 990, 1.0, 0.2, 0.2) * 0.3) * np.linspace(0.35, 1, int(SR * 1.0)),
    # A rocket leaving.
    'launch': lambda: at([(0, lowpass(noise(0.75), np.linspace(300, 3600, int(SR * 0.75))) * np.linspace(1, 0.15, int(SR * 0.75)) ** 0.6 * 0.9), (0, sweep(90, 420, 0.75, 1.2, 0.02) * 0.5)], 0.75),
    # An explosion.
    'boom': lambda: at([(0, lowpass(noise(0.7), np.geomspace(2600, 120, int(SR * 0.7))) * env(int(SR * 0.7), 0.002, 5) * 1.4), (0, sweep(120, 40, 0.5, 5, 0.002) * 0.9)], 0.7),
    # Cashing out: a coin and a bright two-note chime.
    'cashout': lambda: echo(at([(0, tone(4186, 0.1, 10, 0.0005, ((1, 1.0), (1.47, 0.6))) * 0.7), (0.05, bell(G6, 0.3)), (0.14, bell(C7, 0.5, 4))], 0.7), 0.08, 0.25, 2),
    # A card turned or dealt.
    'card': lambda: at([(0, highpass(noise(0.085), 1800) * np.sin(np.pi * t(0.085) / 0.085) ** 2 * 0.9), (0, tone(420, 0.03, 14, 0.001) * 0.25)], 0.085),
    # Dice shaken and thrown.
    'dice': lambda: at([(s, (tone(1500 + 900 * rng.random(), 0.03, 12, 0.0005) * 0.6 + lowpass(noise(0.03), 3000) * env(int(SR * 0.03), 0.0005, 20)) * g) for s, g in [(0, 0.7), (0.06, 0.9), (0.11, 0.6), (0.19, 1.0), (0.25, 0.7), (0.33, 0.9), (0.4, 0.5)]], 0.5),
    # A piece moved one square on a board.
    'move': lambda: at([(0, tone(720, 0.06, 9, 0.001, ((1, 1.0), (2.4, 0.3)))), (0, lowpass(noise(0.02), 2400) * env(int(SR * 0.02), 0.0005, 25) * 0.5)], 0.06),
    # A piece sent back, a card you must take.
    'capture': lambda: at([(0, sweep(880, 330, 0.2, 5, 0.002)), (0.06, lowpass(noise(0.07), 2000) * env(int(SR * 0.07), 0.001, 12) * 0.6)], 0.26),
    # Your turn.
    'turn': lambda: echo(bell(A5, 0.4, 5) * 0.9 + bell(E6, 0.4, 5) * 0.4, 0.1, 0.2, 1),
    # A cannon shot under water.
    'shot': lambda: at([(0, sweep(520, 110, 0.12, 7, 0.001)), (0, lowpass(noise(0.06), 3200) * env(int(SR * 0.06), 0.0005, 16) * 0.6)], 0.12),
    # Water thrown up: a catch.
    'splash': lambda: highpass(lowpass(noise(0.38), np.geomspace(6000, 900, int(SR * 0.38))), 500) * env(int(SR * 0.38), 0.004, 6) * 1.2,
    # A game won at a table: three quick notes.
    'fanfare': lambda: echo(at([(0, bell(G5, 0.22)), (0.13, bell(C6, 0.22)), (0.26, bell(E6, 0.22)), (0.39, bell(G6, 0.8, 3) + bell(C6, 0.8, 3) * 0.6)], 1.3), 0.1, 0.28, 3),
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name, make in SOUNDS.items():
        sec = save(name, make())
        total += sec
        print(f'{name:10s} {sec:5.2f} s')
    print(f'{len(SOUNDS)} sounds, {total:.1f} s')
