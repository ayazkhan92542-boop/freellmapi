# The Pharaoh Who Edited His Own War (Battle of Kadesh) — production notes

- Final: out/final/kadesh_short.mp4 (1440x2560, 30 fps, 79.033 s, 2371 frames, ~28 MB); master out/final/kadesh_master_2k.mp4
  (CRF 17, ~91 MB). Not committed (out/ is ignored).
- QA: -15.2 LUFS, LRA 3.4, peak -1.3 dBFS; no black/white/frozen frames; only flagged jump = the planned spy reveal (f874-875).
- Voice: the user's voiceover (voice/user_original.wav, 85.4 s). Cleaned (long pauses capped to 0.35 s, clipping removed by
  peak-normalising to -1.5 dBFS) -> voice/voice.wav (78.7 s). Word timings by DTW against a Kokoro template read of the same
  text (/home/user/shorts-tools/align.py), checked against the pauses (sentence starts within ~0.05 s).
- Render: software GL at 720x1280, upscaled to 1440x2560. 1186 even frames + 223 odd frames rendered, 981 blended.
- Sound: audio/kadesh_audio.py (synthesized SFX + original Egyptian-flavoured score; music 10 LU under the voice, SFX -6 dB).
- Facts and sources: SCRIPT.md.
