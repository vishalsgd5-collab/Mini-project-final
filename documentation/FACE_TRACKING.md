# Camera streaming but no face detected

## Failure addressed

The former hook set `status="live"` immediately after camera playback, before
MediaPipe initialized. Model/WASM failures then left the state "live" whenever
the camera stream existed. The Monitor displayed errors only when the camera
was **off**, hiding this failure. The away timer interpreted uninitialized
`present=false` as actual absence, while the fallback score used default eye
measurements (e.g. 16 blinks/min, 8% PERCLOS and a normal-looking fatigue score).
An uncaught per-frame inference exception could also terminate the entire rAF
loop. A GPU-to-CPU fallback covered initialization failures, not runtime failures.

This explains how the screenshot's visible camera stream and "No face"/away timer
could coexist. The screenshot alone cannot identify the exact failed download,
GPU issue or browser exception on that user's computer.

## Corrected flow

1. Open and play the camera. Show **Camera streaming · loading the face tracker**,
   not tracking success.
2. Load the model and the matching 0.10.14 WASM files **from this AURA site's
   `vision/` directory**. Both SIMD variants and the checksum-verified full task
   binary are included in source and static distribution. CPU is the default
   inference delegate to avoid common GPU delegate compatibility issues.
3. Only a successful `detectForVideo` call can publish a **healthy** tracking
   snapshot, a processed-frame timestamp, and status **live**. The status card
   reports face detected/searching, processing FPS and frame count.
4. Camera/model/startup errors stay visible even while video is streaming.
   **Retry face detection** or **Restart camera** creates a new owned engine and
   stream. Abandoned/timed-out engines are closed if they finish later. Cleanup
   closes the owning stream/engine, preventing obsolete retries from publishing.
5. Frame exceptions are caught. One automatic CPU-engine reinitialization is
   attempted; a repeated failure shows an actionable error instead of silently
   killing the processing loop.
6. A watchdog marks frames stale after five seconds without successful fresh
   inference. Paused video, stopped tracking, failed loading, and stale snapshots
   cannot advance the away timer or drive fatigue alerts. Temporal mouth/closure
   candidates are cleared so unobserved gaps are not treated as continuous action.
7. Healthy, fresh **empty detections** still count toward the five-minute away
   rule. Once that alarm has fired, only manual **Stop alarm** stops it, as before.
   A technical tracker outage resets a pending away timer; it does not silently
   stop an already active alarm.
8. The combined fatigue estimate and its confidence are **unavailable** when no
   usable face measurement exists. We do not display the old 16/78%-confidence
   defaults as if they were measured. Personal typing/mouse calibration can still
   run, but the camera-based combined prediction waits for valid face tracking.

Processing uses a bounded timer rather than only requestAnimationFrame, so hidden
browser tabs can still attempt inference. Chrome can nevertheless throttle timers,
freeze/discard tabs or stop camera delivery. Missing data is reported, not treated
as absence. Keep Chrome and the Monitor tab open. Closing Chrome does not keep the
webcam running.

## Validation performed

- Node regression tests: asset paths under commit/subdirectory hosting, packaged
  model size/SHA-256 and WASM headers, CPU options, explicit loading failure,
  cancellation/timeout late-engine disposal, fresh/no-face/stale gating, and
  Monitor alarm/prediction guards.
- Real headless Chromium + actual MediaPipe CPU/WASM: the user-provided screenshot
  was supplied locally; the engine returned **one face, 478 landmarks and 52
  blendshape categories**. The screenshot was not sent to an external service and
  is not committed to the project.
- Actual React Monitor hook with a canvas-backed video using that screenshot's
  camera region: face lock, restart, genuine blank-frame detection, reacquisition,
  stalled-video warning/recovery, and no fabricated estimate while no face exists.
- Simulated missing model (HTTP 404) while the camera continues streaming: visible
  failure and no away countdown or fatigue estimate.

This validates the repaired code path, not detection accuracy on every webcam,
lighting condition or machine. It does not prove which failure occurred on the
user's own laptop. Strong backlighting, covered eyes, restricted browser settings
and hardware issues may still affect results; the status/error card now exposes
technical failures instead of calling all of them "No face".

The static app uses its existing browser-based scoring fallback; the included
Python/FastAPI/LightGBM backend is a separate deployment. Sound choices, personal
work-pace comparison and existing yawn filters are retained.
