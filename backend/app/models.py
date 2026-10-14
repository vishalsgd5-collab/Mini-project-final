from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    work_start_hour: Mapped[int] = mapped_column(Integer, default=9)
    work_end_hour: Mapped[int] = mapped_column(Integer, default=18)
    break_sensitivity: Mapped[str] = mapped_column(String(20), default="balanced")
    enable_camera: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_keyboard: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_mouse: Mapped[bool] = mapped_column(Boolean, default=True)

    sessions: Mapped[list["WorkSession"]] = relationship(back_populates="user")


class WorkSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    screen_minutes: Mapped[float] = mapped_column(Float, default=0)
    avg_fatigue: Mapped[float] = mapped_column(Float, default=0)
    peak_fatigue: Mapped[float] = mapped_column(Float, default=0)
    blink_total: Mapped[int] = mapped_column(Integer, default=0)
    break_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_breaks: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped["User"] = relationship(back_populates="sessions")
    readings: Mapped[list["FatigueReading"]] = relationship(back_populates="session")
    events: Mapped[list["InterventionEvent"]] = relationship(back_populates="session")


class FatigueReading(Base):
    __tablename__ = "fatigue_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    session: Mapped["WorkSession"] = relationship(back_populates="readings")
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    fatigue_score: Mapped[float] = mapped_column(Float)
    level: Mapped[str] = mapped_column(String(20))
    blink_rate: Mapped[float] = mapped_column(Float)
    perclos: Mapped[float] = mapped_column(Float)
    avg_ear: Mapped[float] = mapped_column(Float)
    head_pitch: Mapped[float] = mapped_column(Float)
    typing_rpm: Mapped[float] = mapped_column(Float)
    idle_ratio: Mapped[float] = mapped_column(Float)
    continuous_screen_min: Mapped[float] = mapped_column(Float)
    posture_slouch: Mapped[float] = mapped_column(Float)


class InterventionEvent(Base):
    __tablename__ = "intervention_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    arm: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(120))
    reason: Mapped[str] = mapped_column(Text, default="")
    duration_sec: Mapped[int] = mapped_column(Integer, default=60)
    status: Mapped[str] = mapped_column(String(20), default="offered")
    reward: Mapped[float] = mapped_column(Float, default=0)
    fatigue_before: Mapped[float] = mapped_column(Float, default=0)
    fatigue_after: Mapped[float | None] = mapped_column(Float, nullable=True)

    session: Mapped["WorkSession"] = relationship(back_populates="events")


class BanditState(Base):
    __tablename__ = "bandit_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    payload: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
