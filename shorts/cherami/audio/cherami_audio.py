# Sound for "The One-Eyed, One-Legged War Hero" (Cher Ami): synthesized SFX + an original light military score, mixed under the
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
FPS, TOTAL = 30, 1897
DUR = TOTAL / FPS
N = ns(DUR)
fr = lambda f: f / FPS
CUTS = [0, 121, 290, 385, 514, 600, 651, 766, 892, 1127, 1435, 1528, 1580, 1670, 1754, TOTAL]
INDOOR = {12, 13, 14}
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


def build_sfx(words):
    r = rng(1918)
    S = np.zeros((2, N))
    for i in range(15):
        a, b = fr(CUTS[i]), fr(CUTS[i + 1]); d = b - a + 0.4
        if i in INDOOR:
            put(S, fades(G.babble(d, r, 190, 0.8, rate=3.0, active=0.4) * 0.3, 0.3, 0.3), a - 0.2, -30)
        else:
            put(S, fades(G.breeze(d, r, 1.0, 0.25, 1100), 0.2, 0.3), a - 0.2, -21)
            put(S, fades(G.bird_chirps(d, r, 0.25), 0.2, 0.3), a - 0.2, -29)
    for f in [66, 202, 253, 322, 433, 681, 721, 962, 1003, 1068, 1198, 1238, 1477, 1788]:
        put(S, G.whoosh(0.45, r, peak=0.22), fr(f) - 0.25, -16, 0.0, "whoosh")
    put(S, G.whoosh(0.9, r, peak=0.4, f_lo=500, f_hi=4000), fr(121) - 0.4, -12, 0, "flash swell")
    # 1 hook: proud strut, medal ding
    put(S, coo(r, 300), 0.4, -10, 0.2, "coo")
    for t in np.arange(0.3, 3.8, 0.6): put(S, G.boot(r, 0.3), t, -22, 0.1)
    put(S, I.triangle(0.6, r), 2.4, -10, 0, "medal ding")
    # 2 forest: distant guns, nervous murmur
    for t in [5.0, 6.6, 8.1]: put(S, lp(boom(r), 400) , t, -24, r.uniform(-0.6, 0.6), "distant gun")
    put(S, G.babble(2.5, r, 160, 1.0, rate=3.5, active=0.5), 6.9, -22, 0.0, "murmur")
    # 3 shelling
    put(S, I.brass(I.m2f(62), 0.3, 0.6, r, "soft"), 9.8, -16, 0, "hopeful")
    for k, t in enumerate([11.05, 11.5, 11.95, 12.35]):
        put(S, G.whoosh(0.5, r, peak=0.45, f_lo=800, f_hi=3000), t - 0.45, -14, [-0.4, 0.4, -0.2, 0.3][k], "shell whistle" if k == 0 else None)
        put(S, boom(r), t, -2, [-0.4, 0.4, -0.2, 0.3][k], "shell burst" if k == 0 else None)
    put(S, G.whoa(r, 170), 11.2, -12, 0.0, "whoa")
    # 4 radio + basket
    put(S, I.brass(I.m2f(50), 0.5, 0.6, r, "soft", fall=-3), 13.5, -14, 0, "shrug tuba")
    put(S, coo(r, 340) + 0.0, 15.95, -10, -0.2, "basket coos")
    put(S, coo(r, 380), 16.2, -12, 0.2)
    # 5 first two pigeons
    for t0, hit in [(17.05, 17.87), (18.55, 19.32)]:
        put(S, flap(r, 6, 8), t0, -9, 0.1, "flap")
        put(S, musket(r, 0.8), hit - 0.02, -4, 0.3, "shot")
        put(S, G.bubbles(0.3, r, 40, 1500, 4000, (0.005, 0.02)), hit, -16, 0.1, "feather poof")
    # 6 the last one
    put(S, I.glock(I.m2f(91), 0.7, r) + 0.6 * I.glock(I.m2f(96), 0.5, r), 20.82, -10, 0, "hero sparkle")
    # 7 takeoff + rifles
    put(S, flap(r, 8, 8), 21.95, -7, 0, "takeoff flaps")
    volley(S, 22.95, r, 10, 1.0, -6)
    for k in range(5): put(S, G.whoosh(0.25, r, peak=0.5, f_lo=2000, f_hi=7000), 24.1 + k * 0.33, -14, [-0.5, 0.5][k % 2], "bullet whiz" if k == 0 else None)
    # 8 hits
    t = 25.0
    while t < 29.7:
        put(S, flap(r, 1, 8), t, -15, 0); t += 0.28
    for k in range(6): put(S, G.whoosh(0.25, r, peak=0.5, f_lo=2000, f_hi=7000), 25.6 + k * 0.45, -15, [-0.5, 0.5][k % 2])
    for th in [26.09, 27.0, 28.14]:
        put(S, musket(r, 0.6), th - 0.05, -8, 0.4, "hit")
        put(S, G.oof(r, "oof", base=520, scale=1.4), th + 0.03, -12, 0, "pigeon squawk")
    # 9 landing, message, phone
    put(S, flap(r, 6, 7), 30.2, -12, -0.2)
    put(S, G.push_thump(r), 31.05, -8, 0, "landing thump")
    put(S, coo(r, 280), 31.4, -12, 0)
    put(S, G.flag_flutter(0.6, r), 32.5, -14, 0.1, "paper")
    put(S, ring(r), 35.5, -12, -0.2, "field telephone")
    put(S, G.whoa(r, 140), 36.8, -10, 0, "stop it shout")
    # 10 explanation
    put(S, G.flag_flutter(0.8, r), 39.1, -14, -0.3, "map tossed")
    put(S, I.glock(I.m2f(84), 0.6, r), 40.5, -12, 0, "home ding")
    t = 41.3
    while t < 47.6:
        put(S, flap(r, 1, 7), t, -20, 0); t += 0.31
    put(S, I.triangle(0.5, r), 42.85, -14, 0.3, "sun")
    put(S, fades(lp(colored(ns(1.8), r, 0), 900) * np.sin(np.linspace(0, np.pi, ns(1.8))), 0.1, 0.1), 43.65, -18, -0.2, "magnetic hum")
    put(S, I.glock(I.m2f(91), 0.5, r), 45.6, -12, 0.2, "phone pop")
    # 11 survived + leg
    for k in range(9): put(S, G.stroll_step(r, 0.5), 47.9 + k * 0.33, -18, r.uniform(-0.4, 0.4))
    for t in np.arange(49.2, 50.2, 0.25): put(S, G.wood_crack(r) * 0.3, t, -18, 0.2, "whittling" if t == 49.2 else None)
    put(S, I.triangle(0.6, r), 50.15, -10, 0, "peg leg")
    # 12 medal
    put(S, G.applause(2.4, r, 30), 52.0, -14, 0, "applause")
    put(S, I.triangle(0.7, r), 52.0, -9, 0, "medal")
    # 13-15 museum
    put(S, G.babble(1.8, r, 230, 1.1), 53.4, -18, 0, "visitors 'she'")
    put(S, I.glock(I.m2f(88), 0.6, r) + I.glock(I.m2f(93), 0.5, r), 57.8, -10, 0, "DNA ding")
    put(S, G.whoosh(0.4, r, peak=0.3), 59.15, -14, 0.3, "bow pops off")
    put(S, G.hurrah(r, 210, 1.0), 59.9, -16, 0, "visitors laugh")
    put(S, I.glock(I.m2f(96), 0.6, r), 61.45, -10, 0, "wink")
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
    r = rng(1919)
    M = np.zeros((2, N))
    Q = 60 / 116
    bar = 4 * Q
    PROG2 = ["C", "G", "F", "C"]
    CH2 = {"C": [36, 52, 55, 60], "G": [43, 55, 59, 62], "F": [41, 53, 57, 60], "Am": [45, 57, 60, 64], "Dm": [38, 53, 57, 62], "E": [40, 56, 59, 64]}
    TUNE2 = [(1, 0, 1, 67), (1, 1, .5, 67), (1, 1.5, .5, 69), (1, 2, 1, 72), (1, 3, 1, 67),
             (2, 0, 1, 71), (2, 1, .5, 69), (2, 1.5, .5, 67), (2, 2, 2, 71),
             (3, 0, 1, 65), (3, 1, .5, 69), (3, 1.5, .5, 72), (3, 2, 1, 74), (3, 3, 1, 72),
             (4, 0, 1, 67), (4, 1, 1, 71), (4, 2, 2, 72)]

    def march(t0, t1, vel=0.7, tune=True, snare=True, fife=True, prog=PROG2, tr=0):
        nb = int((t1 - t0) / bar) + 1
        for b in range(nb):
            tb = t0 + b * bar
            if tb >= t1: break
            ch = CH2[prog[b % len(prog)]]
            for beat in range(4):
                tq = tb + beat * Q
                if tq >= t1: break
                if beat % 2 == 0: put(M, I.brass(I.m2f(ch[0] + tr + (0 if beat == 0 else 7)), Q * 0.8, vel, r, "tuba"), tq, -4, -0.1)
                else:
                    for m in ch[1:]: put(M, I.brass(I.m2f(m + tr), Q * 0.45, vel * 0.5, r, "horn"), tq, -14, 0.15)
                if snare:
                    put(M, I.snare(vel * (0.9 if beat == 0 else 0.6), r), tq, -10, 0.05)
            if tune:
                for (bb, beat, d, m) in TUNE2:
                    if bb == b % 4 + 1:
                        t = tb + beat * Q
                        if t < t1:
                            x = I.fife(I.m2f(m + tr), d * Q * 0.9, vel * 0.8, r) if fife else I.brass(I.m2f(m + tr - 12), d * Q * 0.9, vel, r, "horn")
                            put(M, x, t, -9, -0.25)

    put(M, I.brass(I.m2f(60), 0.5, 0.9, r, "stab") + I.brass(I.m2f(64), 0.5, 0.8, r, "stab"), 0.0, -6)
    march(0.5, 4.0, 0.7)
    put(M, I.cymbal(0.6, r), fr(121), -12)
    # forest: tense minor ostinato
    for k in range(int((9.6 - 4.1) / (Q / 2))):
        put(M, I.pluck(I.m2f([45, 52, 48, 52][k % 4]), 0.6, r), 4.1 + k * Q / 2, -10, -0.1)
    put(M, I.pad([I.m2f(m) for m in (45, 57, 60, 64)], 5.6, 0.4, r), 4.1, -16)
    # shelling: drop out (boom), then tension pad through radio/basket
    put(M, I.pad([I.m2f(m) for m in (38, 53, 57, 62)], 4.6, 0.4, r), 12.6, -15)
    for k in range(8): put(M, I.pluck(I.m2f([62, 60, 57, 60][k % 4]), 0.5, r), 13.0 + k * 0.5, -14)
    # first two pigeons: hopeful bugle phrase, cut by shots
    put(M, I.brass(I.m2f(67), 0.5, 0.7, r, "horn"), 17.1, -10); put(M, I.brass(I.m2f(72), 0.3, 0.7, r, "horn", fall=-6), 17.6, -10)
    put(M, I.brass(I.m2f(67), 0.5, 0.7, r, "horn"), 18.6, -10); put(M, I.brass(I.m2f(71), 0.3, 0.7, r, "horn", fall=-6), 19.1, -10)
    # Cher Ami: heroic march from his name through the flight (key change at the hits)
    put(M, I.cymbal(0.5, r), 20.8, -14)
    march(21.0, 29.6, 0.85, fife=False)
    for k in range(10): put(M, I.snare(0.4 + 0.05 * k, r), 29.2 + k * 0.05, -12)
    # HQ: suspense pluck then a brass stab on "stop it"
    for k in range(int((36.7 - 29.8) / (Q / 2))): put(M, I.pluck(I.m2f([48, 55, 52, 55][k % 4]), 0.5, r), 29.8 + k * Q / 2, -12)
    put(M, I.brass(I.m2f(60), 0.4, 0.95, r, "stab") + I.brass(I.m2f(64), 0.4, 0.9, r, "stab"), 36.84, -6, 0, "stop-it stab")
    # explanation: vibes + glock, light
    for k in range(int((47.8 - 37.6) / (Q / 2))): put(M, I.vibes(I.m2f([72, 76, 79, 76][k % 4]), 0.45, r), 37.6 + k * Q / 2, -14, 0.1)
    put(M, I.pad([I.m2f(m) for m in (48, 60, 64, 67)], 10.2, 0.35, r), 37.6, -17)
    # survived: warm golden reprise of the tune (slow), medal fanfare
    march(47.85, 50.9, 0.55, snare=False)
    for k, (m, d) in enumerate([(67, .4), (72, .4), (76, .5), (79, 1.2)]): put(M, I.brass(I.m2f(m), d, 0.85, r, "horn"), 51.0 + [0, .4, .8, 1.3][k], -7)
    # museum: music box, then a comic deflate on "she", bright resolve on "boy"
    for k, m in enumerate([76, 79, 84, 79, 76, 72, 74, 76]): put(M, I.musicbox(I.m2f(m), 0.5, r), 52.75 + k * 0.33, -12)
    put(M, I.brass(I.m2f(48), 0.8, 0.7, r, "tuba", fall=-4), 55.0, -6, 0, "she deflate")
    put(M, I.pad([I.m2f(m) for m in (45, 57, 60, 64)], 2.8, 0.35, r), 55.6, -16)
    put(M, I.cymbal(0.5, r), 59.2, -14)
    march(59.25, 62.6, 0.75)
    put(M, I.brass(I.m2f(60), 1.0, 0.85, r, "horn") + I.brass(I.m2f(64), 1.0, 0.8, r, "horn") + I.brass(I.m2f(67), 1.0, 0.8, r, "horn"), 62.3, -6, 0, "final chord")
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
