/** Assets are served with AURA, not fetched from Google/CDNs at camera start. */
export function visionAssetRoot(base = "./", page = document.baseURI) {
  return new URL(`${base}vision/`, page).href;
}

/** Dispose engines that finish after retry/unmount/timeout instead of publishing them. */
export function ownedTask(promise, { signal, timeoutMs = 30000, label = "Face engine", dispose = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (fn, value) => {
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); fn(value);
    };
    const abort = () => { if (!settled) finish(reject, new Error(`${label} cancelled`)); };
    if (signal?.aborted) abort();
    else {
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => { if (!settled) finish(reject, new Error(`${label} timed out. Click Retry face detection.`)); }, timeoutMs);
    }
    Promise.resolve(promise).then(value => {
      if (settled) { try { dispose(value); } catch { /* already disposed */ } }
      else finish(resolve, value);
    }, error => { if (!settled) finish(reject, error); });
  });
}

export async function loadFaceEngine({ signal, base = "./", page, importVision = () => import("@mediapipe/tasks-vision"), fetcher = fetch } = {}) {
  const root = visionAssetRoot(base, page);
  const { FaceLandmarker, FilesetResolver } = await ownedTask(importVision(), { signal, label: "Face library" });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 30000);
  let bytes;
  try {
    if (signal?.aborted) throw new Error("Face engine cancelled");
    const response = await fetcher(`${root}face_landmarker.task`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Face model download failed (${response.status}). Refresh the latest AURA link and retry.`);
    bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1000000) throw new Error("Face model is missing or incomplete. Refresh the latest AURA link.");
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Face model download interrupted or timed out. Click Retry face detection.");
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort);
  }
  const fileset = await ownedTask(FilesetResolver.forVisionTasks(root.replace(/\/$/, "")), { signal, label: "Face WASM loader" });
  // CPU avoids webcam/GPU delegate incompatibilities on common integrated GPUs.
  return ownedTask(FaceLandmarker.createFromOptions(fileset, {
    runningMode: "VIDEO", numFaces: 1,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    baseOptions: { modelAssetBuffer: bytes, delegate: "CPU" },
  }), { signal, label: "Face tracking startup", dispose: engine => engine.close() });
}

export function trackingFresh(live, now = performance.now()) {
  return live?.trackingState === "healthy" && Number.isFinite(live.lastProcessedAt)
    && now >= live.lastProcessedAt && now - live.lastProcessedAt <= 5000;
}
export function faceUsable(live, now = performance.now()) {
  return trackingFresh(live, now) && live.present === true;
}
