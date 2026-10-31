# AURA — Complete Project Review and Viva Preparation Guide

Prepared from the repository implementation. Use this as a study guide, not a promise that every examiner question can be predicted. Speak about the version actually demonstrated and only claim work or contributions you can explain.

## 1. Your opening explanation

“Good morning. Our project is the AI-Based Fatigue Detection and Wellness Care System, called AURA, which stands for Adaptive Unobtrusive Rest Assistant. It supports people doing prolonged screen-based work by observing possible fatigue-related behaviour and suggesting short wellness breaks. A standard webcam supplies facial observations, including eye opening, blink patterns, mouth opening and head orientation. Keyboard and mouse activity provide additional context, including changes relative to the user's starting work pace. The system combines these observations into a fatigue estimate, displays trends through the Daily Pulse dashboard, and provides wellness activities and date-and-time reminders through Ember Docket. The implementation includes a React frontend, a FastAPI backend with LightGBM and a LinUCB-based recommendation component, and a Chrome Guardian extension. The public static demo uses a browser-side fallback rather than the Python model. This is a wellness prototype, not a medically validated fatigue detector.”

### One-sentence version

“AURA combines webcam-derived facial indicators and personal interaction patterns to estimate possible fatigue, offer wellness activities and help users review their screen-use habits.”

### Very simple Tanglish explanation

“Computer-la long time work pannumbodhu tiredness signs namakku notice aagama pogalam. AURA webcam-la eye opening, blink, mouth opening, head position paarkum. Typing and mouse activity changes-um context-aa use pannum. Indha signals vechu fatigue estimate kaatti, suitable break activities and reminders suggest pannum. Idhu medical diagnosis illa; wellness support prototype.”

## 2. Problem, motivation and objectives

**Problem:** Long computer sessions can involve discomfort, altered blinking, posture changes and missed breaks. People may overlook these changes while concentrating.

**Existing approaches:** Fixed break timers, wearable monitoring and camera-based drowsiness research each address parts of the problem. Do not claim all previous systems use only one signal.

**Gap addressed:** A timer does not consider current observations. A camera-only design does not include interaction context. A warning without actionable follow-up provides limited support.

**Proposed approach:** Integrate multiple observations, individual work-pace comparison, a live dashboard, short wellness activities and reminders within an ordinary-computer application.

**Objectives:**
1. Capture facial landmarks using a standard webcam.
2. Derive eye, mouth and head-related numerical features.
3. Summarize eye closure over a rolling window.
4. Incorporate available keyboard/mouse context without recording typed content.
5. Generate a fatigue estimate and appropriate alerts.
6. Offer wellness activities and collect feedback.
7. Display session trends and support scheduled reminders.
8. Handle missing tracking explicitly and document limitations.

**Scope:** One-user screen-work support. Not a medical device, driver-safety system, employee-ranking tool, native Windows monitoring service or complete body-posture analyser.

## 3. Technology stack and why it was chosen

| Layer | Actual technology | Explanation |
|---|---|---|
| Interface | React 18, JavaScript, HTML and CSS | Reusable components, state updates and interactive pages |
| Build and development | Vite 6 | Development server and production asset bundling |
| Routing | React Router | Navigation among application pages |
| Charts | Recharts | Visualisation of scores and trends |
| Facial inference | MediaPipe Tasks Vision 0.10.14 | Pretrained face landmarks, expression signals and transformation information |
| Browser inference runtime | WebAssembly; CPU delegate in the current tracker | Executes the supplied facial model locally |
| Backend | Python, FastAPI, Uvicorn | JSON endpoints, validation and server execution |
| Validation | Pydantic | Checks the structure/types of request and response data |
| Database access | SQLAlchemy 2.0 | ORM mapping between Python classes and tables |
| Backend database | SQLite | Lightweight file-based prototype persistence |
| Fatigue model | LightGBM 4.5 | Regression on numerical features |
| Data/model utilities | NumPy, pandas, scikit-learn, joblib | Numerical work, data handling, splitting/evaluation and model persistence |
| Recommendation policy | LinUCB-based contextual bandit | Feedback-driven action selection in the backend |
| Extension | Chrome Manifest V3 | Notifications, content overlays, schedules and offscreen audio |
| Static-demo storage | localStorage | Browser-local fallback data; not SQLite |

Important: the architecture picture includes OpenCV, but the active webcam pipeline is MediaPipe in JavaScript. OpenCV is not an installed component of the current application. Say the diagram should be updated, not that an unused library performs image processing.

## 4. Architecture and complete runtime flow

```text
User signs in and starts monitoring
                 |
        Webcam + allowed input observations
                 |
 MediaPipe facial landmarks / expression signals
                 |
 EAR + blink history + MAR/jaw candidate + head pose
                 |
 Eye-closure summary + session time + personal work pace
                 |
        Ordered numerical feature payload
                 |
       +---------+------------------+
       |                            |
FastAPI available             Browser fallback
LightGBM + pace adjustment     Weighted rules + pace adjustment
SQLite records                localStorage records
LinUCB-based recommendations   Heuristic recommendations
       |                            |
       +--------------+-------------+
                      |
      Score, level, contributing factors, activities
                      |
     Alerts + Daily Pulse + optional Guardian delivery
                      |
      User feedback / break completion / session summary
```

Step-by-step: request permission; obtain a video stream; load the bundled model/WASM; verify fresh inference; derive features; update temporal trackers; combine numeric observations; request scoring periodically; display the result; evaluate alarm conditions; offer eligible activities; record feedback; update trends. The monitor requests predictions approximately every six seconds, while facial observations and alarm checks have separate schedules. A prediction interval is not the same thing as camera frame rate.

In `frontend/src/api.js`, requests first attempt the server. If they fail, the current implementation falls back to a local API. That fallback catches errors broadly; production work should distinguish genuine backend unavailability from authentication, validation and server errors so failures are not silently hidden.

## 5. The five principal modules

### 5.1 EAR-based eye detection

Six points around each eye are used. The eye-opening formula is:

```text
EAR = (distance(p2,p6) + distance(p3,p5)) / (2 × distance(p1,p4))
```

The numerator represents two vertical lid distances. The denominator normalizes by eye width. Open eyes usually have a larger ratio; closure reduces it. Example: vertical distances 6 and 6, width 20, give EAR = 12/40 = 0.30. If the vertical distances become 1 and 1, EAR = 2/40 = 0.05. These are illustrative numbers, not universal thresholds.

The code calculates left and right EAR separately and uses consecutive observations to identify blink events. Personal open-eye baseline estimation and MediaPipe eye-blink expression signals influence closure decisions. In ordinary mode, the EAR comparison uses a baseline multiplier of 0.72 with a minimum threshold of 0.12; glasses-aware mode uses 0.78. Expression thresholds also differ. Therefore do not describe the active pipeline as simply “EAR below 0.21 means tired.” The source retains a 0.21 constant and older notes, but current closure logic is adaptive.

Eye closure is not fatigue by itself. Spectacles, glare, camera angle, voluntary winks and task concentration affect observations. Glasses-aware processing is a heuristic, not a guaranteed spectacle-recognition or fairness result. Eye opening is also not precise gaze tracking or medical eye-movement analysis.

### 5.2 MAR-based yawn candidates

MAR uses the same vertical-to-horizontal ratio idea on lip landmarks. Correct mouth indices are `[61,81,311,291,402,178]`. Their pairing matters: crossed diagonal distances can make a closed mouth appear open.

The detector uses mouth geometry, available jaw-opening expression evidence and a temporal state machine:

```text
Neutral mouth -> eligible opening -> stable hold -> closure -> count -> cooldown
```

Important rules: neutral state at least 400 ms; a supported opening for at least 1.5 seconds; closure confirmation for 400 ms; at least six seconds between accepted counts; over-eight-second openings rejected. Rapid repeated changes suppress speech-like motion. A gap over 500 ms discards pending observations. Speaking ON pauses new yawn detection; it is not microphone-based speech recognition.

When both signals exist, supported opening can satisfy one of these routes: MAR >= 0.45 and jaw >= 0.35; jaw >= 0.70 and MAR >= 0.30; or MAR >= 0.72 and jaw >= 0.25. If jaw data are genuinely missing, MAR >= 0.65 is the fallback. The hold also checks stability. Do not recite the obsolete single MAR > 0.55 rule as the complete current detector.

The event is counted after the mouth closes, not immediately on opening. A visually identical acted yawn can pass; sustained speech can still cause mistakes. Say “visual yawn candidate,” not “verified genuine yawn” or “perfect fake-yawn detection.”

### 5.3 Head-pose estimation

Pitch = up/down, yaw = left/right turn, roll = sideways tilt. AURA derives angles from MediaPipe's facial transformation matrix and has a geometric fallback. Pitch and roll contribute to a heuristic slouch indicator. A face camera does not measure the whole spine or shoulders. Looking at notes or another monitor can resemble looking away. Head orientation is context, not proof of distraction or sleepiness. The actual sign of a displayed angle follows the implementation's coordinate convention.

### 5.4 PERCLOS-style monitoring

General concept: accumulated eye closure over an observation period. In this implementation:

```text
Closure proxy = closed-classified samples / valid recorded samples in recent window
Displayed percentage = closure proxy × 100
```

The rolling history is approximately 60 seconds. If 30 of 150 samples are closed, the proxy is 0.20, displayed as 20%. This is not necessarily 20% of elapsed time if sample spacing varies. It is not a calibrated measure of 80% eyelid coverage or clinical PERCLOS. Ordinary blinks are not explicitly removed by a standardized long-closure-only definition. AURA's value is an EAR/expression-based sample proxy used alongside other features.

### 5.5 Fatigue prediction

```text
Backend score = clip(LightGBM output + eligible personal-pace adjustment, 0, 100)
Browser score = clip(weighted-rule output + eligible personal-pace adjustment, 0, 100)
```

The trained model does not use one fixed hand-written weighting formula at inference; its trees combine learned relationships. The browser fallback does use explicit weighted rules. Neither output is a probability of illness or a direct reading of mental fatigue.

| Score | Code label |
|---|---|
| 0 to less than 25 | alert |
| 25 to less than 50 | mild |
| 50 to less than 75 | moderate |
| 75 to 100 | severe |

These are prototype categories, not clinically validated diagnostic boundaries. The current code has four levels even if a report illustration groups fatigue into three categories.

## 6. All 17 backend model features

1. `blink_rate`: estimated blinks per minute.
2. `perclos`: recent closure-sample fraction.
3. `avg_ear`: mean eye aspect ratio.
4. `ear_std`: variation of EAR.
5. `head_pitch`: up/down head angle.
6. `head_yaw`: left/right head angle.
7. `head_roll`: sideways head angle.
8. `mar`: mouth ratio contribution after candidate preprocessing.
9. `yawn_count`: accepted candidates in recent history.
10. `typing_rpm`: recorded keypress count per minute, not words per minute.
11. `mouse_intensity`: normalized pointer activity measure.
12. `idle_ratio`: proportion of observed input intervals with no recorded activity.
13. `continuous_screen_min`: elapsed continuous-work measure maintained by the application.
14. `hour_of_day`: time-of-day context.
15. `session_min`: session elapsed time.
16. `posture_slouch`: head-pose-derived heuristic.
17. `look_away_ratio`: feature defined in the schema; the current personal-activity reader supplies zero, so do not claim it is an implemented accurate gaze-away measurement.

The personal-pace flags and scores are additional adjustment inputs, not evidence that LightGBM was retrained with more than these 17 columns. Not every defined feature is equally informative in every deployment.

## 7. Personal work-pace comparison

Keyboard and mouse references are calibrated independently over their first 60 active seconds. Idle time does not simply fill that active-minute requirement. The reference then freezes for the monitoring session. A drop greater than 15%, maintained for 30 seconds under eligible recent activity, produces slowdown evidence. The resulting contribution is bounded to 0–20 additional score points.

```text
Slowdown = 1 - current pace / starting pace
Example: baseline 100, current 75 -> 25% reduction
```

That does not immediately mean 25 fatigue points: the detector requires eligibility and persistence, maps the evidence and bounds the contribution. No activity while reading is not automatically interpreted as active-work slowdown. Pausing clears current observation/hold state without discarding the reference; restarting learns a new reference. A fatigued starting baseline is a limitation. Task difficulty can also change pace without tiredness.

Keyboard tracking stores counts/timing summaries, not sentences or passwords. WPM is approximated as keypresses per minute divided by five; it is not a typing-test accuracy measure. Guardian extends supported browser-page sampling, not keyboard capture from native Word or other desktop software.

## 8. Dataset and training — essential viva facts

**Dataset name:** No external named fatigue dataset was used for training this regressor. Describe it as “the project's synthetically generated fatigue-feature dataset.” Do not invent a public dataset name.

**Source:** `backend/app/ml/train.py`, function `synthesize`.

**Size:** 14,000 rows; 17 input columns; one continuous generated target score. It is tabular data, not 14,000 webcam images or 14,000 participants.

**Generation:** A seeded random process creates latent fatigue and time/context variables; feature values and target scores are produced using designed relationships, clipping and noise. “Physiologically motivated” in code is a modelling assumption, not clinical proof.

**Split:** 82% training / 18% holdout: 11,480 training rows and 2,520 test rows. The data-generation seed is 42; splitting/model seed is 7.

**Model settings:** `LGBMRegressor`, 420 estimators, learning rate 0.045, 48 leaves, maximum depth 8, minimum child samples 24, column sampling 0.9, subsample parameter 0.85 and L2 regularization 1.2. Configuration does not prove every LightGBM optimization, such as GOSS or EFB, materially affected this small dense dataset.

**Training steps:** generate X/y -> split -> fit trees -> predict holdout scores -> compute metrics -> save model and metadata. `joblib` stores `fatigue_lgbm.pkl`; `metrics.json` stores evaluation information. Backend startup loads the artifact or trains if it is absent. The model is not retrained on every camera frame.

**Recorded artifact metrics:** MAE 2.7974; R² 0.97177. They describe synthetic holdout regression only. No independent clinical fatigue study, participant-level validation or measured webcam blink/yawn accuracy is established by them.

```text
MAE = mean(|true score - predicted score|)
R² = 1 - sum((true-predicted)^2) / sum((true-mean(true))^2)
```

MAE about 2.8 means average absolute error of about 2.8 points against generated labels. R² about 0.972 indicates fit relative to variation in those labels. It is NOT “97.2% correct real-world fatigue detection.” Thresholding a regression output into levels also does not create a measured classification accuracy.

**Why synthetic data?** It enabled reproducible prototype development without a consented labelled human dataset. It cannot validate the underlying assumptions. Future work needs consented real-user data, appropriate reference measures, participant-separated evaluation and comparisons against simpler baselines.

## 9. Algorithms explained simply

**Computer vision:** Extract numerical facial structure from images.

**Pretrained neural network:** MediaPipe supplies the facial model. We use its output; we did not train this facial model from scratch.

**Geometric/temporal rules:** EAR, MAR, head-angle calculations and state machines derive events from landmarks over time.

**Supervised regression:** LightGBM learns a mapping from generated features to generated numerical fatigue labels. Regression predicts a number; classification predicts a category.

**Gradient boosting:** Trees are added sequentially to reduce the remaining prediction error. More trees do not automatically mean better generalization.

**Why LightGBM?** Suitable for structured numerical features, nonlinear relationships and reasonably efficient inference. It is a design choice, not proof of superiority; compare against linear regression, random forests or simpler rules before claiming it is the best.

**Why not only a neural fatigue model?** The prototype combines interpretable derived features with a tabular regressor and avoids training an end-to-end network without an appropriate real dataset. Deep learning is already present in the pretrained perception stage.

## 10. Personalized recommendation and LinUCB

Eight actions: 20-20-20 Gaze Reset; Warm Palming; Blink Gym; Neck & Shoulder Unlock; Posture Reset; Box Breathing; Hydration Pause; Micro Walk. Durations vary; the current catalog includes activities around 25–75 seconds, not an exact universal 30–90-second range.

Context includes normalized fatigue, closure proxy, low-blink flag, slouch, screen duration, idle, afternoon/late flags and typing-load context. With the bias, the backend vector has 10 dimensions.

For each arm a:

```text
A_a initially = identity matrix; b_a initially = zero vector
θ_a = inverse(A_a) × b_a
UCB_a = θ_a^T x + α sqrt(x^T inverse(A_a) x)
α = 0.55
After feedback: A_a += x x^T; b_a += reward × x
```

First term = predicted usefulness. Second term = uncertainty/exploration. Exploitation favours an option already believed useful; exploration learns about alternatives. Early choices are mixed with heuristic priors, so this is a LinUCB-based adaptation, not a verbatim reproduction of the news paper.

Feedback base rewards: completed +1, partial +0.35, skipped -0.25, dismissed -0.35. Completed events can receive an extra bounded adjustment from the before/after score change. Acceptance and score change are imperfect proxies for benefit, not proof of physiological recovery.

The backend stores per-user arm matrices/vectors in `bandit_state`. Feedback updates this policy, not the LightGBM regressor. The browser fallback uses heuristic action selection and records statuses; do not claim its local feedback is retraining the Python LinUCB policy.

Recommendation eligibility differs from the main beep threshold. Backend recommendation gates consider sensitivity, time since a completed break and score. They include an eight-minute completed-break cooldown. Never say “nothing happens below 75”; lower scores can still yield eligible wellness suggestions or dashboard counts.

## 11. Alarms, mute and unavailable tracking

| Feature | Actual rule or limitation |
|---|---|
| Main fatigue beep | Score >=75 sustained for 30 seconds under normal conditions |
| Prolonged-closure path | More than one second of closure can shorten waiting when score is already >=75 |
| Repeat spacing | Normal path about 30 seconds; prolonged-closure path about eight seconds, subject to controls |
| F8 | Mutes ordinary fatigue/ritual audio where the page/extension receives the key; not a native system-wide hotkey |
| Escape | Five-minute snooze through the supported handler |
| No-face away alarm | Five minutes of fresh, healthy inference returning no face |
| Away Stop | Explicit Stop alarm; returning to view or F8 does not silence an active away alarm |
| Tracking failure | Not counted as evidence that the person left |
| Missing usable face | No combined camera-based fatigue estimate |
| Sound choices | Eight choices; adjustable volume; separate fixed away alarm |

Do not describe the code variable called `microsleep` as a verified microsleep diagnosis. It represents a prolonged-eye-closure condition.

The pipeline distinguishes camera permission, video delivery, model loading, valid inference and actual face presence. Frames become stale after about five seconds without successful fresh inference. Old landmarks should not continue driving new estimates. A browser can throttle/freeze hidden tabs, so continuous operation is not guaranteed merely because a timer exists.

## 12. Pages and visible metrics

**Aura/monitor:** Camera controls, tracking status, eye/mouth/head measurements, candidate events, personal pace, score, contributing factors and alert controls.

**Daily Pulse:** Fatigue summary, trends, blink rate, screen/session measures, estimated typing speed, breaks, seven-day view and CSV export. Monitor predictions are sampled periodically; the graphs are not a literal frame-by-frame medical trace.

**Wellness index:** A composite display metric, not the fatigue score or a health percentage. In the local fallback it uses `100 - average fatigue × 0.55 + completed breaks × 4`, rounded and bounded to 8–98 when samples exist. Higher wellness and higher fatigue have opposite intended meanings. Formula and meaning should be identified for the mode used.

**Dashboard detection count:** Local fallback counts readings >=50. It is not a count of beeps at 75, and repeated qualifying readings are not independent diagnosed episodes.

**Rituals:** Instructions and practice controls for eight short activities. They are general suggestions, not proven treatments. Some interface wording overstates health benefits and should be softened before clinical claims are considered.

**Ember Docket:** Title, local date/time, kind and optional note; create, complete, delete, reschedule and remind again. Website storage is localStorage. Guardian synchronizes schedules into Chrome storage and uses Chrome alarms. Schedules are not currently backend-synchronized calendar records.

**Settings:** User profile, work hours, sensitivity, monitoring preferences, notification tests and Guardian setup.

## 13. Guardian and background behaviour

Manifest V3 service worker coordinates schedules and messages. Content scripts show overlays on supported pages and sample allowed numeric browser activity. An offscreen document handles audio because a service worker is not an ordinary visible DOM page. Notifications use Chrome/OS delivery.

Closing AURA's scheduling page: Guardian can still deliver stored date/time reminders while Chrome is running. Closing Chrome: no always-running extension service; missed reminders can be handled on restart. Camera monitoring needs a running AURA monitor tab/window and ongoing valid frames. The extension does not move the webcam into every native app.

Windows controls toast placement, Do Not Disturb, lock-screen behaviour and full-screen restrictions. Internal Chrome pages and other restricted pages block content overlays. A browser extension cannot guarantee a popup on every physical monitor or capture native desktop typing. Without Guardian, keep AURA open for the browser-timer reminder fallback, which can be delayed by throttling.

## 14. Backend, API and database

The React client sends JSON to `/api`. With local development, Vite proxies `/api` to the Python service. A successful backend request returns JSON for the interface to display.

Key routes:
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/auth/me`, `PATCH /api/auth/settings`
- `POST /api/sessions/start`, `POST /api/sessions/end`
- `POST /api/fatigue/predict`
- `POST /api/interventions/feedback`
- `GET /api/interventions/catalog`
- `GET /api/dashboard/overview`
- `GET /api/health`

Database tables:
- `users`: identity, password hash and preferences.
- `sessions`: user-linked work-session summary.
- `fatigue_readings`: timestamped numerical observations/scores.
- `intervention_events`: suggested action, status and feedback.
- `bandit_state`: per-user recommendation-policy state.

Primary key identifies a row; foreign key links related records. SQLAlchemy is the ORM; SQLite is the database. They are not competing databases.

Backend passwords use salted PBKDF2-HMAC-SHA256, not plaintext. JWTs use HS256 and an expiry to authorize requests; a signed JWT is not automatically encrypted. The static fallback is a separate demo mechanism and stores local credentials without equivalent backend security. Do not use real passwords there or claim production-grade authentication.

Production improvements: secrets outside source, restrictive CORS and permissions, hardened error handling, user-data isolation review, rate limiting, retention controls, secure deployment and stronger fallback separation. Do not reveal or rely on development secrets in a presentation.

## 15. How to explain the build from beginning to end

This is a logical engineering walkthrough, not a claim about exact dates or who wrote each file.

1. Define the problem, users, objectives and nonmedical scope.
2. Review digital eye strain, EAR, facial meshes, boosting and contextual bandits.
3. Define data flow and separate interface, perception, prediction, storage and recommendation layers.
4. Build React pages, routes and reusable controls.
5. Request webcam permission and load a pretrained facial model locally.
6. Implement eye/mouth geometry and head-angle calculations.
7. Add temporal event detection, calibration and handling of tracking gaps.
8. Generate the synthetic 17-column dataset and train/evaluate the regressor.
9. Expose authenticated FastAPI endpoints and persist records through SQLAlchemy/SQLite.
10. Implement backend intervention selection and feedback updates.
11. Integrate frontend feature payloads with API responses and charts.
12. Add the clearly distinguished static fallback for demonstrations without a hosted backend.
13. Add personal work pace, sound controls and date/time scheduling.
14. Extend delivery with Guardian and browser/Windows notifications.
15. Test failure cases, update documentation and identify limits requiring real-user evaluation.

Useful files to point to:
- `frontend/src/hooks/useFaceMesh.js`: camera/landmark hook.
- `frontend/src/lib/faceEngine.js`: model loading and tracker health.
- `frontend/src/lib/vision.js`: EAR/MAR/pose and blink history.
- `frontend/src/lib/yawn.js`: temporal yawn candidates.
- `frontend/src/lib/activity.js`: personal pace.
- `frontend/src/pages/Monitor.jsx`: integration, score requests and alarms.
- `frontend/src/lib/localEngine.js`: local demo scorer/storage.
- `frontend/src/lib/docket.js`: schedule data/synchronization.
- `backend/app/ml/train.py`: synthetic generation and fitting.
- `backend/app/ml/fatigue_model.py`: backend inference.
- `backend/app/ml/bandit.py`: recommendation policy.
- `backend/app/models.py`: database schema.
- `extension/background.js`, `offscreen.js`: extension coordination/audio.

## 16. Running the complete backend version on your own Windows laptop

Install Python 3.11+ and a compatible Node.js version for the project's Vite 6 setup. Download/clone the project before the review. Use two terminals inside the same project. These commands are for YOUR laptop; a sandbox server is not your laptop's localhost.

Terminal 1:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2, starting from the project root:

```powershell
cd frontend
npm install
npm run dev
```

Only after both services are running on your laptop, open `http://localhost:5173`. Backend documentation is at `http://127.0.0.1:8000/docs`. Demo credentials: `demo@aura.health` / `aura1234`. If PowerShell blocks activation, run the backend command using `.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000` after installing dependencies with that Python.

Check `/api/health` and inspect a successful `/api/fatigue/predict` request in browser developer tools. Because fallback can conceal server errors, a functioning page alone does not prove backend inference occurred. If presenting the static version, explicitly say so. Do not create new passwords using the demo fallback.

## 17. Testing: what you can truthfully say

Freshly rerun for this guide: `node --test frontend/tests/*.test.mjs extension/tests/*.test.cjs` -> 71 passed, zero failed. These cover mouth geometry and state transitions, personal pace, invalid/stale observations, model assets/loading, audio, schedules, preference synchronization and trusted-origin restrictions.

Backend test files cover activity adjustment, mouth geometry and the ML pipeline. They were not rerun during preparation of this guide; do not present a fresh combined backend-test total without executing them in the backend environment. The backend includes pytest-style tests and a unittest-compatible geometry test. From `backend`, install pytest into the backend virtual environment if needed (`python -m pip install pytest`), then run `python -m pytest tests -q` to collect the full suite. Running only unittest discovery would miss pytest-style function tests.

Important distinction: unit/regression tests check defined software behaviour; live usability tests check practical interaction; labelled event datasets measure blink/yawn accuracy; clinical validation concerns actual health/fatigue outcomes. One does not replace another.

Report artifact metrics separately from new experiment results. No live webcam FPS, Windows-wide notification success rate, battery improvement or real-participant diagnostic accuracy was newly measured for this guide.

## 18. Eight-minute demonstration plan

1. **Introduction, 45 seconds:** problem and one-sentence objective.
2. **Architecture, 45 seconds:** inputs -> features -> scoring -> activities/dashboard.
3. **Start live camera, 60 seconds:** allow access; confirm tracker readiness and actual face lock. Show unavailable state if face is absent rather than fabricated scores.
4. **Eye/head measurements, 60 seconds:** blink normally, close one eye briefly, turn/tilt gently; explain geometry without claiming diagnosis.
5. **Mouth candidate, 45 seconds:** speaking OFF; neutral mouth; eligible opening; close again. Call it a candidate and do not force a success if thresholds are not met.
6. **Personal pace, 45 seconds:** show independent calibration. Do not promise full calibration from 60 seconds of idle time.
7. **Daily Pulse and Rituals, 60 seconds:** explain score versus wellness, graphs and one activity.
8. **Ember Docket/Guardian, 60 seconds:** set a reminder slightly ahead, keep Chrome running and show delivery if OS permissions allow.
9. **Conclusion, 30 seconds:** achievements, synthetic-data limitation and next steps.

Do not wait five minutes for the away alarm unless the examiner specifically requests it. Do not secretly change the 75 threshold or manufacture fatigue to get a beep. Use a clearly labelled test sound/test notification for checking audio. If using simulation or a recorded demonstration, label it explicitly; it is not live validation.

## 19. Pre-review checklist and troubleshooting

- Rehearse the exact laptop/browser/network setup before Monday.
- Install dependencies and allow the model to load before entering the review room.
- Check webcam position, front lighting, power and sound volume.
- Close conflicting camera applications.
- Allow camera and notification permissions.
- Test audio after a deliberate click because browsers restrict autoplay.
- Load/reload Guardian if demonstrating extension scheduling; refresh AURA afterwards.
- Confirm Windows notifications and disable Do Not Disturb if appropriate.
- Verify successful backend requests if claiming the backend model is active.
- Keep source, slides, this guide and a clearly labelled backup video available offline.
- Prepare backup screenshots; explain a failure rather than pretending they are live results.
- Do not clear browser storage just before the demo without understanding what records it removes.

If no camera: check permission, HTTPS/localhost exception, device availability and competing apps. If video but no landmarks: check model/WASM loading and tracker errors. If a yawn is not counted: neutral mouth first, speaking OFF, sustained hold, close, respect cooldown. If no beep: verify usable tracking, score >=75, hold/snooze/mute state and audio unlock. If no toast: check Chrome/Windows permission, Guardian connection, running browser and restrictions. If localhost refuses: start the services on that same laptop.

## 20. Common viva questions and model answers

**1. What is the title and expansion?** AI-Based Fatigue Detection and Wellness Care System; AURA means Adaptive Unobtrusive Rest Assistant.

**2. Why did you choose this problem?** Prolonged screen work can involve missed breaks and overlooked discomfort; we wanted an integrated awareness-and-wellness prototype using ordinary equipment.

**3. What is your main contribution?** Integration of multiple observations, individualized pace comparison, wellness follow-up and cross-page reminder delivery. We did not invent EAR, LightGBM or LinUCB.

**4. What does multimodal mean here?** We combine visual observations with interaction and time-context features, not audio or EEG.

**5. Is it face recognition?** No. It estimates landmarks and expression-related geometry, not a person's identity.

**6. How many landmarks?** The bundled face model can return 478 landmarks with 52 expression categories; the application uses selected regions and is designed around a single monitored user. This is not the older 68-landmark dlib system.

**7. Did you train MediaPipe?** No. We integrated a pretrained facial model and wrote downstream geometric and temporal processing.

**8. Where exactly is AI used?** Pretrained neural facial inference; backend supervised LightGBM regression; backend LinUCB-based recommendation. Rules are also part of the hybrid system.

**9. Is every component machine learning?** No. EAR/MAR formulas, thresholds, event states, reminders and chart aggregation include deterministic logic.

**10. Why not just a timer?** Timers provide fixed scheduling; AURA adds observations and context, although those estimates require validation and can be wrong.

**11. Is EAR 0.21 your only threshold?** No. Current eye closure uses a personal baseline and expression evidence; the retained constant alone does not describe the live pipeline.

**12. Can it detect gaze direction precisely?** No validated gaze tracker is implemented. Eye opening and head orientation must not be described as precise visual attention.

**13. Can it distinguish real and fake yawns?** Not reliably. Temporal rules reject some patterns but identical visible motion cannot establish physiological authenticity.

**14. Why does a yawn count after closing?** It confirms a complete cycle and avoids multiple counts while the mouth remains open.

**15. Does it listen while I speak?** No microphone is used for yawn speech suppression; it uses mouth-motion heuristics and an explicit speaking toggle.

**16. Does high PERCLOS prove sleepiness?** No. Our sample proxy can reflect voluntary closure or tracking errors and is only supporting evidence.

**17. Can head pose diagnose bad posture?** No. It approximates head orientation, not complete musculoskeletal posture.

**18. Why use ratios?** They reduce dependence on apparent region size, but do not eliminate pose and landmark errors.

**19. What is your dataset?** A reproducibly generated synthetic table of 14,000 rows and 17 features, not a public human-fatigue image dataset.

**20. Is the model supervised?** Yes: the regressor fits generated input/target pairs. The recommendation bandit learns from action feedback in a different way.

**21. Why regression?** We want a continuous 0–100 estimate before mapping it into presentation categories.

**22. What is your accuracy?** We have synthetic holdout regression metrics: MAE about 2.80 and R² about 0.972. We have not established a real-user fatigue-detection accuracy percentage.

**23. Why are the scores strong?** Training and holdout labels follow the same synthetic generating process. Good fit shows the model learned those relationships, not that the assumptions are clinically correct.

**24. Did you use 80:20 splitting?** No; the implemented split is 82:18, producing 11,480 and 2,520 rows.

**25. Do you train on live webcam frames?** No. Frames drive inference/features; training this regressor is a separate process using tabular data.

**26. Does feedback retrain LightGBM?** No. Backend feedback updates the recommendation policy. Model retraining would require a separate labelled-data workflow.

**27. What does LinUCB do?** It scores intervention choices using estimated reward plus an uncertainty term, with additional cold-start heuristics in our implementation.

**28. What is an arm?** One candidate activity; the backend has eight intervention arms.

**29. Is completed feedback proof that the user recovered?** No. Completion indicates engagement; benefit requires suitable outcome evaluation.

**30. What if the backend is down?** The current client falls back to a browser-local engine. That keeps a demo usable but means the algorithm/storage path changes and must be disclosed.

**31. Does the hosted static page run Python?** No. Static hosting serves frontend assets; it cannot itself execute FastAPI or the Python LightGBM model.

**32. Where is data stored?** Backend mode uses SQLite through SQLAlchemy. Fallback uses browser localStorage. Guardian schedules/preferences use Chrome storage. They are not one synchronized database.

**33. Is video uploaded for prediction?** The intended pipeline processes facial frames locally and sends numerical features rather than video to the scoring API.

**34. Does local processing make it completely private?** No. Numeric behaviour, tokens and schedules can still be sensitive; permissions, retention and security controls remain necessary.

**35. Are passwords encrypted?** Backend passwords are salted hashes using PBKDF2-HMAC-SHA256. The static fallback is demo-only and does not have equivalent protection. Hashing is not encryption.

**36. Is the displayed confidence an accuracy probability?** No. It is heuristic; the local fallback uses a fixed 0.78 value for usable results, and the backend uses an EAR-based heuristic. It is not calibrated probability or a confidence interval.

**37. When does the main beep sound?** Normally score >=75 for 30 seconds; a prolonged-closure path can shorten the waiting time when score is already >=75. Mute, snooze and repeat spacing also apply.

**38. What happens after five minutes without a face?** Healthy fresh empty detections can trigger a separate continuous away alarm, stopped manually. Tracker failure is not counted as absence.

**39. Can it run after Chrome closes?** Not as a continuous webcam monitor or native service. Scheduled overdue reminders can be processed after Chrome restarts.

**40. Can it monitor typing inside desktop Word?** No. Extension input sampling covers eligible browser pages, not native desktop keyboard activity. Notifications may still appear over desktop apps when the OS allows.

**41. Is F8 a global Windows hotkey?** No. It works through supported browser/page handlers, not a native OS-wide keyboard registration.

**42. What is the wellness index?** A composite dashboard indicator, not a clinical health measurement and not simply another name for the fatigue score.

**43. Why does detection count differ from beep count?** The local dashboard counts qualifying >=50 readings, while the main alarm uses >=75 with persistence. They represent different things.

**44. Does it work with spectacles?** It has glasses-aware logic, but reflection, occlusion and individual conditions can still cause failure; equal performance has not been established.

**45. Does it work in darkness?** A standard webcam needs adequate visibility. No infrared or night-vision capability is implemented.

**46. What if more than one person appears?** It is a single-user monitoring design, not a validated multi-person identification and tracking system.

**47. What if the user is reading silently?** Lack of input should not automatically become active-work slowdown. Eye/time measurements may still be available, with their own limitations.

**48. Have you compared against other models?** Do not invent a benchmark. The next step is a controlled comparison using the same real-data split and reference labels.

**49. What testing was performed?** We can show software regression cases; 71 browser/extension tests were rerun for this guide. That is separate from clinical or real-user event accuracy.

**50. Is the system real-time?** It provides ongoing updates, but measured end-to-end latency/FPS was not established here. Timing varies with hardware and browser scheduling.

**51. Is it offline?** Local inference can operate after required assets load, but complete offline installation/caching and all deployment paths are not guaranteed by that statement.

**52. What are the major limitations?** Synthetic labels, unvalidated fatigue interpretation, tracking variation, heuristic yawn/head/closure signals, browser restrictions, demo security and separation of fallback/backend behaviour.

**53. What future work is realistic?** Consented real-user validation, participant-separated datasets, calibrated uncertainty, simpler-model comparisons, accessibility studies, stronger security, clearer mode indication and better deployment separation.

**54. Which SDGs are strongest?** SDG 3, with supporting links to 4, 8 and 9. SDG 10 is conditional inclusive-design potential, 12 is indirect responsible-resource design, and 17 concerns future collaboration.

**55. What is the literature contribution?** Sheppard/Wolffsohn motivates visual comfort; Soukupová/Čech supplies EAR foundations; Attention Mesh supplies facial-geometry background; Ke et al. supplies LightGBM; Li et al. supplies contextual-bandit reasoning. None validates AURA's overall health outcomes.

**56. What did you personally do?** State your actual contribution. Explain the files, design decisions, tests and changes you understand; do not claim authorship of pretrained models or conceal assistance when asked.

**57. Why should we accept the project despite limitations?** It demonstrates an integrated, testable software prototype and makes its measurement limits explicit. It is a foundation for evaluation, not a finished clinical product.

**58. What would you improve first?** Make deployment mode explicit, resolve reporting/diagram inconsistencies, harden fallback/authentication and collect ethically approved real-world evaluation data.

## 21. If you do not know an answer

Say: “That has not been measured in the current prototype. Our implementation currently does X; to establish Y, we would need Z.”

Examples: “We have not measured clinical sensitivity; that would need an appropriate labelled evaluation.” “We have not guaranteed every-app Windows delivery; the operating system controls notifications.” Do not replace an unknown number with a guess.

Use this answer structure: purpose -> input -> method -> output -> limitation. It works for nearly every module.

## 22. Closing statement

“AURA demonstrates an integrated workflow that observes facial and interaction-related signals, estimates possible fatigue and connects those estimates with wellness activities, reminders and visual summaries. Its value is the practical integration and transparent handling of observations. The present model is trained on synthetic data, the public demo has a separate browser fallback, and health benefits have not been clinically established. Future work will focus on representative evaluation, accessibility, security and reliable deployment.”

## 23. Final revision card

- AURA = Adaptive Unobtrusive Rest Assistant.
- MediaPipe = pretrained perception; EAR/MAR = derived geometry.
- 478 landmarks / 52 expression categories available from the bundled model.
- Python model = LightGBM regression; public static demo = weighted rules.
- Dataset = synthetic, 14,000 rows, 17 columns.
- Split = 82:18; 11,480 / 2,520.
- MAE = 2.7974; R² = 0.97177; not a real-world accuracy percentage.
- Four score labels: alert, mild, moderate, severe.
- Main beep = >=75 normally held 30 seconds; separate prolonged-closure path.
- Away alarm = 300 seconds of healthy no-face inference; manual Stop.
- Pace = 60 active seconds per input; >15% slowdown held 30 seconds; +0–20.
- Yawn = neutral -> hold >=1.5s -> closure -> count; six-second separation.
- PERCLOS = recent closed-sample proxy, approximately 60-second window.
- Recommendation = eight arms, backend LinUCB-based; alpha 0.55.
- Feedback updates policy, not the fatigue regressor.
- Persistence = SQLite backend / localStorage fallback / Chrome storage extension.
- OpenCV is shown in the old diagram but not in the active pipeline.
- Confidence display is heuristic, not validated probability.
- Guardian needs Chrome; camera needs ongoing monitored video.
- Fresh regression run for this guide = 71 tests passed.
