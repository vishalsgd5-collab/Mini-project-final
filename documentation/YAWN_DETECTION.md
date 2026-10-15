# Live mouth / jaw yawn detection

Open Aura, turn on the camera, and allow camera access. Keep your face and mouth visible in good light. The monitor now shows:

- **Mouth opening (MAR)**: the mouth aspect ratio from facial landmarks (not a percentage).
- **Jaw open (AI)**: MediaPipe jawOpen expression score displayed as a percentage (not a calibrated probability).
- **Yawn candidates (session)**: confirmed-by-heuristic events since camera tracking started.
- **Yawn status**: Monitoring → Checking… → Yawn detected. No face is shown when tracking is unavailable.

A MAR or jawOpen score of at least 0.55 must be sustained for at least one second. One held opening counts once; closing the mouth for 200 ms rearms detection, with at least 2.5 seconds between counts. A frame gap longer than 500 ms or missing face discards the pending observation. These thresholds are prototype heuristics, not validated clinical thresholds.

On detection an amber mouth contour appears and the Face Actions panel logs a Yawn event with a wall-clock timestamp. The same detector feeds the session counter, attention heuristic, and rolling ten-minute `yawn_count` feature sent to the fatigue predictor. There is no separate incompatible yawn counter in the camera pipeline. Existing closed-eye red shapes are preserved.

## Manual webcam check

1. With mouth closed, check status is Monitoring.
2. Briefly open/close the mouth (less than one second): no count should be added.
3. Open wide and hold for about 1–2 seconds: check status, amber contour, count increase and Yawn event.
4. Continue holding: the same opening should not count repeatedly.
5. Close the mouth, wait three seconds, then repeat: expect one additional count.
6. Cover the camera during a partial opening: a missing interval must not become a sustained yawn.

Speech, deliberate opening, camera angle, and lighting may still produce false positives or missed events. This is a mouth-opening-based **yawn candidate**, not proof of fatigue or a medical diagnosis. Actual webcam performance needs testing on the user's device.

## Automated checks

`node --test frontend/tests/yawn.test.mjs`

Covers brief openings, MAR fallback, jaw-only input, duration, deduplication, cooldown, missing frames, rolling history, action/model consistency, landmark geometry and wall-clock event timestamps.
