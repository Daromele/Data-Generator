"""Synthesize a soundtrack for a social video: a light four-on-the-floor beat with a
plucked chord loop, plus sound effects at given times. Everything is generated here,
so there is nothing to license.

usage: python3 make_audio.py events.json out.wav
events.json: {"dur": 18.8, "bpm": 104, "music": 0.55,
              "events": [{"t": 1.2, "kind": "click"}, ...]}
kinds: click, whoosh, pop, ding, thud, riser, cash, sparkle
"""
import json, sys, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def env(n, a=0.005, d=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    if d:
        e *= np.exp(-t / d)
    return e


def band(x, lo, hi):
    f = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    f[(fr < lo) | (fr > hi)] = 0
    return np.fft.irfft(f, len(x))


def tone(freq, dur, d=0.3, harm=(1, .5, .25), a=0.004):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.atleast_1d(freq)
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(f, (n,)) if f.size > 1 else np.full(n, f[0])) / SR
    s = sum(h * np.sin(ph * (k + 1)) for k, h in enumerate(harm))
    return s * env(n, a, d)


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def sfx(kind):
    if kind == 'click':          # mouse click: tight tick + body
        n = noise(0.04) * env(int(0.04 * SR), 0.0005, 0.004)
        return 0.55 * band(n, 1800, 9000) + 0.35 * tone(1900, 0.04, 0.006, (1,))
    if kind == 'whoosh':         # transition swipe
        d = 0.42; n = int(d * SR); t = np.arange(n) / n
        x = noise(d) * np.sin(np.pi * t) ** 2
        lo = band(x, 300, 1800); hi = band(x, 1800, 7000)
        return 0.5 * (lo * (1 - t) + hi * t)
    if kind == 'pop':            # caption word
        n = int(0.07 * SR); f = np.linspace(1050, 520, n)
        return 0.32 * tone(f, 0.07, 0.025, (1, .2))
    if kind == 'ding':           # number changed
        return 0.34 * (tone(1318.5, 0.9, 0.28, (1, .1)) + 0.6 * tone(1975.5, 0.9, 0.2, (1,)))
    if kind == 'sparkle':        # sticker
        out = np.zeros(int(0.5 * SR))
        for k, f in enumerate([1568, 2093, 2637]):
            s = tone(f, 0.35, 0.09, (1,)); o = int(k * 0.05 * SR); out[o:o + len(s)] += 0.22 * s
        return out
    if kind == 'thud':           # file lands
        n = int(0.16 * SR); f = np.linspace(170, 60, n)
        return 0.3 * tone(f, 0.16, 0.05, (1,), 0.001)
    if kind == 'cash':           # register-ish double chime
        a = tone(2349, 0.5, 0.12, (1, .3)); b = tone(3136, 0.5, 0.14, (1, .2))
        out = np.zeros(int(0.6 * SR)); out[:len(a)] += 0.3 * a; o = int(0.08 * SR); out[o:o + len(b)] += 0.3 * b
        return out
    if kind == 'riser':          # into the end card
        d = 0.9; n = int(d * SR); t = np.arange(n) / n
        x = band(noise(d), 800, 8000) * t ** 2 * 0.35
        return x + 0.12 * tone(np.linspace(300, 900, n), d, None, (1,)) * t
    raise ValueError(kind)


def music(dur, bpm):
    out = np.zeros(int((dur + 1) * SR))
    beat = 60 / bpm
    # C  G  Am  F  (midi roots) with triads
    prog = [(48, [60, 64, 67]), (43, [59, 62, 67]), (45, [60, 64, 69]), (41, [60, 65, 69])]
    m2f = lambda m: 440 * 2 ** ((m - 69) / 12)
    kick = tone(np.linspace(140, 45, int(0.22 * SR)), 0.22, 0.07, (1,), 0.001)
    hat = band(noise(0.05), 7000, 15000) * env(int(0.05 * SR), 0.0005, 0.012)
    clap = band(noise(0.18), 900, 5000) * env(int(0.18 * SR), 0.001, 0.05)
    nb = int(dur / beat) + 2
    put = lambda s, t, g: out.__setitem__(slice(int(t * SR), int(t * SR) + len(s)), out[int(t * SR):int(t * SR) + len(s)] + g * s[:max(0, len(out) - int(t * SR))])
    for b in range(nb):
        t = b * beat
        root, tri = prog[(b // 4) % 4]
        put(kick, t, 0.55)
        put(hat, t + beat / 2, 0.16)
        if b % 2 == 1:
            put(clap, t, 0.18)
        if b % 2 == 0:
            put(tone(m2f(root), beat * 1.8, 0.35, (1, .35, .1), 0.01), t, 0.30)
        for k in range(2):           # eighth-note arpeggio
            note = tri[(b * 2 + k) % 3] + (12 if (b * 2 + k) % 6 >= 3 else 0)
            put(tone(m2f(note), beat * 0.9, 0.16, (1, .45, .2, .1), 0.003), t + k * beat / 2, 0.11)
    return out


def main():
    spec = json.load(open(sys.argv[1]))
    dur = spec['dur']
    out = np.zeros(int((dur + 1) * SR))
    if spec.get('music', 0.55):
        out += spec.get('music', 0.55) * music(dur, spec.get('bpm', 104))
    for e in spec['events']:
        s = sfx(e['kind']) * e.get('gain', 1)
        o = int(e['t'] * SR)
        if o < len(out):
            out[o:o + len(s)] += s[:len(out) - o]
    out = out[:int(dur * SR)]
    n = len(out); fo = int(0.8 * SR)
    out[-fo:] *= np.linspace(1, 0, fo)
    out[:int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    out *= 0.17 / max(1e-6, np.sqrt(np.mean(out ** 2)))   # loudness: RMS about -15 dBFS (social apps normalize near -14 LUFS)
    out = 0.92 * np.tanh(out / 0.92)                      # soft limiter, peak under -1 dBFS
    pcm = (out * 32767).astype('<i2')
    st = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(sys.argv[2], 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    print(f'wrote {sys.argv[2]} {dur:.2f} s, {len(spec["events"])} effects')


if __name__ == '__main__':
    main()
