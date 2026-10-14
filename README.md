# AURA — AI-Based Fatigue Detection and Wellness Care System

AURA (Adaptive Unobtrusive Rest Assistant) is a non-intrusive wellness system for students and professionals who spend long hours on screens. It estimates **physical and cognitive fatigue in real time** from a webcam and from keyboard/mouse cadence, then offers a **personalized 30–90 second ritual** only when the user is likely to take it.

Video **never leaves the browser**. The backend receives seventeen numeric features, a LightGBM regressor scores fatigue, and a **LinUCB contextual bandit** chooses the intervention.

## Why not a fixed break timer?

Pomodoro-style reminders ignore physiology. AURA watches blink rate, eyelid closure (PERCLOS), head posture, typing cadence and continuous screen time, then interrupts only when the estimated fatigue crosses a personal threshold.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                  │
│  webcam ─► MediaPipe Face Mesh (468 landmarks)           │
│            EAR / blinks / PERCLOS / MAR / head pose      │
│  keyboard + mouse ─► cadence, idle ratio                 │
│            only numbers  ──────────────┐                 │
└────────────────────────────────────────┼─────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────┐
│  FastAPI                                                 │
│  LightGBM  ─► fatigue score 0–100  (alert→severe)        │
│  LinUCB    ─► which 30–90s ritual, if any                │
│  SQLite    ─► sessions, readings, bandit weights         │
└──────────────────────────────────────────────────────────┘
```

| Layer | What it does |
| --- | --- |
| **Perception** | MediaPipe Face Mesh + Eye Aspect Ratio (Soukupová & Čech). Head pose from the facial transformation matrix. Typing/mouse cadence in the browser. |
| **Scoring** | LightGBM regressor on 17 multimodal features → fatigue score and level. |
| **Decision** | Contextual multi-armed bandit (LinUCB) over 8 wellness arms, gated by sensitivity and minutes since the last completed break. |
| **Care** | Guided overlays: 20-20-20, palming, blink gym, neck unlock, posture reset, box breathing, hydration, micro walk. |
| **Memory** | Daily wellness dashboard — detections, screen time, blink trend, breaks, fatigue graph. |

## Tech stack

- **Frontend:** React 18, Vite, MediaPipe Tasks Vision, Recharts
- **Backend:** FastAPI, SQLAlchemy, SQLite, LightGBM, NumPy
- **Vision:** OpenCV-compatible EAR geometry (`backend/app/ml/ear.py`) mirrored in the browser

## Quick start

**Demo account:** `demo@aura.health` / `aura1234`  
The demo user is seeded with a week of physiologically plausible history so the dashboard is alive on first login.

```bash
# backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000

# frontend (another terminal)
cd frontend
npm install
npm run dev
```

Open the Vite URL, sign in, allow the camera. If the camera is blocked, AURA falls back to **lab mode** (a live physiological simulation) so scoring, the bandit and the dashboard still function.

On first boot the API trains LightGBM on 14,000 synthetic samples (~a few seconds) and writes `backend/artifacts/fatigue_lgbm.pkl`.

## Features

1. **Live iris** — mirrored webcam with an elegant landmark overlay, EAR waveform, circular fatigue gauge.
2. **Multimodal scoring** — blinks/min, PERCLOS, EAR, head pitch/yaw/roll, slouch, MAR/yawns, typing RPM, mouse intensity, idle ratio, continuous screen minutes, hour of day.
3. **Personalized pauses** — LinUCB learns which ritual you complete. Completing one is a positive reward; dismissing one is negative. A drop in fatigue after a pause is an extra bonus.
4. **Daily pulse** — wellness index, fatigue timeline, seven-day load, blink rate, break adherence, written insight.
5. **Ritual library** — practise any intervention on demand.
6. **Privacy** — frames stay on-device; settings can disable camera, keyboard or mouse tracking.

## Fatigue levels

| Score | Level |
| --- | --- |
| 0–24 | Alert |
| 25–49 | Mild |
| 50–74 | Moderate |
| 75–100 | Severe |

Break sensitivity (Settings) changes the score the bandit must clear: gentle 68, balanced 52, assertive 40. Severe fatigue (≥ 78) always interrupts.

## Project layout

```
backend/app/
  main.py                 FastAPI entry
  routers/                auth, fatigue, dashboard, interventions
  ml/train.py             synthetic physiology + LightGBM
  ml/fatigue_model.py     inference + human-readable drivers
  ml/bandit.py            LinUCB policy, persisted per user
  ml/ear.py               EAR / MAR (OpenCV-aligned)
  ml/interventions_catalog.py
frontend/src/
  pages/Monitor.jsx       live session
  pages/Dashboard.jsx     wellness analytics
  hooks/useFaceMesh.js    MediaPipe loop
  lib/vision.js           EAR, pose, blink / yawn trackers
docs/TECHNICAL.md         algorithms, features, evaluation
```

## Academic notes

The generating process for the training set is **not** a black box: blink suppression, PERCLOS, eyelid droop, forward-head pitch, yawns, idle typing and the post-lunch circadian dip are written down in `backend/app/ml/train.py`. LightGBM is asked to recover that mapping with noise. Hold-out evaluation on 2,520 samples: **MAE ≈ 2.8**, **R² ≈ 0.97**.

The bandit is a true contextual LinUCB (ridge regression per arm, UCB bonus √(xᵀA⁻¹x)). A heuristic prior is mixed in until each arm has a few trials, so the first hour is not random.

See `docs/TECHNICAL.md` for landmark indices, feature definitions and the reward function.
