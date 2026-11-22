# The One-Eyed, One-Legged War Hero (Cher Ami) — production notes

- Final: out/final/cherami_short.mp4 (1440x2560, 30 fps, 63.233 s, 1897 frames, ~24 MB); master out/final/cherami_master_2k.mp4
  (CRF 17, ~86 MB). Not committed (out/ is ignored).
- QA (scripts/short_qa.py): -15.3 LUFS, LRA 2.1, peak -1.5 dBFS; no black/white/frozen frames, no pops, no silences.
- Voice: stand-in Kokoro "am_michael", speed 1.4, 3.7 words/s (voice/). Facts and the disputed points are in SCRIPT.md.
- Render: software GL at 720x1280, upscaled to 1440x2560 (lanczos). All 949 even frames rendered; odd frames rendered at
  cuts, kicks and fast motion (243), the other 705 blended from neighbours (scripts/assemble.py, threshold 10).
- Sound: audio/cherami_audio.py (synthesized SFX + original score; music 10 LU under the voice and ducked, SFX -6 dB).
- Rebuild: see ../arcole/NOTES.md (same commands; composition id CherAmiShort).
