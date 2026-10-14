import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlinkTracker,
  YawnTracker,
  bothEars,
  drawOverlay,
  eyeIsClosed,
  mouthAspect,
  poseFromLandmarks,
  poseFromMatrix,
  slouchFromPose,
} from "../lib/vision";
import { FaceActionTracker, blendMap } from "../lib/faceActions";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

function friendlyCamError(err) {
  const name = err?.name || "";
  const msg = err?.message || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission is blocked. Click the lock icon in the Chrome address bar → Camera → Allow, then press Turn camera on.";
  }
  if (name === "NotReadableError" || /in use|busy|Device in use/i.test(msg)) {
    return "Camera is already in use. Close Zoom, Teams, Meet, Skype, Windows Camera, and other Chrome tabs, then press Turn camera on.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No webcam was found. Plug one in, then press Turn camera on.";
  }
  if (name === "NotSupportedError" || name === "SecurityError") {
    return "This page must stay on HTTPS for the camera to open.";
  }
  if (name === "AbortError") {
    return "Chrome aborted the camera. Press Turn camera on once more.";
  }
  return msg || "Camera unavailable. Press Turn camera on.";
}

async function waitForVideoEl(videoRef, cancelled) {
  for (let i = 0; i < 50; i += 1) {
    if (cancelled()) return null;
    if (videoRef.current) return videoRef.current;
    await new Promise((r) => setTimeout(r, 50));
  }
  return videoRef.current;
}

function liveTracks(stream) {
  return stream instanceof MediaStream && stream.getVideoTracks().some((t) => t.readyState === "live");
}

async function playVideo(video) {
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("muted", "");
  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("Camera timed out waiting for video.")), 10000);
      const done = () => {
        window.clearTimeout(t);
        video.removeEventListener("loadedmetadata", done);
        resolve();
      };
      video.addEventListener("loadedmetadata", done);
    });
  }
  try {
    await video.play();
  } catch {
    await new Promise((r) => setTimeout(r, 200));
    await video.play();
  }
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot open a webcam. Use Chrome.");
  }
  const attempts = [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    if (cams[0]?.deviceId) {
      attempts.push({
        video: { deviceId: { exact: cams[0].deviceId } },
        audio: false,
      });
      attempts.push({
        video: { deviceId: { ideal: cams[0].deviceId }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    }
  } catch {
    /* permission may still be pending */
  }
  attempts.push({ video: true, audio: false });
  attempts.push({ video: { facingMode: "user" }, audio: false });
  attempts.push({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false,
  });
  let last;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw last || new Error("Camera unavailable");
}

function blendScore(blends) {
  return ((blends.eyeBlinkLeft || 0) + (blends.eyeBlinkRight || 0)) / 2;
}

let visionMod = null;
async function loadLandmarker() {
  if (!visionMod) visionMod = await import("@mediapipe/tasks-vision");
  const { FaceLandmarker, FilesetResolver } = visionMod;
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };
  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    });
  } catch {
    return await FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
    });
  }
}

export function useFaceMesh({ videoRef, canvasRef, enabled, retryToken = 0, glassesMode = false }) {
  const glassesRef = useRef(glassesMode);
  glassesRef.current = glassesMode;
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [live, setLive] = useState({
    ear: 0.28,
    blinkRate: 16,
    perclos: 0.08,
    pitch: -4,
    yaw: 0,
    roll: 0,
    mar: 0.05,
    yawns: 0,
    slouch: 0.1,
    present: false,
    blinks: 0,
    fps: 0,
  });
  const landmarker = useRef(null);
  const raf = useRef(0);
  const blinker = useRef(new BlinkTracker());
  const yawner = useRef(new YawnTracker());
  const actor = useRef(new FaceActionTracker());
  const lastTs = useRef(0);
  const frames = useRef(0);
  const fpsAt = useRef(performance.now());

  const stopTracks = useCallback(() => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }, [videoRef]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stopTracks();
    try {
      landmarker.current?.close?.();
    } catch {
      /* ignore */
    }
    landmarker.current = null;
  }, [stopTracks]);

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(raf.current);
      stopTracks();
      setStatus("idle");
      return undefined;
    }
    let cancelled = false;
    const isCancelled = () => cancelled;

    async function boot() {
      setStatus("loading");
      setError("");
      try {
        const video = await waitForVideoEl(videoRef, isCancelled);
        if (!video) throw new Error("Video element is not ready. Press Turn camera on.");
        if (cancelled) return;

        let stream = video.srcObject;
        if (!liveTracks(stream)) {
          stream = await openCamera();
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          if (video.srcObject && video.srcObject !== stream) {
            video.srcObject.getTracks?.().forEach((t) => t.stop());
          }
          video.srcObject = stream;
        }
        await playVideo(video);
        if (cancelled) return;
        setCamOn(true);
        setStatus("live");

        if (!landmarker.current) {
          landmarker.current = await Promise.race([
            loadLandmarker(),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error("Face engine timed out. Camera is on — press Turn camera on to retry tracking.")), 25000)
            ),
          ]);
        }
        if (cancelled) return;
        blinker.current = new BlinkTracker();
        yawner.current = new YawnTracker();
        actor.current = new FaceActionTracker();
        loop();
      } catch (err) {
        console.warn("Camera / MediaPipe unavailable", err);
        const hasCam = liveTracks(videoRef.current?.srcObject);
        setCamOn(hasCam);
        setError(friendlyCamError(err));
        setStatus(hasCam ? "live" : "idle");
      }
    }

    function loop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const lm = landmarker.current;
      if (!video || video.readyState < 2) {
        raf.current = requestAnimationFrame(loop);
        return;
      }
      if (!lm) {
        raf.current = requestAnimationFrame(loop);
        return;
      }
      const now = performance.now();
      if (now - lastTs.current > 28) {
        lastTs.current = now;
        const result = lm.detectForVideo(video, now);
        const face = result.faceLandmarks?.[0];
        const ctx = canvas?.getContext("2d");
        if (canvas) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        }
        if (face) {
          blinker.current.setGlasses(glassesRef.current);
          const ear = bothEars(face);
          const mar = mouthAspect(face);
          const blends = blendMap(result);
          const bscore = blendScore(blends);
          const matrix = result.facialTransformationMatrixes?.[0]?.data;
          const pose = matrix ? poseFromMatrix(matrix) : poseFromLandmarks(face);
          const blink = blinker.current.push(ear.avg, now, bscore);
          const glasses = glassesRef.current || blink.glassesLikely;
          const leftClosed = eyeIsClosed(ear.left, blink.openBaseline, blends.eyeBlinkLeft || 0, glasses);
          const rightClosed = eyeIsClosed(ear.right, blink.openBaseline, blends.eyeBlinkRight || 0, glasses);
          const yawns = yawner.current.push(mar, now);
          const actions = actor.current.push({
            closed: blink.closed,
            blinked: blink.blinked,
            mar,
            pitch: pose.pitch,
            yaw: pose.yaw,
            blends,
            now,
          });
          if (ctx) {
            drawOverlay(ctx, canvas.width, canvas.height, face, {
              ...ear,
              leftClosed,
              rightClosed,
              openBaseline: blink.openBaseline,
            }, pose);
          }
          frames.current += 1;
          let fps = 0;
          if (now - fpsAt.current > 1000) {
            fps = frames.current;
            frames.current = 0;
            fpsAt.current = now;
          }
          setLive((s) => ({
            ear: ear.avg,
            earLeft: ear.left,
            earRight: ear.right,
            leftClosed,
            rightClosed,
            blinkRate: blink.blinkRate,
            perclos: blink.perclos,
            earStd: blink.earStd,
            pitch: pose.pitch,
            yaw: pose.yaw,
            roll: pose.roll,
            mar,
            yawns,
            slouch: slouchFromPose(pose.pitch, pose.roll),
            present: true,
            blinks: blink.blinks,
            fps: fps || s.fps,
            blinkScore: bscore,
            openBaseline: blink.openBaseline,
            glassesLikely: blink.glassesLikely,
            calibrating: blink.calibrating,
            closed: blink.closed,
            actions: actions.events,
            actionCounts: actions.counts,
            attention: actions.attention,
            closedMs: actions.closedMs,
          }));
        } else if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setLive((s) => ({ ...s, present: false }));
        }
      }
      raf.current = requestAnimationFrame(loop);
    }

    boot();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryToken]);

  const calibrate = useCallback(() => {
    blinker.current.startCalibrate(3500);
  }, []);

  return { status, error, live, stop, calibrate, camOn };
}
