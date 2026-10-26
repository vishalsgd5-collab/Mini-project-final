# Conservative visual yawn candidates

## Why the detection changed

The previous detector counted a one-second mouth opening when MAR **or** jawOpen crossed 0.55. Speech and deliberate mouth opening could trigger it. The updated detector uses a complete visual cycle, agreeing signals, temporal stability, and speech-like movement rejection. It does not authenticate genuine physiological yawns.

## Current rules

1. Observe a neutral mouth for at least **400 ms** before arming. Starting with an open mouth does not count.
2. With expression data present, accept supported mouth/jaw evidence through one of three routes: **MAR >= 0.45 AND jawOpen >= 0.35**, **jawOpen >= 0.70 AND MAR >= 0.30**, or **MAR >= 0.72 AND jawOpen >= 0.25**. If jawOpen is genuinely unavailable, require **MAR >= 0.65**. A low jaw score is not treated as missing. These alternatives avoid requiring both facial outputs to reach unusually high values at once.
3. Observe the opening for at least **1.5 seconds**. In the trailing 1.5-second sample window, at least **80%** of samples must be wide, MAR standard deviation <= **0.14**, and jaw standard deviation <= **0.16** when present. These are heuristic sample-based checks, not a trained speech classifier.
4. Five or more wide/non-wide transitions within **2.5 seconds** suppress the current cycle as speech-like, extending suppression for **1.5 seconds** after the latest such movement. No microphone is used.
5. A qualified opening shows an amber mouth outline but does not increment the count yet. Qualification is latched so the natural gradual closing phase does not erase a valid opening; the peak MAR is preserved through closure. This fixes the previous regression where both scores fell before the release threshold and cancelled valid candidates. Require **MAR < 0.40 AND jawOpen < 0.35** for **400 ms** to finish the cycle and count one candidate.
6. Require at least **6 seconds** after the last count before a new opening can begin. An opening held over **8 seconds** without closure is discarded. Such long genuine yawns may be missed.
7. A frame gap over **500 ms**, missing face, or invalid geometry discards pending observations. Another neutral period is needed.

## Speaking mode

The monitor explicitly labels its toggle **Speaking OFF · yawns enabled** / **Speaking ON · yawns paused**. The status shows neutral rearming, hold progress and closing confirmation. Speaking ON is intentionally not a mode in which yawns are detected. While on, new yawn detection and new mouth-opening contribution to the prediction payload are suppressed; eyes, head pose and other monitoring continue. Existing accepted yawn history is not erased. Switch it off after a conversation and briefly relax the mouth to rearm. Speaking mode is session-local, not persisted and not automatic microphone-based speech recognition.

## Display and scoring

- `Mouth opening (MAR)` and `Jaw open (AI)` still show live measurements.
- `Yawn status` distinguishes monitoring, checking, speech-like motion, a pending candidate and manual speaking mode.
- The action log says **Yawn candidate**, not a verified yawn.
- Counts and rolling ten-minute `yawn_count` are updated only after closure completes an accepted cycle.
- Ordinary/unconfirmed mouth openings send neutral `mar=0.05` to the prediction API. An accepted cycle's peak MAR is used for up to six seconds after acceptance; speaking mode suppresses that contribution. This is a frontend preprocessing change; the LightGBM model is not retrained.
- The same detector drives action events, counts, attention penalties and prediction features. Existing historical false detections are not retroactively removed; restarting camera tracking resets session detector counts.

## Limitations

A deliberately acted yawn with identical face motion can still pass these checks. Long vowel speech or similar sustained movement may pass; real yawns may be missed. Do not describe this as fake-yawn detection, perfect speech recognition, or a clinical diagnosis. Real-device validation is needed to measure improvements and false-positive rates.

## Manual check

1. Turn on the camera, relax the mouth for one second.
2. Speak normally for 30 seconds: watch for false candidates; report any remaining patterns.
3. Briefly open the mouth: no count should appear.
4. Make a natural wide opening for 1.5–3 seconds, then close and hold closed: at most one candidate should be logged after closure.
5. Hold open for over eight seconds: no completed candidate should be logged.
6. Enable Speaking mode and repeat: no new yawn counts should appear. Other monitoring remains active.
7. Disable Speaking mode, relax the mouth, and repeat the full cycle. Verify the counter and event log agree.
8. Interrupt a pending opening by leaving the frame: it must not become a completed candidate.

## Automated checks

`node --test frontend/tests/*.test.mjs` covers baseline arming, duration, signal agreement, rapid articulation, above-threshold instability, long holds, speaking suppression, missing frames, cooldown, rolling history, accepted-only MAR scoring, action consistency, geometry, gradual mouth closure, moderate supported signals, natural opening ramps, switching Speaking mode OFF without a camera restart, UI status labels, and the unavoidable acted-yawn limitation. These tests use synthetic input sequences; they are not real-camera accuracy measurements.
