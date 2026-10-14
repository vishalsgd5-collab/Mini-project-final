"""Seed a demo user with a week of plausible wellness history."""

from datetime import timedelta

import numpy as np
from sqlalchemy.orm import Session

from .auth import hash_password
from .database import utcnow
from .models import FatigueReading, InterventionEvent, User, WorkSession

DEMO_EMAIL = "demo@aura.health"
DEMO_PASSWORD = "aura1234"

ARMS = [
    ("twenty_twenty", "20-20-20 Gaze Reset", 25),
    ("palming", "Warm Palming", 40),
    ("blink_gym", "Blink Gym", 30),
    ("neck_roll", "Neck & Shoulder Unlock", 50),
    ("posture_reset", "Posture Reset", 35),
    ("box_breathing", "Box Breathing", 64),
    ("hydration", "Hydration Pause", 30),
    ("micro_walk", "Micro Walk", 75),
]


def seed_demo(db: Session) -> User:
    user = db.query(User).filter_by(email=DEMO_EMAIL).one_or_none()
    if user:
        return user

    rng = np.random.default_rng(11)
    user = User(
        name="Maya Chen",
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD),
        break_sensitivity="balanced",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    now = utcnow()
    for day in range(6, -1, -1):
        day0 = (now - timedelta(days=day)).replace(hour=9, minute=10, second=0, microsecond=0)
        sess = WorkSession(
            user_id=user.id,
            started_at=day0,
            ended_at=day0 + timedelta(hours=6, minutes=20),
            screen_minutes=float(rng.integers(180, 320)),
            blink_total=int(rng.integers(1400, 2600)),
        )
        db.add(sess)
        db.commit()
        db.refresh(sess)

        scores = []
        n = 48
        for i in range(n):
            t = day0 + timedelta(minutes=int(i * 7.5))
            hour = t.hour + t.minute / 60
            latent = 0.18 + 0.004 * i + 0.22 * np.exp(-0.5 * ((hour - 14.8) / 1.4) ** 2)
            if day in (1, 4):
                latent += 0.12
            latent = float(np.clip(latent + rng.normal(0, 0.04), 0.05, 0.95))
            score = float(np.clip(18 + 70 * latent + rng.normal(0, 4), 8, 96))
            scores.append(score)
            blink = float(np.clip(18 - 9 * latent + rng.normal(0, 1.4), 6, 28))
            db.add(
                FatigueReading(
                    user_id=user.id,
                    session_id=sess.id,
                    ts=t,
                    fatigue_score=round(score, 1),
                    level="alert" if score < 25 else "mild" if score < 50 else "moderate" if score < 75 else "severe",
                    blink_rate=round(blink, 1),
                    perclos=round(float(np.clip(0.06 + 0.32 * latent, 0.03, 0.5)), 3),
                    avg_ear=round(float(np.clip(0.30 - 0.12 * latent, 0.14, 0.34)), 3),
                    head_pitch=round(float(-4 - 18 * latent + rng.normal(0, 2)), 1),
                    typing_rpm=round(float(np.clip(200 - 110 * latent + rng.normal(0, 20), 20, 340)), 1),
                    idle_ratio=round(float(np.clip(0.08 + 0.45 * latent, 0, 0.9)), 3),
                    continuous_screen_min=round(float(i * 7.5), 1),
                    posture_slouch=round(float(np.clip(0.1 + 0.6 * latent, 0, 1)), 3),
                )
            )

        # A few interventions per day
        k = int(rng.integers(3, 6))
        taken = 0
        skipped = 0
        for j in range(k):
            arm = ARMS[int(rng.integers(0, len(ARMS)))]
            status = "completed" if rng.random() > 0.28 else "skipped"
            if status == "completed":
                taken += 1
            else:
                skipped += 1
            db.add(
                InterventionEvent(
                    user_id=user.id,
                    session_id=sess.id,
                    ts=day0 + timedelta(minutes=int(40 + j * 55 + rng.integers(0, 20))),
                    arm=arm[0],
                    title=arm[1],
                    reason="Personalized pause from the LinUCB policy.",
                    duration_sec=arm[2],
                    status=status,
                    reward=1.0 if status == "completed" else -0.25,
                    fatigue_before=float(rng.uniform(48, 82)),
                    fatigue_after=float(rng.uniform(30, 55)) if status == "completed" else None,
                )
            )

        sess.avg_fatigue = float(np.mean(scores))
        sess.peak_fatigue = float(np.max(scores))
        sess.break_count = taken
        sess.skipped_breaks = skipped
        db.commit()

    return user
