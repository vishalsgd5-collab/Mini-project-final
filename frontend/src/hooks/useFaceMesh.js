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

export function useFaceMesh({ videoRef, canvasRef, enabled }) {
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
    landmarker.current = null;
    setStatus("idle");
  }, [videoRef]);

  useEffect(() => {
    if (!enabled) {
      stop();
      return undefined;
    }
    let cancelled = false;

    async function boot() {
      setStatus("loading");
      setError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 960, height: 720, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        const vision = await import("@mediapipe/tasks-vision");
        const { FaceLandmarker, FilesetResolver } = vision;
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        const options = {
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
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
          return;
        }
        landmarker.current = lm;
        blinker.current = new BlinkTracker();
        yawner.current = new YawnTracker();
        setStatus("live");
        loop();
      } catch (err) {
        console.warn("Camera / MediaPipe unavailable", err);
        setError(err?.message || "Camera unavailable");
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
          canvas.width = video.videoWidth || 960;
          canvas.height = video.videoHeight || 720;
        }
        if (face) {
          const ear = bothEars(face);
          const mar = mouthAspect(face);
          const matrix = result.facialTransformationMatrixes?.[0]?.data;
          const pose = matrix ? poseFromMatrix(matrix) : poseFromLandmarks(face);
          const blink = blinker.current.push(ear.avg, now);
          const yawns = yawner.current.push(mar, now);
          if (ctx) drawOverlay(ctx, canvas.width, canvas.height, face, ear, pose);
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
          }));
        } else {
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  }, [enabled]);

  return { status, error, live, stop };
}
