# Sound for "The Battle Won by Four Trumpets": synthesized SFX + an original light military score, mixed under the
# narration. Every cue is tied to the picture timeline (src/videos/arcole/story.ts mirrored below) and to voice/words.json.
# Standard mix: voice unchanged, music bed +3 dB (10 LU under the voice instead of 13), SFX stem -6 dB.
# Output: mix.wav (48 kHz stereo 24-bit, exactly TOTAL/30 s), stems, cues.txt.
import os, json
import numpy as np
from dsp import (SR, ns, st, rng, pan, place, fades, dbg, lp, hp, bp, integrated, true_peak, read_wav, write_wav, make_ir, convolve_st, colored)
import instruments as I
import sfx_gen as G

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FPS, TOTAL = 30, 2054
DUR = TOTAL / FPS
N = ns(DUR)
fr = lambda f: f / FPS
CUTS = [0, 131, 385, 570, 663, 830, 980, 1033, 1176, 1248, 1349, 1508, 1661, 1754, 1854, TOTAL]
LIGHT = ["day", "day", "day", "day", "day", "day", "golden", "golden", "golden", "golden", "day", "night", "day", "golden", "golden"]
CUES = []


def log_cue(t, name):
    CUES.append((t, name))


def put(buf, x, t, g_db=0.0, p=0.0, name=None):
    x = np.asarray(x, float)
    if x.ndim == 1:
        x = pan(x, p)
    place(buf, x, t, dbg(g_db))
    if name:
        log_cue(t, name)


# ================================================================ SFX
def musket(r, big=1.0):
    n = ns(1.6)
    t = np.arange(n) / SR
    crack = bp(r.standard_normal(n), 900, 7000, 2) * np.exp(-t / 0.012) * 1.2
    boom = lp(r.standard_normal(n), 260, 2) * np.exp(-t / 0.22) * 2.2 * big
    tail = lp(colored(n, r, -1.0), 1800, 1) * np.exp(-t / 0.55) * 0.35
    return fades(crack + boom + tail, 0.0005, 0.2)


def volley(buf, t0, r, n=7, spread=0.16, g=0.0):
    for i in range(n):
        put(buf, musket(r, 0.8 + 0.4 * r.random()), t0 + r.random() * spread, g - 2 + r.uniform(-2, 1), r.uniform(-0.6, 0.6))
    log_cue(t0, "musket volley")


def hoof(r, soft=0.6):
    n = ns(0.12)
    t = np.arange(n) / SR
    thud = lp(r.standard_normal(n), 500 + 300 * soft, 2) * np.exp(-t / 0.018)
    click = bp(r.standard_normal(n), 1500, 4000, 2) * np.exp(-t / 0.006) * 0.3 * (1 - soft)
    return fades(thud + click, 0.0005, 0.02)


def trot(buf, t0, t1, r, rate=1.8, horses=4, g=-8.0, soft=0.7, p=0.0):
    for h in range(horses):
        off = r.random() / rate
        t = t0 + off
        while t < t1:
            for k, d in enumerate([0, 0.11, 0.25, 0.36]):
                if t + d / rate * 1.8 < t1:
                    put(buf, hoof(r, soft), t + d / rate * 1.8, g + r.uniform(-3, 0), p + r.uniform(-0.3, 0.3))
            t += 1 / rate


def run_steps(buf, t0, t1, r, rate=3.4, people=10, g=-14.0, p=0.0):
    for k in range(people):
        t = t0 + r.random() / rate
        while t < t1:
            put(buf, G.boot(r, 0.6 + 0.4 * r.random()), t, g + r.uniform(-4, 0), p + r.uniform(-0.5, 0.5))
            t += 1 / rate * r.uniform(0.92, 1.08)


def bugle(notes, r, vel=0.9):
    """trumpet call: list of (start, dur, midi)"""
    out = np.zeros(ns(max(s + d for s, d, _ in notes) + 0.5))
    for s, d, m in notes:
        x = I.brass(I.m2f(m), d, vel, r, kind="stab", scoop=-30)
        i = ns(s)
        out[i:i + len(x)] += x[: len(out) - i]
    return out


CHARGE = [(0, .14, 72), (.16, .14, 72), (.32, .14, 72), (.48, .3, 77), (.82, .14, 72), (.98, .55, 77), (1.6, .14, 72), (1.76, .14, 77), (1.92, .9, 81)]


def squelch(r, dur=0.6):
    return G.bubbles(dur, r, 20, 120, 700, (0.02, 0.06))


def growl(r):
    n = ns(0.7)
    t = np.arange(n) / SR
    f = 55 + 20 * np.sin(t * 9) + 15 * r.standard_normal(n).cumsum() / np.sqrt(np.arange(1, n + 1))
    ph = np.cumsum(2 * np.pi * f / SR)
    return fades(np.sin(ph) * (0.6 + 0.4 * np.sin(t * 23)) * np.sin(np.pi * t / 0.7) ** 2 * 0.8, 0.01, 0.05)


def ding(r):
    return I.glock(I.m2f(88), 0.8, r) + 0.6 * I.glock(I.m2f(95), 0.6, r)


def build_sfx(words):
    r = rng(1796)
    S = np.zeros((2, N))
    # --- ambience beds (per shot light/place)
    for i in range(15):
        a, b = fr(CUTS[i]), fr(CUTS[i + 1])
        d = b - a + 0.4
        if i == 11:
            put(S, fades(G.crickets(d, r, 3) * 0.5, 0.2, 0.3), a - 0.2, -20)
            put(S, fades(G.breeze(d, r, 0.6, 0.1, 500), 0.2, 0.3), a - 0.2, -22)
        else:
            put(S, fades(G.breeze(d, r, 1.0, 0.2, 900), 0.2, 0.3), a - 0.2, -21)
            if i in (0, 1, 5, 6, 7, 10, 12, 13, 14):
                put(S, fades(G.bird_chirps(d, r, 0.35), 0.2, 0.3), a - 0.2, -27)
            if i in (2, 3, 4):
                put(S, fades(G.water_bed(d, r, 0.4), 0.2, 0.3), a - 0.2, -26)
    # --- cut whooshes on the big reframes
    for f in [50, 226, 324, 496, 619, 707, 763, 921, 1123, 1322, 1442, 1578, 1621, 1988]:
        put(S, G.whoosh(0.45, r, peak=0.22), fr(f) - 0.25, -16, 0.0, "whoosh")
    put(S, G.whoosh(0.9, r, peak=0.4, f_lo=500, f_hi=4000), fr(131) - 0.4, -12, 0, "flash swell")
    # 1 hook: trumpet call
    put(S, bugle(CHARGE, r, 0.9), 1.68, -8, 0.3, "hook trumpets")
    trot(S, 2.6, 4.3, r, 1.0, 4, -13, 0.8, 0.2)
    # 2 intro: Napoleon, hungry army growls
    for k, t in enumerate([10.05, 10.5, 11.0]):
        put(S, growl(r), t, -9 - 2 * k, [-0.3, 0.3, 0.0][k], "belly growl")
    # 3 charge: running boots, volley, retreat
    run_steps(S, 12.8, 17.9, r, 3.4, 12, -15, 0.2)
    G_h = G.hurrah(r, 140, 1.0)
    put(S, G_h, 13.2, -17, 0.1, "charge shout")
    volley(S, 17.82, r, 8, 0.12, -4)
    run_steps(S, 17.95, 19.0, r, 3.6, 10, -15, -0.2)
    put(S, G.whoa(r, 160), 18.0, -14, -0.2, "whoa")
    # 4 flag grab
    put(S, G.flag_flutter(2.2, r), 19.55, -12, 0.2, "flag")
    put(S, I.brass(I.m2f(67), 0.25, 0.8, r, "stab"), 19.6, -14, 0.0, "grab stab")
    run_steps(S, 20.6, 22.2, r, 3.4, 10, -14, 0.0)
    # 5 fire, aide, sweep, splash
    volley(S, 22.92, r, 9, 0.15, -2)
    put(S, musket(r, 0.7), 24.22, -6, -0.4, "aide shot")
    put(S, G.oof(r, "oof"), 24.3, -12, -0.4, "aide oof")
    run_steps(S, 25.4, 27.0, r, 3.8, 14, -13, 0.3)
    put(S, G.whoa(r, 190), 26.45, -10, 0.3, "napoleon whoa")
    put(S, G.splash_big(r), 26.98, -6, 0.4, "mud splash")
    put(S, squelch(r, 1.2), 27.3, -10, 0.3, "squelch")
    put(S, G.bubbles(0.25, r, 30, 300, 900, (0.01, 0.03)), 27.38, -9, 0.3, "hat lands")
    put(S, I.glock(I.m2f(84), 0.4, r), 27.4, -16, 0.3)
    put(S, G.whoosh(0.5, r, peak=0.3, f_lo=600, f_hi=3000), 26.5, -16, 0.3, "hat flies")
    # 6 mud
    for t in [28.2, 29.4, 30.3]:
        put(S, G.bubbles(0.5, r, 10, 150, 600, (0.02, 0.05)), t, -14, 0.1, "mud bubble")
    put(S, squelch(r, 0.9), 31.5, -6, 0.0, "pulled out")
    put(S, G.oof(r, "oof"), 31.6, -12, -0.2)
    # 7 idea
    put(S, ding(r), 33.48, -9, 0.1, "idea ding")
    # 8 ride
    trot(S, 34.4, 37.4, r, 1.8, 6, -12, 0.75, -0.2)
    put(S, fades(G.breeze(3.0, r, 1.4, 0.3, 2500), 0.3, 0.5), 34.4, -18, 0, "reeds rustle")
    trot(S, 37.4, 39.2, r, 1.8, 6, -18, 0.85, 0.0)
    # 9 blow: four trumpets, loud
    for k in range(4):
        put(S, bugle(CHARGE, r, 1.0), 39.45 + k * 0.03, -6 - k, [-0.5, -0.15, 0.2, 0.5][k], "trumpet charge" if k == 0 else None)
    put(S, bugle([(0, .2, 77), (.22, .2, 81), (.44, 1.0, 84)], r, 1.0), 41.4 - 0.1, -9, 0, "trumpet high")
    # 10 panic
    put(S, G.whoa(r, 210), 42.45, -10, -0.2, "austrian gasp")
    put(S, G.babble(1.4, r, 170, 1.0), 43.6, -14, 0.0, "panic babble")
    run_steps(S, 44.0, 45.3, r, 3.9, 14, -13, 0.2)
    # 11 reeds
    put(S, fades(G.breeze(4.8, r, 1.6, 0.35, 2600), 0.3, 0.5), 45.0, -15, 0, "reed rustle")
    put(S, bugle([(0, .2, 72), (.22, .5, 77)], r, 0.5), 48.6, -20, 0.6, "distant trumpet")
    # 12 street: footsteps behind
    t = 50.3
    while t < 55.5:
        put(S, G.stroll_step(r, 0.4), t, -11, 0.0)
        put(S, G.stroll_step(r, 0.6), t + 0.27, -15, 0.15)
        t += 0.55
    log_cue(50.3, "street footsteps")
    put(S, I.timpani(I.m2f(38), 0.9, r), 54.05, -8, 0, "looming shadow")
    # 13 regiment
    for k in range(4):
        put(S, bugle(CHARGE, r, 0.8), 55.5 + k * 0.05, -16 - k, [-0.3, -0.1, 0.1, 0.3][k], "far trumpets" if k == 0 else None)
    trot(S, 57.45, 58.6, r, 2.2, 14, -10, 0.6, 0.0)
    put(S, G.hurrah(r, 120, 1.2), 57.5, -12, 0.0, "imagined regiment")
    # 14 painter
    for t in np.arange(58.7, 61.6, 0.72):
        put(S, I.brush(0.5, r, 0.35, swish=True), t, -14, 0.2)
    put(S, I.triangle(0.5, r), 61.05, -10, 0.0, "legend sparkle")
    # 15 painting: reveal sting
    put(S, squelch(r, 0.6), 66.4, -12, 0.3, "muddy Napoleon")
    return S


# ================================================================ music
CH = {"F": [41, 53, 57, 60], "C": [36, 52, 55, 60], "C7": [36, 52, 58, 60], "Bb": [34, 53, 58, 62], "Dm": [38, 53, 57, 62],
      "Gm": [43, 55, 58, 62], "A": [33, 52, 57, 61], "Eb": [39, 55, 58, 63]}
# march tune (bar, beat, quarters, midi) in F major, 112 bpm
TUNE = [(1, 0, 1, 72), (1, 1, .5, 72), (1, 1.5, .5, 74), (1, 2, 1, 77), (1, 3, 1, 72),
        (2, 0, 1, 76), (2, 1, .5, 74), (2, 1.5, .5, 72), (2, 2, 2, 74),
        (3, 0, 1, 70), (3, 1, .5, 70), (3, 1.5, .5, 72), (3, 2, 1, 74), (3, 3, 1, 70),
        (4, 0, 1, 69), (4, 1, 1, 72), (4, 2, 2, 77)]
PROG = ["F", "C7", "Bb", "F"]


def build_music():
    r = rng(1797)
    M = np.zeros((2, N))
    Q = 60 / 112
    bar = 4 * Q

    def march(t0, t1, vel=0.7, tune=True, transpose=0, snare=True, fife=True):
        nb = int((t1 - t0) / bar) + 1
        for b in range(nb):
            tb = t0 + b * bar
            if tb >= t1:
                break
            ch = CH[PROG[b % 4]]
            for beat in range(4):
                tq = tb + beat * Q
                if tq >= t1:
                    break
                if beat % 2 == 0:
                    put(M, I.brass(I.m2f(ch[0] + transpose + (0 if beat == 0 else 7)), Q * 0.8, vel, r, "tuba"), tq, -4, -0.1)
                else:
                    for m in ch[1:]:
                        put(M, I.brass(I.m2f(m + transpose), Q * 0.45, vel * 0.5, r, "horn"), tq, -14, 0.15)
                if snare:
                    put(M, I.snare(vel * (0.9 if beat == 0 else 0.6), r), tq, -10, 0.05)
                    if beat == 3:
                        put(M, I.snare(vel * 0.45, r), tq + Q / 2, -13, 0.05)
            if tune:
                for (bb, beat, d, m) in TUNE:
                    if bb == b % 4 + 1:
                        t = tb + beat * Q
                        if t < t1:
                            x = I.fife(I.m2f(m + transpose), d * Q * 0.9, vel * 0.8, r) if fife else I.brass(I.m2f(m + transpose - 12), d * Q * 0.9, vel, r, "horn")
                            put(M, x, t, -9, -0.25)

    # hook: fanfare stab and short march (0-4.3)
    put(M, I.brass(I.m2f(65), 0.5, 0.9, r, "stab") + I.brass(I.m2f(69), 0.5, 0.8, r, "stab"), 0.0, -6)
    march(0.55, 4.25, 0.7)
    put(M, I.cymbal(0.6, r), fr(131), -12, 0, )
    # story march (flash -> mud): building
    march(fr(131), 22.0, 0.75)
    for k in range(6):
        put(M, I.snare(0.5 + 0.08 * k, r), 22.0 + k * 0.08, -12)
    # fire / swept: tension stabs then a deflating tuba slide into the mud
    for t, m in [(22.9, 61), (24.25, 60), (25.45, 59)]:
        put(M, I.brass(I.m2f(m), 0.4, 0.9, r, "stab"), t, -8, 0, "stab")
    put(M, I.brass(I.m2f(41), 1.4, 0.9, r, "tuba", fall=-7), 27.05, -2, 0, "tuba deflate")
    # mud: sad tuba waltz (slow)
    for k, m in enumerate([41, 48, 45, 41, 40, 43, 36]):
        put(M, I.brass(I.m2f(m), 0.6, 0.6, r, "soft"), 28.0 + k * 0.62, -6)
    # day three: soft dawn pad then trot rhythm
    put(M, I.pad([I.m2f(m) for m in (53, 57, 60, 65)], 2.2, 0.5, r), 32.5, -12, 0, "dawn pad")
    put(M, I.glock(I.m2f(84), 0.6, r), 33.5, -10)
    for k in range(int((39.2 - 34.4) / (Q / 2))):
        t = 34.4 + k * Q / 2
        put(M, I.pluck(I.m2f([53, 60, 57, 60][k % 4]), 0.6, r), t, -10, 0.2)
        if k % 2 == 0:
            put(M, I.brush(0.4, r), t, -16, -0.1)
    # blow: full band tutti
    march(39.25, 41.6, 0.95, tune=True, fife=False)
    # panic: fast chromatic run + snare roll
    for k in range(12):
        put(M, I.fife(I.m2f(72 + k), 0.09, 0.7, r), 42.5 + k * 0.1, -10, 0.2)
    for tr, vr in I.snare_roll(43.6, 44.9, 0.3, 0.9, r):
        put(M, I.snare(vr, r, buzz=True), tr, -15, 0)
    # explanation: gentle vibes ostinato (45 - 50.2)
    for k in range(int((50.2 - 45.0) / (Q / 2))):
        put(M, I.vibes(I.m2f([65, 69, 72, 69][k % 4]), 0.45, r), 45.0 + k * Q / 2, -14, 0.1)
    put(M, I.pad([I.m2f(m) for m in (41, 53, 57, 60)], 5.0, 0.4, r), 45.0, -16)
    # night street: low ominous pad + heartbeat tuba
    put(M, I.pad([I.m2f(m) for m in (38, 50, 53, 57)], 5.2, 0.5, r, att=0.4), 50.3, -12, 0, "night pad")
    for k in range(9):
        put(M, I.brass(I.m2f(38), 0.18, 0.5 + 0.04 * k, r, "soft"), 50.6 + k * 0.55, -10)
    # regiment: huge tutti hit
    put(M, I.cymbal(0.9, r, 3.0), 57.48, -8, 0, "cymbal crash")
    march(57.5, 58.5, 1.0, tune=False)
    # painter: pompous slow fanfare
    for k, (m, d) in enumerate([(65, .5), (69, .5), (72, 1.0), (77, 1.6)]):
        put(M, I.brass(I.m2f(m), d, 0.75, r, "horn"), 58.6 + [0, .55, 1.1, 2.2][k], -8, 0)
    put(M, I.pad([I.m2f(m) for m in (41, 57, 60, 65)], 3.0, 0.5, r), 58.6, -14)
    # painting: grand version of the tune, then a deflating tuba on "never even made it"
    march(61.85, 66.3, 0.8, fife=False)
    put(M, I.brass(I.m2f(48), 0.35, 0.8, r, "tuba"), 66.35, -3)
    put(M, I.brass(I.m2f(41), 1.6, 0.8, r, "tuba", fall=-5), 67.45, -2, 0, "final deflate")
    ir = make_ir(1.2, 7)
    return convolve_st(M, ir) * 0.35 + M * 0.8


# ================================================================ mix
def limiter(x, ceil_db=-1.2):
    c = dbg(ceil_db)
    a = np.abs(x).max(0)
    g = np.minimum(1.0, c / np.maximum(a, 1e-9))
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    g = minimum_filter1d(g, ns(0.004))
    g = uniform_filter1d(g, ns(0.004))
    return x * g


def main():
    words = json.load(open(os.path.join(ROOT, "voice", "words.json")))
    x, sr = read_wav(os.path.join(ROOT, "voice", "voice.wav"))
    v = x[0] if x.ndim > 1 else x
    vb = np.zeros(N); vb[: min(N, len(v))] = v[:N]
    V = st(vb)
    S = build_sfx(words)
    M = build_music()
    Lv = integrated(V)
    # ducking under speech for music
    ctrl = np.zeros(N)
    for w in words:
        ctrl[ns(max(0, w["s"] - 0.08)): ns(min(DUR, w["e"] + 0.12))] = 1
    from scipy.ndimage import uniform_filter1d
    duck = dbg(-3.0 * uniform_filter1d(ctrl, ns(0.15)))
    Lm, Ls = integrated(M), integrated(S)
    gm = dbg(Lv - 10.0 - Lm)          # music bed 10 LU under the voice (standard +3 dB on the usual -13)
    gs = dbg(Lv - 6.0 - 6.0 - Ls)    # sfx stem 12 LU under voice before... = designed level -6 dB
    M2, S2 = M * gm * duck, S * gs
    mix = V + M2 + S2
    L = integrated(mix)
    g = dbg(-15.0 - L)
    out = limiter(mix * g, -2.0)
    out = out[:, :N]
    write_wav(os.path.join(HERE, "mix.wav"), out)
    write_wav(os.path.join(HERE, "stem_voice.wav"), V * g)
    write_wav(os.path.join(HERE, "stem_music.wav"), M2 * g)
    write_wav(os.path.join(HERE, "stem_sfx.wav"), S2 * g)
    with open(os.path.join(HERE, "cues.txt"), "w") as fh:
        for t, n in sorted(CUES):
            fh.write(f"{t:7.2f}s  f{int(round(t * FPS)):5d}  {n}\n")
    print(f"voice {Lv:.1f} LUFS, music {Lm:.1f}, sfx {Ls:.1f} -> mix {integrated(out):.2f} LUFS, TP {true_peak(out):.2f} dBTP, {out.shape[1] / SR:.3f} s")


if __name__ == "__main__":
    main()
