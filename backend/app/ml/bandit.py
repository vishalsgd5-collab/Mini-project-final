"""LinUCB contextual bandit for personalized wellness interventions.

Context is a compact encoding of the user's current physiological and
work state. Each arm is a 30–90s intervention. We persist A, b per user
so the policy personalizes without sharing weights across people.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from ..models import BanditState
from .interventions_catalog import ARM_IDS, CATALOG, get_intervention

CONTEXT_KEYS = [
    "fatigue_n",
    "perclos",
    "low_blink",
    "slouch",
    "long_screen",
    "idle",
    "afternoon",
    "late",
    "high_load",
]
ALPHA = 0.55
DIM = 1 + len(CONTEXT_KEYS)  # bias + features


def build_context(features: dict, score: float) -> np.ndarray:
    hour = float(features.get("hour_of_day") or 12)
    blink = float(features.get("blink_rate") or 16)
    typing = float(features.get("typing_rpm") or 100)
    vec = [
        1.0,
        score / 100.0,
        float(features.get("perclos") or 0),
        1.0 if blink < 11 else 0.0,
        float(features.get("posture_slouch") or 0),
        min(1.0, float(features.get("continuous_screen_min") or 0) / 90.0),
        float(features.get("idle_ratio") or 0),
        1.0 if 13 <= hour <= 16 else 0.0,
        1.0 if hour >= 21 or hour < 7 else 0.0,
        min(1.0, typing / 280.0),
    ]
    return np.array(vec, dtype=np.float64)


def _empty_state() -> dict:
    return {
        arm: {
            "A": np.eye(DIM).tolist(),
            "b": np.zeros(DIM).tolist(),
            "n": 0,
        }
        for arm in ARM_IDS
    }


def load_state(db: Session, user_id: int) -> dict:
    row = db.query(BanditState).filter_by(user_id=user_id).one_or_none()
    if not row:
        payload = _empty_state()
        row = BanditState(user_id=user_id, payload=json.dumps(payload))
        db.add(row)
        db.commit()
        return payload
    data = json.loads(row.payload)
    for arm in ARM_IDS:
        data.setdefault(arm, {"A": np.eye(DIM).tolist(), "b": np.zeros(DIM).tolist(), "n": 0})
    return data


def save_state(db: Session, user_id: int, state: dict) -> None:
    row = db.query(BanditState).filter_by(user_id=user_id).one_or_none()
    blob = json.dumps(state)
    if row:
        row.payload = blob
    else:
        db.add(BanditState(user_id=user_id, payload=blob))
    db.commit()


def _ucb(state_arm: dict, x: np.ndarray) -> float:
    A = np.array(state_arm["A"], dtype=np.float64)
    b = np.array(state_arm["b"], dtype=np.float64)
    try:
        A_inv = np.linalg.inv(A)
    except np.linalg.LinAlgError:
        A_inv = np.linalg.pinv(A)
    theta = A_inv @ b
    mean = float(theta @ x)
    bonus = ALPHA * math.sqrt(float(x @ A_inv @ x) + 1e-8)
    return mean + bonus


def _heuristic_rank(arm: str, features: dict, score: float) -> float:
    """Cold-start prior so the first sessions are not random."""
    pitch = float(features.get("head_pitch") or 0)
    slouch = float(features.get("posture_slouch") or 0)
    blink = float(features.get("blink_rate") or 16)
    perclos = float(features.get("perclos") or 0)
    screen = float(features.get("continuous_screen_min") or 0)
    idle = float(features.get("idle_ratio") or 0)
    prior = {
        "twenty_twenty": 0.4 + 0.5 * (blink < 12) + 0.4 * (perclos > 0.15) + 0.2 * (screen > 35),
        "palming": 0.3 + 0.6 * (perclos > 0.2) + 0.3 * (score > 60),
        "blink_gym": 0.35 + 0.7 * (blink < 10) + 0.2 * (blink > 26),
        "neck_roll": 0.25 + 0.6 * (pitch < -12) + 0.3 * slouch,
        "posture_reset": 0.3 + 0.8 * slouch + 0.3 * (pitch < -10),
        "box_breathing": 0.25 + 0.5 * (score > 65) + 0.4 * idle,
        "hydration": 0.2 + 0.35 * (screen > 40) + 0.2 * (score > 45),
        "micro_walk": 0.15 + 0.55 * (screen > 55) + 0.4 * (score > 70),
    }
    return prior.get(arm, 0.2)


def choose_arm(db: Session, user_id: int, features: dict, score: float) -> tuple[str, float]:
    state = load_state(db, user_id)
    x = build_context(features, score)
    scored = []
    for arm in ARM_IDS:
        ucb = _ucb(state[arm], x)
        prior = _heuristic_rank(arm, features, score)
        n = state[arm].get("n", 0)
        # Blend prior until the arm has been tried a few times
        mix = 1 / (1 + n / 3)
        scored.append((arm, (1 - mix) * ucb + mix * prior))
    scored.sort(key=lambda t: t[1], reverse=True)
    return scored[0]


def update(db: Session, user_id: int, arm: str, features: dict, score: float, reward: float) -> None:
    if arm not in ARM_IDS:
        return
    state = load_state(db, user_id)
    x = build_context(features, score)
    A = np.array(state[arm]["A"], dtype=np.float64)
    b = np.array(state[arm]["b"], dtype=np.float64)
    A += np.outer(x, x)
    b += reward * x
    state[arm]["A"] = A.tolist()
    state[arm]["b"] = b.tolist()
    state[arm]["n"] = int(state[arm].get("n", 0)) + 1
    save_state(db, user_id, state)


def should_interrupt(score: float, sensitivity: str, minutes_since_break: float, features: dict) -> bool:
    gates = {"gentle": 68, "balanced": 52, "assertive": 40}
    threshold = gates.get(sensitivity, 52)
    if minutes_since_break < 8:
        return False
    if score >= 78:
        return True
    screen = float(features.get("continuous_screen_min") or 0)
    if screen >= 55 and score >= threshold - 8:
        return True
    return score >= threshold


def recommend(db: Session, user_id: int, features: dict, score: float, sensitivity: str, minutes_since_break: float) -> dict | None:
    if not should_interrupt(score, sensitivity, minutes_since_break, features):
        return None
    arm, value = choose_arm(db, user_id, features, score)
    item = get_intervention(arm)
    reason = _reason(arm, features, score)
    return {**item, "reason": reason, "ucb": round(float(value), 3)}


def _reason(arm: str, features: dict, score: float) -> str:
    blink = float(features.get("blink_rate") or 16)
    pitch = float(features.get("head_pitch") or 0)
    screen = float(features.get("continuous_screen_min") or 0)
    mapping = {
        "twenty_twenty": f"Your blink rate is {blink:.0f}/min and the screen has been on for {screen:.0f} min — a far-focus reset will rest the ciliary muscle.",
        "palming": "Eyelids are lingering closed between blinks. Warm palming drops visual load without leaving the desk.",
        "blink_gym": f"Incomplete blinks ({blink:.0f}/min) dry the cornea. Full lid closures restore the tear film.",
        "neck_roll": f"Head pitch is {pitch:.0f}°. A slow neck unlock reverses the forward-head posture.",
        "posture_reset": "Shoulders are rounding toward the keyboard. A 35-second stack of the spine is enough to reset.",
        "box_breathing": f"Fatigue score {score:.0f} with a slowed cadence — box breathing down-regulates arousal in four rounds.",
        "hydration": "Long unbroken focus correlates with forgotten water. Stand, sip, look away.",
        "micro_walk": f"{screen:.0f} minutes continuous. A 75-second walk is the smallest dose that restores blood flow.",
    }
    return mapping.get(arm, "A short reset now will cost less than the crash later.")


def reward_from_feedback(status: str, fatigue_before: float, fatigue_after: float | None) -> float:
    base = {"completed": 1.0, "partial": 0.35, "skipped": -0.25, "dismissed": -0.35}.get(status, 0.0)
    if fatigue_after is not None and status == "completed":
        delta = fatigue_before - fatigue_after
        base += float(np.clip(delta / 40.0, -0.2, 0.5))
    return float(np.clip(base, -0.5, 1.5))
