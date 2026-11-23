# Sound for "The Pharaoh Who Edited His Own War" (Kadesh): synthesized SFX + an original light military score, mixed under the
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
FPS, TOTAL = 30, 2371
DUR = TOTAL / FPS
N = ns(DUR)
fr = lambda f: f / FPS
CUTS = [0, 265, 513, 699, 855, 911, 1079, 1134, 1315, 1408, 1575, 1750, 1860, 2066, 2219, TOTAL]
INDOOR = {14}
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


def flap(r, n=4, rate=7.0):
    out = np.zeros(ns(n / rate + 0.2))
    for k in range(n):
        x = bp(r.standard_normal(ns(0.09)), 400, 2600, 2) * np.exp(-np.arange(ns(0.09)) / SR / 0.025)
        i = ns(k / rate); out[i:i + len(x)] += x[: len(out) - i] * (0.8 + 0.4 * r.random())
    return fades(out, 0.002, 0.05)


def coo(r, base=320):
    n = ns(0.7); t = np.arange(n) / SR
    f = base * (1 + 0.25 * np.sin(np.pi * t / 0.7)) * (1 + 0.03 * np.sin(2 * np.pi * 7 * t))
    y = np.sin(np.cumsum(2 * np.pi * f / SR)) + 0.3 * np.sin(np.cumsum(4 * np.pi * f / SR))
    return lp(y * np.sin(np.pi * t / 0.7) ** 2, 1500, 2) * 0.6


def boom(r):
    n = ns(2.2); t = np.arange(n) / SR
    low = lp(r.standard_normal(n), 120, 2) * np.exp(-t / 0.45) * 3.0
    crack = bp(r.standard_normal(n), 600, 5000, 2) * np.exp(-t / 0.03) * 1.2
    debris = lp(colored(n, r, -1.0), 2500, 1) * np.exp(-t / 0.7) * 0.5
    return fades(low + crack + debris, 0.001, 0.3)


def ring(r, dur=0.9):
    n = ns(dur); t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * 1200 * t) + np.sin(2 * np.pi * 1500 * t)) * (np.sin(2 * np.pi * 22 * t) > 0)
    return fades(y * 0.25, 0.005, 0.05)


def gallop(buf, t0, t1, r, horses=4, g=-10.0, p=0.0, rate=2.3):
    trot(buf, t0, t1, r, rate, horses, g, 0.5, p)
    n = ns(max(0.1, t1 - t0))
    rum = lp(colored(n, r, -1.0), 180, 2) * 0.8
    put(buf, fades(rum, 0.2, 0.3), t0, g - 2, p)


def chisel(r):
    x = I.glock(I.m2f(98 + r.integers(0, 4)), 0.35, r, 0.25) * 0.7
    n = min(len(x), ns(0.05)); x[:n] += bp(r.standard_normal(n), 2000, 6000, 2) * np.exp(-np.arange(n) / SR / 0.008)
    return x


def horn(r, m=55, dur=1.2, vel=0.8):
    return I.brass(I.m2f(m), dur, vel, r, "horn", scoop=-40)


def build_sfx(words):
    r = rng(1274)
    S = np.zeros((2, N))
    for i in range(15):
        a, b = fr(CUTS[i]), fr(CUTS[i + 1]); d = b - a + 0.4
        if i in INDOOR:
            put(S, fades(G.babble(d, r, 190, 0.8, rate=3.0, active=0.4) * 0.3, 0.3, 0.3), a - 0.2, -30)
        else:
            put(S, fades(G.breeze(d, r, 1.2, 0.3, 700), 0.2, 0.3), a - 0.2, -20)
    for f in [49, 171, 410, 636, 750, 826, 1012, 1225, 1515, 1663, 1968]:
        put(S, G.whoosh(0.45, r, peak=0.22), fr(f) - 0.25, -16, 0.0, "whoosh")
    put(S, G.whoosh(0.9, r, peak=0.4, f_lo=500, f_hi=4000), fr(265) - 0.4, -12, 0, "flash swell")
    # 1 hook: chariot, crash, chisel, sparkle
    gallop(S, 0.0, 1.6, r, 2, -12, 0.2)
    put(S, G.wood_crack(r), 1.63, -4, 0.2, "chariot crash")
    put(S, G.push_thump(r), 1.75, -6, 0.1)
    put(S, G.oof(r, "oof"), 1.8, -10, 0.1, "Ramesses oof")
    for t in np.arange(5.8, 8.6, 0.32): put(S, chisel(r), t, -12, r.uniform(-0.4, 0.4), "chisel" if t == 5.8 else None)
    put(S, I.triangle(0.7, r), 7.72, -9, 0, "victory sparkle")
    # 2 march
    run_steps(S, 13.7, 17.0, r, 2.2, 14, -18, 0.0)
    put(S, horn(r, 50, 1.0), 13.8, -12, -0.2, "war horn")
    # 3 nomads
    for t in np.arange(17.1, 19.4, 0.45): put(S, G.stroll_step(r, 0.6), t, -16, -0.3)
    put(S, I.glock(I.m2f(84), 0.4, r), 21.0, -14, -0.2, "bubble pop")
    put(S, I.glock(I.m2f(88), 0.4, r), 22.1, -14, -0.2)
    # 4 race + camp pops
    put(S, G.hurrah(r, 150, 1.0), 23.8, -14, 0, "Ramesses cheer")
    gallop(S, 25.0, 27.55, r, 2, -9, 0.1)
    run_steps(S, 25.0, 27.5, r, 3.4, 9, -16, -0.1)
    for k in range(8): put(S, G.flag_flutter(0.3, r), 27.55 + k * 0.09, -16, r.uniform(-0.5, 0.5), "tents pop" if k == 0 else None)
    # 5 spies reveal
    put(S, G.whoosh(0.4, r, peak=0.3, f_lo=800, f_hi=3000), 29.0, -12, 0.2, "disguise off")
    put(S, I.brass(I.m2f(46), 0.6, 0.7, r, "soft", fall=-3), 29.3, -12, 0, "uh-oh tuba")
    # 6 charge
    gallop(S, 30.4, 33.7, r, 10, -4, 0.0, 2.6)
    put(S, G.hurrah(r, 130, 1.3), 30.6, -12, 0, "Hittite war cry")
    gallop(S, 33.6, 35.9, r, 4, -6, 0.0, 2.6)
    for k in range(5): put(S, G.oof(r, "oof"), 33.85 + k * 0.12, -12, r.uniform(-0.5, 0.5), "soldiers bowled over" if k == 0 else None)
    put(S, G.wood_crack(r), 33.8, -8, 0.2)
    # 7 camp crash
    gallop(S, 35.95, 37.8, r, 1, -8, 0.0, 2.6)
    put(S, G.wood_crack(r), 36.45, -3, 0.0, "tent crash")
    put(S, G.flag_flutter(0.8, r), 36.5, -10, 0.0)
    put(S, G.whoa(r, 170), 36.6, -12, -0.3)
    # 8 legend
    run_steps(S, 38.9, 40.8, r, 3.8, 10, -16, 0.2)
    gallop(S, 40.8, 43.8, r, 2, -8, 0.0, 2.4)
    put(S, I.cymbal(0.6, r), 42.95, -12, 0, "heroic hit")
    # 9 rescue
    put(S, horn(r, 55, 1.3, 0.9), 43.85, -8, 0, "rescue horns")
    put(S, horn(r, 59, 1.0, 0.8), 44.2, -10, 0.2)
    run_steps(S, 43.9, 46.8, r, 3.0, 14, -16, 0.0)
    # 10 draw + city wall laugh
    put(S, G.babble(1.8, r, 160, 1.0, rate=3, active=0.4), 47.2, -20, 0, "groans")
    put(S, G.hurrah(r, 160, 1.1), 50.6, -12, 0, "Hittites cheer")
    # 11 feed: chisel taps
    for t in np.arange(52.6, 55.3, 0.35): put(S, chisel(r), t, -14, -0.2)
    put(S, G.whoosh(1.2, r, peak=0.5, f_lo=300, f_hi=1500), 55.5, -14, 0, "tilt up the wall")
    # 12 reel
    put(S, G.flag_flutter(0.5, r), 59.85, -8, 0.2, "outtake torn off")
    # 13 carve
    for t in np.arange(62.0, 66.0, 0.28): put(S, chisel(r), t, -13, r.uniform(-0.5, 0.5))
    put(S, I.timpani(I.m2f(38), 0.9, r), 67.72, -8, 0, "giant reveal")
    # 14 treaty
    put(S, I.triangle(0.6, r), 71.2, -10, 0, "treaty sparkle")
    put(S, G.applause(2.0, r, 20), 71.4, -18, 0)
    # 15 UN: footsteps + hush
    for t in np.arange(74.0, 78.5, 0.55): put(S, G.stroll_step(r, 0.3), t, -20, r.uniform(-0.4, 0.4))
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
    r = rng(1275)
    M = np.zeros((2, N))
    Q = 60 / 104
    # Egyptian-flavoured ostinato: D Phrygian-dominant-ish (D Eb F# G A Bb C)
    SC = [62, 63, 66, 67, 69, 70, 72, 74]
    def ost(t0, t1, vel=0.55, g=-12, base=50):
        k = 0
        while t0 + k * Q / 2 < t1:
            put(M, I.pluck(I.m2f([base, base + 7, base + 1, base + 7][k % 4]), vel, r), t0 + k * Q / 2, g, -0.2)
            if k % 2 == 0: put(M, I.brush(0.4, r), t0 + k * Q / 2, g - 6, 0.1)
            if k % 4 == 0: put(M, I.timpani(I.m2f(38), 0.5, r, 0.8), t0 + k * Q / 2, g - 2, 0)
            k += 1
    def melody(t0, notes, vel=0.6, g=-10, inst="fife"):
        t = t0
        for m, d in notes:
            if m: put(M, (I.fife(I.m2f(m), d * Q * 0.9, vel, r) if inst == "fife" else I.brass(I.m2f(m - 12), d * Q * 0.9, vel, r, "horn")), t, g, 0.2)
            t += d * Q
    TUNE = [(62, 1), (63, 0.5), (66, 0.5), (67, 1), (66, 0.5), (63, 0.5), (62, 2), (69, 1), (70, 0.5), (69, 0.5), (67, 1), (66, 1), (62, 2)]
    # hook: brass fanfare, then a sad slide on the crash
    put(M, I.brass(I.m2f(62), 0.4, 0.9, r, "stab") + I.brass(I.m2f(69), 0.4, 0.8, r, "stab"), 0.05, -6)
    put(M, I.brass(I.m2f(57), 0.9, 0.8, r, "tuba", fall=-6), 1.7, -4, 0, "crash slide")
    ost(5.7, 8.7, 0.5, -13)
    put(M, I.cymbal(0.6, r), fr(265), -12)
    # story: ostinato + tune
    ost(8.9, 23.2, 0.55, -11)
    melody(9.2, TUNE, 0.55, -11)
    melody(16.6, TUNE, 0.5, -12)
    # race: faster, brass tune
    ost(23.3, 28.4, 0.65, -10, 52)
    melody(25.0, TUNE[:7], 0.75, -9, "brass")
    # spies: stop + low stab
    put(M, I.brass(I.m2f(44), 0.5, 0.85, r, "stab"), 29.2, -6, 0, "spy stab")
    # charge: driving drums + minor brass
    for k in range(int((37.7 - 30.3) / (Q / 2))):
        t = 30.3 + k * Q / 2
        put(M, I.timpani(I.m2f(38 if k % 2 == 0 else 45), 0.7, r, 0.6), t, -8, 0)
        if k % 2: put(M, I.snare(0.5, r), t, -14, 0.1)
    melody(30.4, [(62, 1), (63, 1), (66, 1), (67, 2), (66, 1), (63, 1), (62, 2)], 0.8, -8, "brass")
    # legend: heroic golden fanfare (over the top)
    for k, (m, dd) in enumerate([(62, .5), (66, .5), (69, .5), (74, 1.5), (72, .5), (74, 2)]): put(M, I.brass(I.m2f(m), dd, 0.85, r, "horn"), 40.8 + sum(x[1] for x in [(62, .5), (66, .5), (69, .5), (74, 1.5), (72, .5), (74, 2)][:k]) * Q, -6)
    put(M, I.pad([I.m2f(m) for m in (50, 62, 66, 69)], 3.0, 0.5, r), 40.8, -14)
    # rescue: march resumes
    ost(43.8, 46.9, 0.6, -11)
    # draw: deflated tuba + shrug
    put(M, I.brass(I.m2f(50), 1.2, 0.7, r, "tuba", fall=-5), 47.0, -5, 0, "nobody won")
    put(M, I.brass(I.m2f(45), 0.5, 0.6, r, "soft"), 49.0, -10)
    # explanation: lighter, plucked + glock
    for k in range(int((62.0 - 52.5) / (Q / 2))):
        put(M, I.pluck(I.m2f(SC[(k * 3) % 8]), 0.45, r), 52.5 + k * Q / 2, -14, 0.1)
        if k % 4 == 0: put(M, I.glock(I.m2f(SC[(k // 4) % 8] + 12), 0.4, r), 52.5 + k * Q / 2, -16)
    put(M, I.brass(I.m2f(43), 0.7, 0.7, r, "tuba", fall=-6), 59.9, -6, 0, "outtake deflate")
    # carve: grand reprise
    ost(62.0, 68.8, 0.6, -10)
    melody(62.0, TUNE, 0.8, -8, "brass")
    put(M, I.cymbal(0.7, r), 67.7, -10)
    # treaty + UN: warm resolve
    put(M, I.pad([I.m2f(m) for m in (50, 62, 66, 69)], 5.0, 0.45, r), 68.9, -13, 0, "treaty")
    melody(69.0, [(69, 1), (67, 1), (66, 1), (62, 3)], 0.5, -12)
    put(M, I.pad([I.m2f(m) for m in (55, 62, 67, 71)], 5.2, 0.4, r), 73.9, -14)
    for k, m in enumerate([74, 71, 67, 62]): put(M, I.musicbox(I.m2f(m), 0.5, r), 74.2 + k * 0.6, -12)
    put(M, I.brass(I.m2f(62), 1.4, 0.8, r, "horn") + I.brass(I.m2f(69), 1.4, 0.7, r, "horn"), 77.6, -7, 0, "final chord")
    ir = make_ir(1.4, 9)
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
