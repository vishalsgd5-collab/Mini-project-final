import { loadFaceEngine } from "../lib/faceEngine.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlinkTracker,
  bothEars,
  drawOverlay,
  eyeIsClosed,
  mouthAspect,
  poseFromLandmarks,
  poseFromMatrix,
  slouchFromPose,
} from "../lib/vision";
import { FaceActionTracker, blendMap } from "../lib/faceActions";

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

export function useFaceMesh({ videoRef, canvasRef, enabled, retryToken = 0, glassesMode = false, speakingMode = false }) {
  const speakingRef = useRef(speakingMode);
  speakingRef.current = speakingMode;
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
    trackingState: "starting",
    lastProcessedAt: null,
    processedFrames: 0,
  });
  const landmarker = useRef(null);
  const timer = useRef(0);
  const blinker = useRef(new BlinkTracker());
  const actor = useRef(new FaceActionTracker());
  const frames = useRef(0);
  const fpsAt = useRef(performance.now());

  const stopTracks = useCallback(() => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }, [videoRef]);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
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
      stop();
      setStatus("idle");
      setLive(s => ({ ...s, present: false, trackingState: "stopped", lastProcessedAt: null, closedMs: 0 }));
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false, failed = false, recovering = false;
    let engine = null, ownedStream = null;
    let recoveries = 0, processed = 0, lastVideoTime = -1, lastSuccess = 0, engineStarted = 0;
    const clearTracking = trackingState => {
      const canvas = canvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      actor.current.yawnDetector.resetCandidate();
      actor.current.closedSince = null;
      actor.current.fired.microsleep = false;
      setLive(s => ({ ...s, present: false, trackingState, closed: false,
        lastProcessedAt: null, closedMs: 0, yawnActive: false, yawnPending: false,
        yawnStatus: "unavailable", scoringMar: .05, mouthOpenMs: 0, jawOpen: 0 }));
    };
    function closeEngine() {
      const old = engine; engine = null;
      if (landmarker.current === old) landmarker.current = null;
      try { old?.close(); } catch { /* already closed */ }
    }
    async function startEngine() {
      const next = await loadFaceEngine({ signal: controller.signal, base: import.meta.env.BASE_URL });
      if (cancelled) { next.close(); return; }
      engine = next; landmarker.current = next;
      engineStarted = performance.now(); lastSuccess = 0; lastVideoTime = -1;
      setError(""); setStatus("tracking-loading");
    }
    async function boot() {
      setCamOn(false); setStatus("loading"); setError(""); clearTracking("starting");
      try {
        const video = await waitForVideoEl(videoRef, () => cancelled);
        if (cancelled) return;
        if (!video) throw new Error("Video element is not ready. Click Retry face detection.");
        let stream = video.srcObject;
        if (!liveTracks(stream)) {
          stream = await openCamera();
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
          video.srcObject = stream;
        }
        ownedStream = stream;
        await playVideo(video);
        if (cancelled) return;
        setCamOn(true); setStatus("tracking-loading");
        await startEngine();
        if (cancelled) return;
        blinker.current = new BlinkTracker(); actor.current = new FaceActionTracker();
        frames.current = 0; fpsAt.current = performance.now();
        loop();
      } catch (err) {
        if (cancelled) return;
        failed = true; closeEngine();
        console.warn("Camera / face tracking unavailable", err);
        const hasCam = liveTracks(videoRef.current?.srcObject);
        setCamOn(hasCam); setError(friendlyCamError(err));
        setStatus(hasCam ? "tracking-error" : "idle"); clearTracking("error");
      }
    }
    async function recover(err) {
      if (cancelled || recovering) return;
      closeEngine(); clearTracking("error");
      if (recoveries++ >= 1) {
        failed = true; setStatus("tracking-error");
        setError(`Face processing stopped: ${err?.message || "unknown error"}. Click Retry face detection.`);
        return;
      }
      recovering = true; setStatus("tracking-loading");
      setError("Restarting the CPU face tracker after a processing error…");
      try { await startEngine(); }
      catch (error) {
        if (!cancelled) { failed = true; setStatus("tracking-error"); setError(friendlyCamError(error)); }
      } finally { recovering = false; }
    }
    function loop() {
      if (cancelled || failed) return;
      try {
        const video = videoRef.current, canvas = canvasRef.current;
        if (!engine || recovering || !video || video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) return;
        const now = performance.now();
        const result = engine.detectForVideo(video, now);
        lastVideoTime = video.currentTime; lastSuccess = now; processed++;
        setStatus("live"); setError("");
        frames.current++;
        let fps = 0;
        if (now - fpsAt.current >= 1000) {
          fps = Math.round(frames.current * 1000 / (now - fpsAt.current));
          frames.current = 0; fpsAt.current = now;
        }
        const face = result.faceLandmarks?.[0];
        const ctx = canvas?.getContext("2d");
        if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
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
          const actions = actor.current.push({
            closed: blink.closed,
            blinked: blink.blinked,
            mar,
            pitch: pose.pitch,
            yaw: pose.yaw,
            blends,
            speaking: speakingRef.current,
            now,
          });
          if (ctx) {
            try { drawOverlay(ctx, canvas.width, canvas.height, face, {
              ...ear,
              leftClosed,
              rightClosed,
              openBaseline: blink.openBaseline,
            }, pose, { yawning: actions.yawn.active }); } catch (drawError) { console.warn("Face overlay unavailable", drawError); }
          }
          setLive((s) => ({
            trackingState: "healthy",
            lastProcessedAt: now,
            processedFrames: processed,
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
            yawns: actions.yawn.recentCount,
            jawOpen: blends.jawOpen || 0,
            yawnActive: actions.yawn.active,
            yawnStatus: actions.yawn.status,
            scoringMar: actions.yawn.scoringMar,
            yawnPending: actions.yawn.pending,
            mouthOpenMs: actions.yawn.openMs,
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
        } else {
          actor.current.yawnDetector.resetCandidate();
          actor.current.closedSince = null;
          actor.current.fired.microsleep = false;
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setLive((s) => ({ ...s, trackingState: "healthy", lastProcessedAt: now, processedFrames: processed, fps: fps || s.fps, closedMs: 0, present: false, yawnActive: false, yawnPending: false, yawnStatus: "unavailable", scoringMar: 0.05, mouthOpenMs: 0, jawOpen: 0 }));
        }
      } catch (error) {
        console.warn("Face frame processing failed", error);
        void recover(error);
      } finally {
        // Unlike rAF-only loops this still attempts inference in background tabs.
        if (!cancelled && !failed) timer.current = setTimeout(loop, 80);
      }
    }
    const watchdog = setInterval(() => {
      if (!cancelled && !failed && engine && !recovering && performance.now() - (lastSuccess || engineStarted) > 5000) {
        setStatus("tracking-paused"); clearTracking("stale");
        setError("Camera frames or face processing paused. Return to this tab or click Retry face detection. Away timer and fatigue scoring are paused.");
      }
    }, 1000);
    boot();
    return () => {
      cancelled = true; controller.abort();
      clearTimeout(timer.current); clearInterval(watchdog); closeEngine();
      ownedStream?.getTracks().forEach(t => t.stop());
      if (videoRef.current?.srcObject === ownedStream) videoRef.current.srcObject = null;
    };
    // Each retry owns its engine/stream; late startup cannot overwrite a newer retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryToken]);

  const calibrate = useCallback(() => {
    blinker.current.startCalibrate(3500);
  }, []);

  return { status, error, live, stop, calibrate, camOn };
}
