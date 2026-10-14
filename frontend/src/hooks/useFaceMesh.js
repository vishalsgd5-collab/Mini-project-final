import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlinkTracker,
  YawnTracker,
  bothEars,
  drawOverlay,
  mouthAspect,
  poseFromLandmarks,
  poseFromMatrix,
  slouchFromPose,
} from "../lib/vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

function friendlyCamError(err) {
  const name = err?.name || "";
  const msg = err?.message || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission is blocked. Click the camera icon in the Chrome address bar → Always allow, then retry.";
  }
  if (name === "NotReadableError" || /in use|busy|Device in use/i.test(msg)) {
    return "Camera is already in use. Close Zoom, Teams, Meet, Skype, Windows Camera, and other Chrome tabs that might be using it. Then click Retry camera.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No webcam was found. Plug one in, then retry.";
  }
  if (name === "NotSupportedError" || name === "SecurityError") {
    return "This page must stay on HTTPS for the camera to open.";
  }
  return msg || "Camera unavailable";
}

async function openCamera() {
  const attempts = [
    { video: { facingMode: "user" }, audio: false },
    { video: true, audio: false },
    { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false },
  ];
  let last;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  throw last || new Error("Camera unavailable");
}

function blendScore(result) {
  const cats = result.faceBlendshapes?.[0]?.categories || [];
  const pick = (name) => cats.find((c) => c.categoryName === name)?.score || 0;
  return (pick("eyeBlinkLeft") + pick("eyeBlinkRight")) / 2;
}

export function useFaceMesh({ videoRef, canvasRef, enabled, retryToken = 0, glassesMode = false }) {
  const glassesRef = useRef(glassesMode);
  glassesRef.current = glassesMode;
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
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
  const lastTs = useRef(0);
  const frames = useRef(0);
  const fpsAt = useRef(performance.now());

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    try {
      landmarker.current?.close?.();
    } catch {
      /* ignore */
    }
    landmarker.current = null;
  }, [videoRef]);

  useEffect(() => {
    if (!enabled) {
      stop();
      setStatus("idle");
      return undefined;
    }
    let cancelled = false;

    async function boot() {
      setStatus("loading");
      setError("");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser cannot open a webcam.");
        }
        const stream = await openCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();

        const vision = await import("@mediapipe/tasks-vision");
        const { FaceLandmarker, FilesetResolver } = vision;
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        const options = {
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        };
        let lm;
        try {
          lm = await FaceLandmarker.createFromOptions(fileset, {
            ...options,
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          });
        } catch {
          lm = await FaceLandmarker.createFromOptions(fileset, {
            ...options,
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          });
        }
        if (cancelled) {
          lm.close?.();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        landmarker.current = lm;
        blinker.current = new BlinkTracker();
        yawner.current = new YawnTracker();
        setStatus("live");
        loop();
      } catch (err) {
        console.warn("Camera / MediaPipe unavailable", err);
        setError(friendlyCamError(err));
        setStatus("lab");
      }
    }

    function loop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const lm = landmarker.current;
      if (!video || !lm || video.readyState < 2) {
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
          const bscore = blendScore(result);
          const matrix = result.facialTransformationMatrixes?.[0]?.data;
          const pose = matrix ? poseFromMatrix(matrix) : poseFromLandmarks(face);
          const blink = blinker.current.push(ear.avg, now, bscore);
          const yawns = yawner.current.push(mar, now);
          if (ctx) {
            drawOverlay(ctx, canvas.width, canvas.height, face, { ...ear, closed: blink.closed, openBaseline: blink.openBaseline }, pose);
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
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryToken]);

  const calibrate = useCallback(() => {
    blinker.current.startCalibrate(3500);
  }, []);

  return { status, error, live, stop, calibrate };
}
