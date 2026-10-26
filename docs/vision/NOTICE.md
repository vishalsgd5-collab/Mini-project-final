# Bundled MediaPipe face-tracking assets

These unmodified runtime/model assets are shipped with AURA so opening the
camera does not depend on separate Google Storage or jsDelivr downloads.
This folder is copied unchanged to the static `docs/vision` distribution.

- Runtime: Google MediaPipe `@mediapipe/tasks-vision` **0.10.14**, Apache-2.0.
  Both SIMD and non-SIMD JS/WASM pairs are copied from that pinned npm package.
  Package: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.14
  Project: https://github.com/google-ai-edge/mediapipe
- Model: `face_landmarker.task`, **3,758,596 bytes**.
  Original upstream model URL:
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  Model SHA-256:
  `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
  Contains `face_detector.tflite`, `face_landmarks_detector.tflite`,
  `geometry_pipeline_metadata_landmarks.binarypb`, `face_blendshapes.tflite`.
  Retrieved unchanged from the Apache-2.0 npm distribution
  `@nuralogix.ai/tf-face-tracker-worker-ts@1.0.2`, path
  `lib/taskVision/model/face_landmarker.task`; no third-party wrapper code is used.
  Its SHA-256 also matches the model pointer in
  https://github.com/torinmb/mediapipe-touchdesigner/blob/bb01606926edeec828cc123e86a4a300bdc96c9b/src/mediapipe/models/face_landmark_detection/face_landmarker.task

The upstream Apache-2.0 license is included in `LICENSE`. Model/runtime execution
is entirely on the user's device. Do not replace the binary model with a Git LFS
pointer or an HTML download page. `frontend/tests/faceEngine.test.mjs` checks the
model's full size/checksum and the WASM magic headers.
