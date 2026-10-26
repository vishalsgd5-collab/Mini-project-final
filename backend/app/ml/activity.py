"""Transparent personal-baseline adjustment, not a newly trained ML feature."""
import math


def activity_adjustment(payload: dict) -> float:
    if payload.get("personal_activity") is not True or payload.get("behavioral_ready") is not True:
        return 0.0
    try:
        value = float(payload.get("behavioral_score", 0))
    except (ValueError, TypeError):
        return 0.0
    return round(min(100.0, max(0.0, value)) * 0.2, 1) if math.isfinite(value) else 0.0


def model_payload(payload: dict) -> dict:
    if payload.get("personal_activity") is not True:
        return payload
    # Original model has absolute activity features, not within-user baselines.
    # Neutralize them so a naturally slow typist / reading pause is not counted
    # as personal slowing, and avoid counting the same slowdown twice.
    return {**payload, "typing_rpm": 220.0, "mouse_intensity": 0.6, "idle_ratio": 0.1}


def activity_driver(payload: dict) -> dict | None:
    adjustment = activity_adjustment(payload)
    if not adjustment:
        return None
    return {
        "key": "personal_pace", "label": "Slower than your starting pace",
        "detail": f"Sustained personal typing/mouse slowdown: +{adjustment:.1f} score points (maximum 20).",
        "weight": adjustment / 20,
    }
