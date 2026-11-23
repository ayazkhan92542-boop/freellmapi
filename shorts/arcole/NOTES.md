# The Battle Won by Four Trumpets — production notes

- Final: out/final/arcole_short.mp4 (1440x2560, 30 fps, 68.467 s, 2054 frames, ~26 MB, 3 Mbit/s); higher-quality master
  out/final/arcole_master_2k.mp4 (CRF 17, ~120 MB). Neither is committed (out/ is ignored).
- QA (scripts/short_qa.py): -15.3 LUFS, LRA 2.3, peak -1.6 dBFS; no black/white/frozen frames, no silences.
  Flagged "pops" at 519, 689-693, 702, 761 are planned: aim switch, volley flashes + kick, aide shot, retreat.
- Voice: stand-in Kokoro "am_michael" at speed 1.4 (voice/), word timings from the model's own durations.
  To use a real recording: re-time with a piecewise warp (see cartoon-short-render-playbook) or re-render.
- Render: Remotion + three.js on software GL (swangle) at 720x1280 (~25-45 s/frame), upscaled to 1440x2560
  with lanczos. All 1027 even frames rendered; odd frames rendered where needed (cuts, crossfades, kicks, motion
  above a luma-diff threshold of 10): 1240 rendered, 814 blended from neighbours (scripts/assemble.py).
- Sound: audio/arcole_audio.py (synthesized SFX + original score; music bed 10 LU under voice and ducked, SFX -6 dB).

## Rebuild
    node scripts/render-frames.mjs            # STEP=2 WORKERS=2 PARITY=0|1 OUT=out/frames SCALE=1 BROWSER=<headless shell>
    python scripts/assemble.py plan && FRAMES_FILE=out/odd.json node scripts/render-frames.mjs
    python scripts/assemble.py build
    python audio/arcole_audio.py
    ffmpeg -framerate 30 -i out/seq/%04d.jpg -i audio/mix.wav -map 0:v:0 -map 1:a:0 -vf scale=1440:2560:flags=lanczos ...
