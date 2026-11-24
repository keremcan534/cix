#!/usr/bin/env python3
"""Game sound effects, made from code (no recording, no download): short tones, clicks and noise sweeps written as
22.05 kHz mono WAV files into assets/sfx. The wins (win, win-big, jackpot, levelup, impact, coins, riser) are layered:
drums, a brass-like section, bells, coins and a hall round them. They are stand-ins a sound designer's set can replace
file for file (lib/game-sound.ts names them).

Most of them have been replaced by real recordings (scripts/kenney-sfx.py, Kenney's packs, CC0): the names in
RECORDED. This script leaves those files alone, so running it never puts a stand-in back over a recording; it writes
the others (tease, turn, shot, splash). Run: python3 scripts/make-sfx.py [name ...] (no names: all it writes);
python3 scripts/make-sfx.py --force <name ...> writes the named stand-ins over their recordings."""
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
C3, C4, E4, F4, G4, A4, B4, F5, E7 = 130.81, 261.63, 329.63, 349.23, 392.0, 440.0, 493.88, 698.46, 2637.0

# --- The win set. Each sound seeds its own noise (fresh), so one made alone comes out the same, and the sounds
# above keep theirs.
rng2 = np.random.default_rng(11)


def fresh(seed):
    global rng2
    rng2 = np.random.default_rng(seed)


def noise2(sec):
    return rng2.uniform(-1, 1, int(SR * sec))


def saw(freq, sec, cents=0.0):
    """A band-limited sawtooth: its harmonics up to the top of the band."""
    x = t(sec)
    f = freq * 2 ** (cents / 1200)
    k = np.arange(1, max(2, min(36, int(SR / 2.4 / f))) + 1)
    return (np.sin(2 * np.pi * f * np.outer(x, k)) / k).sum(axis=1) * 0.6


def brass(freq, sec, bright=4200):
    """A brass-like note: two saws a little apart through a filter that opens on the attack and settles."""
    x = t(sec)
    y = saw(freq, sec, -7) + saw(freq, sec, 7)
    y = lowpass(y, 900 + (bright - 900) * np.minimum(1, x / 0.04) * (0.55 + 0.45 * np.exp(-x * 5)))
    amp = np.minimum(1, x / 0.018) * (0.82 + 0.18 * np.exp(-x * 7)) * np.clip((sec - x) / 0.09, 0, 1)
    return y * amp * 0.45


def chord(freqs, sec, voice=brass):
    return sum(voice(f, sec) for f in freqs) / np.sqrt(len(freqs))


def kick(sec=0.4):
    """A deep drum: a falling sine and a click."""
    x = t(sec)
    body = np.sin(2 * np.pi * np.cumsum(46 + 120 * np.exp(-x * 26)) / SR) * np.exp(-x * 8)
    return body + highpass(noise2(sec), 1800) * np.exp(-x * 140) * 0.4


def snare(sec=0.16, gain=1.0):
    x = t(sec)
    return (np.sin(2 * np.pi * 185 * x) * np.exp(-x * 32) * 0.55 + highpass(noise2(sec), 1700) * np.exp(-x * 20)) * gain


def crash(sec=1.4, gain=1.0):
    """A cymbal: bright noise and a few metal partials, ringing out."""
    x = t(sec)
    metal = sum(np.sin(2 * np.pi * f * x + 6.28 * rng2.random()) for f in (3150, 4270, 5330, 6860, 7990)) * 0.07
    return (highpass(noise2(sec), 4800) * 0.8 + metal) * np.exp(-x * 2.4) * np.minimum(1, x / 0.003) * gain


def shimmer(sec, base=C7):
    """High bells trembling over a held chord."""
    x = t(sec)
    y = np.sin(2 * np.pi * base * x) + np.sin(2 * np.pi * base * 1.5 * x) * 0.6 + np.sin(2 * np.pi * base * 2 * x) * 0.35
    return y * (0.55 + 0.45 * np.sin(2 * np.pi * 9 * x)) * np.exp(-x * 1.3) * np.minimum(1, x / 0.08) * 0.14


def ping(freq, sec=0.12):
    """One coin."""
    return tone(freq, sec, 11, 0.0005, ((1, 1.0), (1.47, 0.55), (2.09, 0.3), (2.78, 0.15)))


def shower(sec, count, start=0.0, gain=0.3):
    """Coins falling for `sec`, thick at first."""
    return [(start + sec * rng2.random() ** 1.5, ping(2500 + 2600 * rng2.random()) * gain * (0.5 + 0.5 * rng2.random())) for _ in range(count)]


def hall(y, mix=0.22, sec=1.1):
    """A hall round a sound: a long, darkening noise tail convolved with it."""
    x = t(sec)
    ir = lowpass(noise2(sec), 3600) * np.exp(-x * 4.5)
    n = len(y) + len(ir) - 1
    wet = np.fft.irfft(np.fft.rfft(y, n) * np.fft.rfft(ir, n), n)
    wet *= np.max(np.abs(y)) / max(1e-9, np.max(np.abs(wet)))
    out = np.concatenate([y, np.zeros(len(ir) - 1)]) * (1 - mix) + wet * mix
    # The tail ends where it can no longer be heard.
    loud = np.nonzero(np.abs(out) > 0.004 * np.max(np.abs(out)))[0]
    return out[: loud[-1] + int(SR * 0.02)] if len(loud) else out


def small_win():
    """A small win: a quick run of bells, a chord and a coin."""
    fresh(21)
    run = [(i * 0.07, bell(f, 0.34) * 0.8) for i, f in enumerate((C6, E6, G6, C7))]
    return hall(at(run + [(0.28, chord((C6, E6, G6), 0.5, bell) * 0.8), (0.3, ping(4186, 0.14) * 0.35)], 0.8), 0.18, 0.8)


def big_win():
    """BÜYÜK KAZANÇ: a hit, a run up two octaves, then IV-V-I on the brass with the cymbal and coins."""
    fresh(22)
    run = [(0.1 + i * 0.07, bell(f, 0.3) * 0.5) for i, f in enumerate((C5, E5, G5, C6, E6, G6, C7, E7))]
    section = [(0, chord((C4, E4, G4, C5), 0.32)), (0.72, chord((F4, A4, C5, F5), 0.22)), (0.96, chord((G4, B4, D5, G5), 0.22)), (1.2, chord((C4, E4, G4, C5, E5), 1.15))]
    drums = [(0, kick()), (0, crash(1.0, 0.5)), (0.72, snare(0.16, 0.45)), (0.96, snare(0.16, 0.6)), (1.2, kick()), (1.2, crash(1.4, 0.65))]
    return hall(at(run + section + drums + [(1.2, shimmer(1.3))] + shower(1.9, 16, 0.35, 0.22), 2.5))


def jackpot_win():
    """JACKPOT: a drum roll, a hit, a brass call over it, the big chord and a long shower of coins."""
    rng.random(14)  # the draws the old jackpot made: the sounds after it keep their noise
    fresh(23)
    roll = [(0.6 * (1 - (1 - i / 16) ** 1.4), snare(0.1, 0.12 + 0.045 * i)) for i in range(16)]
    call = [(0.62, C5, 0.16), (0.79, E5, 0.16), (0.96, G5, 0.16), (1.13, C6, 0.34), (1.5, G5, 0.16), (1.67, C6, 0.5)]
    lead = [(s, at([(0, brass(f, d + 0.04) * 0.9), (0, bell(f, d + 0.3) * 0.3)], d + 0.3)) for s, f, d in call]
    under = [(0.62, chord((C4, G4, C5), 0.5) * 0.55), (1.13, chord((F4, A4, C5), 0.32) * 0.5), (1.5, chord((G4, B4, D5), 0.45) * 0.5)]
    hits = [(0.62, kick()), (0.62, crash(1.0, 0.55)), (1.13, snare(0.16, 0.5)), (1.5, snare(0.16, 0.6)), (2.05, kick() * 1.1), (2.05, crash(1.8, 0.75))]
    final = [(2.05, chord((C4, G4, C5, E5, G5, C6), 1.55)), (2.05, shimmer(1.7))]
    return hall(at(roll + lead + under + hits + final + shower(1.6, 34, 2.05, 0.24), 3.8), 0.24)


def level_up():
    """A step up the title: a short roll, a "ta-DAA" on the brass with the cymbal, a sparkle on top."""
    fresh(24)
    roll = [(0.05 * i * (1 - 0.06 * i), snare(0.11, 0.2 + 0.08 * i)) for i in range(5)]
    call = [(0.24, chord((G4, B4, D5), 0.12) * 0.8), (0.36, chord((C5, E5, G5, C6), 0.72)), (0.36, kick()), (0.36, crash(0.9, 0.55))]
    sparkle = [(0.36 + i * 0.055, bell(f, 0.3) * 0.33) for i, f in enumerate((C6, E6, G6, C7))]
    return hall(at(roll + call + sparkle, 1.25))


def impact():
    """A blow: a deep hit, a brass stab and the cymbal."""
    fresh(25)
    return hall(at([(0, kick() * 1.15), (0, crash(0.85, 0.5)), (0, chord((C4, G4, C5, E5), 0.26) * 0.9)], 0.9), 0.18, 0.9)


def coin_shower():
    """Coins pouring out: a quick shower over a bright jingle."""
    fresh(26)
    x = t(1.7)
    bed = highpass(noise2(1.7), 5200) * np.exp(-x * 2.2) * 0.06
    return hall(at([(0, bed)] + shower(1.5, 44, 0, 0.32), 1.7), 0.16, 0.7)


def riser():
    """The amount climbing: a tone rising two octaves, opening up, with a hiss swelling under it."""
    fresh(27)
    sec = 2.4
    x = t(sec)
    phase = 2 * np.pi * np.cumsum(C3 * 4 ** (x / sec)) / SR
    y = lowpass(sum(np.sin(k * phase) / k for k in range(1, 9)) * 0.6, 300 + 3800 * (x / sec) ** 1.6)
    hiss = highpass(noise2(sec), 2600) * (x / sec) ** 2.2 * 0.3
    return (y + hiss) * (0.15 + 0.85 * (x / sec) ** 1.3) * np.clip((sec - x) / 0.12, 0, 1)


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
    'win': small_win,
    # A big win (BÜYÜK KAZANÇ), and the finale of a climbing one.
    'win-big': big_win,
    # The top prize.
    'jackpot': jackpot_win,
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
    # A win's title stepping up (BÜYÜK → DEV → EFSANE KAZANÇ).
    'levelup': level_up,
    # A blow in a win's show (the title, the amount landing).
    'impact': impact,
    # Coins pouring out of a win.
    'coins': coin_shower,
    # A big win's amount counting up.
    'riser': riser,
}

# Made from real recordings by scripts/kenney-sfx.py: left alone here unless named with --force.
RECORDED = {
    'tap', 'chip', 'spin', 'tick', 'stop', 'coin', 'card', 'dice', 'move', 'capture', 'coins',
    'win', 'win-big', 'jackpot', 'fanfare', 'levelup', 'lose', 'impact', 'riser', 'launch', 'boom', 'cashout',
}

if __name__ == '__main__':
    import sys

    force = '--force' in sys.argv[1:]
    only = {a for a in sys.argv[1:] if a != '--force'}
    if only - set(SOUNDS):
        sys.exit(f'unknown: {", ".join(sorted(only - set(SOUNDS)))}')
    os.makedirs(OUT, exist_ok=True)
    total, written, kept = 0, 0, []
    for name, make in SOUNDS.items():
        # Every sound is made, in order, so each draws the same noise however many are written.
        y = make()
        if only and name not in only:
            continue
        if name in RECORDED and not (force and name in only):
            kept.append(name)
            continue
        sec = save(name, y)
        total += sec
        written += 1
        print(f'{name:10s} {sec:5.2f} s')
    print(f'{written} sounds, {total:.1f} s')
    if kept:
        print(f'left alone (recordings, scripts/kenney-sfx.py; --force <name> to overwrite): {" ".join(kept)}')
