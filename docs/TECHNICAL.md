# AURA — technical notes

## 1. Eye Aspect Ratio

For six eye landmarks \(p_1 \ldots p_6\) (outer corner, two upper lid, inner corner, two lower lid):

\[
EAR = \frac{\lVert p_2 - p_6 \rVert + \lVert p_3 - p_5 \rVert}{2\,\lVert p_1 - p_4 \rVert}
\]

A blink is an EAR valley below **0.21** lasting 2–17 frames. PERCLOS is the fraction of the last 60 seconds spent below that threshold.

MediaPipe Face Mesh indices (identical in `frontend/src/lib/vision.js` and `backend/app/ml/ear.py`):

| Region | Indices |
| --- | --- |
| Left eye | 33, 160, 158, 133, 153, 144 |
| Right eye | 362, 385, 387, 263, 373, 380 |
| Mouth (MAR) | 61, 81, 311, 291, 178, 402 |

MAR above **0.55** for ≥ 350 ms counts as a yawn.

Head pose uses the 4×4 facial transformation matrix when MediaPipe provides it, else a geometric fallback from nose / eye corners / chin.

## 2. Feature vector (17)

| Feature | Source | Fatigue direction |
| --- | --- | --- |
| `blink_rate` | blink tracker, /min | low (or very high dry-eye spike) |
| `perclos` | EAR window | high |
| `avg_ear` | EAR window | low (droop) |
| `ear_std` | EAR window | high |
| `head_pitch` | pose | more negative |
| `head_yaw`, `head_roll` | pose | instability |
| `mar`, `yawn_count` | mouth | high |
| `typing_rpm` | keydown / min | low, with high idle |
| `mouse_intensity` | moves / min, 0–1 | low |
| `idle_ratio` | ≥4 s without input | high |
| `continuous_screen_min` | session clock | high |
| `hour_of_day` | local time | afternoon dip, late night |
| `session_min` | session clock | high |
| `posture_slouch` | pitch + roll | high |
| `look_away_ratio` | Page Visibility API | mixed |

## 3. LightGBM

- Objective: regression on a 0–100 fatigue score
- 14,000 synthetic rows whose latent fatigue is a function of continuous screen time, circadian hour and a beta prior, then expressed through the physiology above plus Gaussian noise
- `LGBMRegressor`: 420 trees, `num_leaves=48`, `learning_rate=0.045`, `max_depth=8`
- Hold-out (~18%) MAE typically 3–4 points, R² > 0.9

Levels: alert < 25 ≤ mild < 50 ≤ moderate < 75 ≤ severe.

## 4. LinUCB bandit

Arms: `twenty_twenty`, `palming`, `blink_gym`, `neck_roll`, `posture_reset`, `box_breathing`, `hydration`, `micro_walk`.

Context \(x \in \mathbb{R}^9\) (plus bias): normalised fatigue, PERCLOS, low-blink flag, slouch, long-screen, idle, afternoon, late, high typing load.

For each arm \(a\):

\[
A_a \leftarrow A_a + xx^\top,\quad b_a \leftarrow b_a + r x
\]

\[
\theta_a = A_a^{-1} b_a,\quad
UCB_a = \theta_a^\top x + \alpha \sqrt{x^\top A_a^{-1} x}
\]

\(\alpha = 0.55\). \(A, b\) are stored per user in SQLite (`bandit_state`). Until an arm has been tried a few times, UCB is mixed with a physiological prior (e.g. low blinks → blink gym / 20-20-20, forward pitch → neck unlock).

**Gate.** Do not interrupt within 8 minutes of a completed break. Always interrupt if score ≥ 78. Otherwise require score ≥ threshold(sensitivity).

**Reward**

| Feedback | Base |
| --- | --- |
| completed | +1.0 |
| partial | +0.35 |
| skipped | −0.25 |
| dismissed | −0.35 |

Completed pauses add \(\mathrm{clip}((s_\text{before}-s_\text{after})/40, -0.2, 0.5)\).

## 5. Privacy

The Face Mesh graph runs entirely in the browser (WASM). `/api/fatigue/predict` accepts JSON features only. Users can disable camera, keyboard or mouse in Settings; the model still runs on whatever subset remains, with lower confidence when EAR is absent.
