from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db, utcnow
from ..ml.bandit import recommend, reward_from_feedback, update as bandit_update
from ..ml.fatigue_model import predict_fatigue
from ..models import FatigueReading, InterventionEvent, User, WorkSession
from ..schemas import FeatureIn, FeedbackIn, PredictOut, SessionEndIn, SessionStartOut

router = APIRouter(prefix="/api", tags=["fatigue"])


@router.post("/sessions/start", response_model=SessionStartOut)
def start_session(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = WorkSession(user_id=user.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return SessionStartOut(session_id=session.id, started_at=session.started_at)


@router.post("/sessions/end")
def end_session(body: SessionEndIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.get(WorkSession, body.session_id)
    if not session or session.user_id != user.id:
        return {"ok": False}
    session.ended_at = utcnow()
    session.screen_minutes = body.screen_minutes
    session.blink_total = body.blink_total
    readings = db.query(FatigueReading).filter_by(session_id=session.id).all()
    if readings:
        scores = [r.fatigue_score for r in readings]
        session.avg_fatigue = sum(scores) / len(scores)
        session.peak_fatigue = max(scores)
    events = db.query(InterventionEvent).filter_by(session_id=session.id).all()
    session.break_count = sum(1 for e in events if e.status == "completed")
    session.skipped_breaks = sum(1 for e in events if e.status in {"skipped", "dismissed"})
    db.commit()
    return {
        "ok": True,
        "avg_fatigue": session.avg_fatigue,
        "peak_fatigue": session.peak_fatigue,
        "breaks": session.break_count,
    }


@router.post("/fatigue/predict", response_model=PredictOut)
def predict(body: FeatureIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = body.model_dump()
    result = predict_fatigue(payload)

    session_id = body.session_id
    if session_id:
        session = db.get(WorkSession, session_id)
        if not session or session.user_id != user.id:
            session_id = None

    reading = FatigueReading(
        user_id=user.id,
        session_id=session_id or 0,
        fatigue_score=result["fatigue_score"],
        level=result["level"],
        blink_rate=body.blink_rate,
        perclos=body.perclos,
        avg_ear=body.avg_ear,
        head_pitch=body.head_pitch,
        typing_rpm=body.typing_rpm,
        idle_ratio=body.idle_ratio,
        continuous_screen_min=body.continuous_screen_min,
        posture_slouch=body.posture_slouch,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    minutes_since = 999.0
    last_q = db.query(InterventionEvent).filter(
        InterventionEvent.user_id == user.id,
        InterventionEvent.status == "completed",
    )
    if session_id:
        last_q = last_q.filter(InterventionEvent.session_id == session_id)
    last = last_q.order_by(InterventionEvent.ts.desc()).first()
    if last:
        minutes_since = (utcnow() - last.ts).total_seconds() / 60.0

    rec = recommend(
        db,
        user.id,
        payload,
        result["fatigue_score"],
        user.break_sensitivity,
        minutes_since,
    )

    intervention = None
    if rec and session_id:
        event = InterventionEvent(
            user_id=user.id,
            session_id=session_id,
            arm=rec["id"],
            title=rec["title"],
            reason=rec["reason"],
            duration_sec=rec["duration_sec"],
            status="offered",
            fatigue_before=result["fatigue_score"],
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        intervention = {
            "id": rec["id"],
            "title": rec["title"],
            "duration_sec": rec["duration_sec"],
            "category": rec["category"],
            "reason": rec["reason"],
            "steps": rec["steps"],
            "cue": rec["cue"],
            "event_id": event.id,
        }

    return PredictOut(
        fatigue_score=result["fatigue_score"],
        level=result["level"],
        confidence=result["confidence"],
        drivers=result["drivers"],
        recommend_break=intervention is not None,
        intervention=intervention,
        reading_id=reading.id,
    )


@router.post("/interventions/feedback")
def feedback(body: FeedbackIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = db.get(InterventionEvent, body.event_id)
    if not event or event.user_id != user.id:
        return {"ok": False}
    event.status = body.status
    event.fatigue_after = body.fatigue_after
    reward = reward_from_feedback(body.status, event.fatigue_before, body.fatigue_after)
    event.reward = reward
    db.commit()

    reading = (
        db.query(FatigueReading)
        .filter_by(user_id=user.id)
        .order_by(FatigueReading.ts.desc())
        .first()
    )
    features = {
        "perclos": reading.perclos if reading else 0.1,
        "blink_rate": reading.blink_rate if reading else 14,
        "posture_slouch": reading.posture_slouch if reading else 0.2,
        "continuous_screen_min": reading.continuous_screen_min if reading else 30,
        "idle_ratio": reading.idle_ratio if reading else 0.2,
        "hour_of_day": utcnow().hour,
        "typing_rpm": reading.typing_rpm if reading else 100,
        "head_pitch": reading.head_pitch if reading else -6,
    }
    bandit_update(db, user.id, event.arm, features, event.fatigue_before, reward)
    return {"ok": True, "reward": reward}
