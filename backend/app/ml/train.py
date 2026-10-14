"""Generate physiologically plausible synthetic data and train LightGBM."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

from ..config import ARTIFACTS_DIR, FEATURE_COLUMNS


def _circadian(hour: np.ndarray) -> np.ndarray:
    """Afternoon dip + late-night penalty."""
    afternoon = np.exp(-0.5 * ((hour - 14.5) / 1.6) ** 2)
    late = np.clip((hour - 21) / 4.0, 0, 1) + np.clip((8 - hour) / 6.0, 0, 1)
    return 8 * afternoon + 12 * late


def synthesize(n: int = 14000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)

    hour = rng.uniform(7, 24, n)
    session_min = rng.gamma(3.2, 18.0, n).clip(2, 280)
    continuous = (session_min * rng.uniform(0.45, 0.98, n)).clip(1, 220)

    # Base physiology, then fatigue-linked distortions
    latent = rng.beta(2.2, 3.4, n)  # 0 = fresh, 1 = exhausted prior
    latent = np.clip(
        latent
        + 0.0022 * continuous
        + 0.0011 * session_min
        + _circadian(hour) / 80.0
        + rng.normal(0, 0.05, n),
        0,
        1,
    )

    blink_rate = 18 - 10 * latent + rng.normal(0, 2.2, n)
    # Screen-dry eyes can briefly elevate blinks before they crash
    dry_spike = (rng.random(n) < 0.12) * rng.uniform(4, 12, n) * (1 - latent)
    blink_rate = np.clip(blink_rate + dry_spike, 3.5, 34)

    avg_ear = np.clip(0.31 - 0.13 * latent + rng.normal(0, 0.018, n), 0.12, 0.38)
    ear_std = np.clip(0.02 + 0.06 * latent + rng.normal(0, 0.01, n), 0.008, 0.12)
    perclos = np.clip(0.05 + 0.38 * latent + rng.normal(0, 0.03, n), 0.02, 0.62)

    head_pitch = np.clip(-3 - 22 * latent + rng.normal(0, 4.5, n), -42, 18)
    head_yaw = rng.normal(0, 6 + 8 * latent, n).clip(-35, 35)
    head_roll = rng.normal(0, 3 + 5 * latent, n).clip(-22, 22)
    posture_slouch = np.clip(0.08 + 0.72 * latent + rng.normal(0, 0.07, n), 0, 1)

    mar = np.clip(0.04 + 0.22 * latent * (rng.random(n) < 0.35) + rng.normal(0, 0.02, n), 0, 0.7)
    yawn_count = rng.poisson(0.2 + 3.4 * latent)

    flow = rng.beta(2.5, 2.0, n) * (1 - 0.6 * latent)
    typing_rpm = np.clip(80 + 220 * flow - 90 * latent + rng.normal(0, 28, n), 0, 420)
    mouse_intensity = np.clip(0.15 + 0.7 * flow - 0.35 * latent + rng.normal(0, 0.08, n), 0, 1)
    idle_ratio = np.clip(0.05 + 0.55 * latent + rng.normal(0, 0.06, n), 0, 0.95)
    look_away_ratio = np.clip(0.04 + 0.22 * latent + rng.normal(0, 0.04, n), 0, 0.7)

    X = np.column_stack(
        [
            blink_rate,
            perclos,
            avg_ear,
            ear_std,
            head_pitch,
            head_yaw,
            head_roll,
            mar,
            yawn_count.astype(float),
            typing_rpm,
            mouse_intensity,
            idle_ratio,
            continuous,
            hour,
            session_min,
            posture_slouch,
            look_away_ratio,
        ]
    )

    # Interpretable generating function the booster should recover
    y = (
        12
        + 38 * latent
        + 55 * np.clip(perclos - 0.08, 0, 1)
        + 28 * np.clip((0.24 - avg_ear) / 0.12, 0, 1)
        + 18 * np.clip((12 - blink_rate) / 10, 0, 1.4)
        + 16 * np.clip((-head_pitch - 8) / 25, 0, 1)
        + 14 * posture_slouch
        + 10 * idle_ratio
        + 0.12 * np.clip(continuous - 25, 0, 140)
        + 8 * np.clip(yawn_count / 4, 0, 1)
        + 6 * np.clip(mar - 0.15, 0, 1)
        + _circadian(hour) * 0.35
        + rng.normal(0, 3.4, n)
    )
    y = np.clip(y, 0, 100)
    return X.astype(np.float32), y.astype(np.float32)


def train(n: int = 14000) -> dict:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    X, y = synthesize(n)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.18, random_state=7)

    model = lgb.LGBMRegressor(
        n_estimators=420,
        learning_rate=0.045,
        num_leaves=48,
        max_depth=8,
        min_child_samples=24,
        subsample=0.85,
        colsample_bytree=0.9,
        reg_lambda=1.2,
        random_state=7,
        verbosity=-1,
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    metrics = {
        "mae": float(mean_absolute_error(y_test, pred)),
        "r2": float(r2_score(y_test, pred)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "features": FEATURE_COLUMNS,
        "importances": {
            name: float(val)
            for name, val in zip(FEATURE_COLUMNS, model.feature_importances_)
        },
    }

    joblib.dump(model, ARTIFACTS_DIR / "fatigue_lgbm.pkl")
    (ARTIFACTS_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))
    return metrics


if __name__ == "__main__":
    print(json.dumps(train(), indent=2))
