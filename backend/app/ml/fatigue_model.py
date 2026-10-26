from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from ..config import ARTIFACTS_DIR, FEATURE_COLUMNS, score_to_level
from .train import train
from .activity import activity_adjustment, activity_driver, model_payload

_model = None
_metrics: dict = {}


def load_model():
    global _model, _metrics
    path = ARTIFACTS_DIR / "fatigue_lgbm.pkl"
    metrics_path = ARTIFACTS_DIR / "metrics.json"
    if not path.exists():
        _metrics = train()
    else:
        import json

        _metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
    _model = joblib.load(path)
    return _model


def get_model():
    if _model is None:
        load_model()
    return _model


def features_to_array(payload: dict) -> np.ndarray:
    row = [float(payload.get(col, 0.0) or 0.0) for col in FEATURE_COLUMNS]
    return np.array(row, dtype=np.float32).reshape(1, -1)


def _drivers(payload: dict, score: float) -> list[dict]:
    """Human-readable contributors, grounded in the same physiology as training."""
    items = []

    perclos = float(payload.get("perclos") or 0)
    if perclos > 0.12:
        items.append(
            {
                "key": "perclos",
                "label": "Eyelid closure time",
                "detail": f"PERCLOS {perclos:.0%} — lids lingering shut",
                "weight": min(1.0, (perclos - 0.08) / 0.35),
            }
        )

    ear = float(payload.get("avg_ear") or 0.28)
    if ear < 0.24:
        items.append(
            {
                "key": "ear",
                "label": "Drooping eyelids",
                "detail": f"Eye aspect ratio {ear:.2f} (alert ~0.28–0.32)",
                "weight": min(1.0, (0.28 - ear) / 0.12),
            }
        )

    blink = float(payload.get("blink_rate") or 16)
    if blink < 11:
        items.append(
            {
                "key": "blink",
                "label": "Suppressed blink rate",
                "detail": f"{blink:.0f} blinks/min — typical rest is 15–20",
                "weight": min(1.0, (12 - blink) / 9),
            }
        )
    elif blink > 26:
        items.append(
            {
                "key": "blink",
                "label": "Irritated / dry-eye blinking",
                "detail": f"{blink:.0f} blinks/min — often precedes a crash",
                "weight": min(1.0, (blink - 24) / 10),
            }
        )

    pitch = float(payload.get("head_pitch") or 0)
    if pitch < -10:
        items.append(
            {
                "key": "posture",
                "label": "Head pitching forward",
                "detail": f"Pitch {pitch:.0f}° — cervical slump",
                "weight": min(1.0, (-pitch - 8) / 24),
            }
        )

    slouch = float(payload.get("posture_slouch") or 0)
    if slouch > 0.35:
        items.append(
            {
                "key": "slouch",
                "label": "Collapsed posture",
                "detail": "Shoulders rounding, torso collapsing toward the desk",
                "weight": slouch,
            }
        )

    screen = float(payload.get("continuous_screen_min") or 0)
    if screen > 30:
        items.append(
            {
                "key": "screen",
                "label": "Unbroken screen time",
                "detail": f"{screen:.0f} minutes without a real pause",
                "weight": min(1.0, (screen - 25) / 90),
            }
        )

    idle = float(payload.get("idle_ratio") or 0)
    typing = float(payload.get("typing_rpm") or 0)
    if not payload.get("personal_activity") and idle > 0.4 and typing < 80:
        items.append(
            {
                "key": "cognition",
                "label": "Cognitive slowing",
                "detail": "Long idle gaps and a fallen typing cadence",
                "weight": min(1.0, idle),
            }
        )

    yawns = float(payload.get("yawn_count") or 0)
    mar = float(payload.get("mar") or 0)
    if yawns >= 2 or mar > 0.28:
        items.append(
            {
                "key": "yawn",
                "label": "Yawning / mouth opening",
                "detail": "A classic marker of rising sleep pressure",
                "weight": min(1.0, 0.4 + yawns / 5),
            }
        )

    personal_driver = activity_driver(payload)
    if personal_driver:
        items.append(personal_driver)
    items.sort(key=lambda d: d["weight"], reverse=True)
    if not items:
        items.append(
            {
                "key": "stable",
                "label": "Signals look stable",
                "detail": "Blink, posture and cadence are within a fresh range",
                "weight": 0.15,
            }
        )
    return items[:4]


def predict_fatigue(payload: dict) -> dict:
    model = get_model()
    X = features_to_array(model_payload(payload))
    raw = float(model.predict(X)[0])
    adjustment = activity_adjustment(payload)
    score = float(np.clip(raw + adjustment, 0, 100))
    level = score_to_level(score)
    # Confidence shrinks when inputs are extreme / sparse
    ear = float(payload.get("avg_ear") or 0)
    presence = 1.0 if 0.12 < ear < 0.4 else 0.55
    confidence = float(np.clip(0.62 + 0.28 * presence, 0.45, 0.94))
    return {
        "fatigue_score": round(score, 1),
        "level": level,
        "confidence": round(confidence, 2),
        "drivers": _drivers(payload, score),
        "metrics": _metrics,
        "activity_adjustment": adjustment,
    }
