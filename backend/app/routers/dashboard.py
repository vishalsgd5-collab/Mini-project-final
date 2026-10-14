from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db, utcnow
from ..models import FatigueReading, InterventionEvent, User, WorkSession

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _day_start(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/overview")
def overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = utcnow()
    today0 = _day_start(now)
    week0 = today0 - timedelta(days=6)

    readings = (
        db.query(FatigueReading)
        .filter(FatigueReading.user_id == user.id, FatigueReading.ts >= week0)
        .order_by(FatigueReading.ts.asc())
        .all()
    )
    events = (
        db.query(InterventionEvent)
        .filter(InterventionEvent.user_id == user.id, InterventionEvent.ts >= week0)
        .all()
    )
    sessions = (
        db.query(WorkSession)
        .filter(WorkSession.user_id == user.id, WorkSession.started_at >= week0)
        .all()
    )

    today_readings = [r for r in readings if r.ts >= today0]
    today_events = [e for e in events if e.ts >= today0]

    def avg(xs):
        return round(sum(xs) / len(xs), 1) if xs else 0.0

    today_scores = [r.fatigue_score for r in today_readings]
    today_blinks = [r.blink_rate for r in today_readings]
    screen_today = max([r.continuous_screen_min for r in today_readings], default=0)
    # Prefer summed session minutes if available
    screen_today = max(
        screen_today,
        sum(s.screen_minutes or 0 for s in sessions if s.started_at >= today0),
    )

    detections = sum(1 for r in today_readings if r.fatigue_score >= 50)
    breaks_taken = sum(1 for e in today_events if e.status == "completed")
    breaks_skipped = sum(1 for e in today_events if e.status in {"skipped", "dismissed"})

    # Hourly fatigue for today
    hourly = []
    by_hour = defaultdict(list)
    for r in today_readings:
        by_hour[r.ts.hour].append(r.fatigue_score)
    for h in range(24):
        hourly.append({"hour": h, "score": round(sum(by_hour[h]) / len(by_hour[h]), 1) if by_hour[h] else None})

    # Timeline of last ~90 readings today (or week fallback)
    timeline_src = today_readings[-120:] or readings[-120:]
    timeline = [
        {
            "t": r.ts.isoformat() + "Z",
            "score": r.fatigue_score,
            "level": r.level,
            "blink_rate": r.blink_rate,
            "perclos": r.perclos,
            "ear": r.avg_ear,
        }
        for r in timeline_src
    ]

    # 7-day series
    days = []
    for i in range(7):
        d0 = week0 + timedelta(days=i)
        d1 = d0 + timedelta(days=1)
        day_r = [r for r in readings if d0 <= r.ts < d1]
        day_e = [e for e in events if d0 <= e.ts < d1]
        day_s = [s for s in sessions if d0 <= s.started_at < d1]
        days.append(
            {
                "date": d0.strftime("%Y-%m-%d"),
                "label": d0.strftime("%a"),
                "avg_fatigue": avg([r.fatigue_score for r in day_r]),
                "peak_fatigue": round(max([r.fatigue_score for r in day_r], default=0), 1),
                "blink_rate": avg([r.blink_rate for r in day_r]),
                "screen_min": round(sum(s.screen_minutes or 0 for s in day_s), 1),
                "breaks": sum(1 for e in day_e if e.status == "completed"),
                "detections": sum(1 for r in day_r if r.fatigue_score >= 50),
            }
        )

    wellness = _wellness_index(today_scores, breaks_taken, breaks_skipped, screen_today, today_blinks)

    recent_breaks = [
        {
            "id": e.id,
            "title": e.title,
            "status": e.status,
            "ts": e.ts.isoformat() + "Z",
            "duration_sec": e.duration_sec,
            "reward": e.reward,
        }
        for e in sorted(today_events, key=lambda x: x.ts, reverse=True)[:8]
    ]

    insight = _insight(today_scores, today_blinks, screen_today, breaks_taken, detections)

    return {
        "generated_at": now.isoformat() + "Z",
        "today": {
            "fatigue_score": avg(today_scores),
            "peak_fatigue": round(max(today_scores, default=0), 1),
            "blink_rate": avg(today_blinks),
            "screen_minutes": round(screen_today, 1),
            "detections": detections,
            "breaks": breaks_taken,
            "skipped": breaks_skipped,
            "samples": len(today_readings),
            "wellness": wellness,
        },
        "hourly": hourly,
        "timeline": timeline,
        "week": days,
        "recent_breaks": recent_breaks,
        "insight": insight,
    }


def _wellness_index(scores, breaks, skipped, screen, blinks) -> int:
    if not scores:
        return 72
    avg_s = sum(scores) / len(scores)
    blink = sum(blinks) / len(blinks) if blinks else 16
    score = 100 - avg_s * 0.55
    score += min(12, breaks * 4)
    score -= min(10, skipped * 3)
    if 12 <= blink <= 22:
        score += 6
    if screen > 90:
        score -= 8
    return int(max(8, min(98, round(score))))


def _insight(scores, blinks, screen, breaks, detections) -> str:
    if not scores:
        return "Start a live session and AURA will begin charting your fatigue physiology."
    avg_s = sum(scores) / len(scores)
    blink = sum(blinks) / len(blinks) if blinks else 16
    if avg_s >= 65:
        return "Fatigue is running high today. Honour the next suggested pause — even 40 seconds drops eyelid closure time."
    if blink < 11:
        return f"Blink rate is sitting at {blink:.0f}/min (healthy rest is 15–20). A blink-gym or 20-20-20 reset will restore the tear film."
    if screen >= 70 and breaks == 0:
        return f"{screen:.0f} minutes of screen time without a completed break. AURA will start insisting more firmly."
    if detections >= 6 and breaks >= 3:
        return "You are catching fatigue early and actually taking the pauses. That is the habit that compounds."
    if avg_s < 35:
        return "Signals look fresh. Stay stacked in the chair and keep the blinks complete — you are in a good window."
    return "A moderate load today. Watch the afternoon dip around 14:00–16:00, when circadian sleep pressure rises."
