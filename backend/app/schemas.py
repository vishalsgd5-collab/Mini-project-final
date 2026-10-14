from datetime import datetime

from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=80)


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    work_start_hour: int
    work_end_hour: int
    break_sensitivity: str
    enable_camera: bool
    enable_keyboard: bool
    enable_mouse: bool

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SettingsIn(BaseModel):
    name: str | None = None
    work_start_hour: int | None = None
    work_end_hour: int | None = None
    break_sensitivity: str | None = None
    enable_camera: bool | None = None
    enable_keyboard: bool | None = None
    enable_mouse: bool | None = None


class FeatureIn(BaseModel):
    blink_rate: float = 16.0
    perclos: float = 0.08
    avg_ear: float = 0.28
    ear_std: float = 0.03
    head_pitch: float = -4.0
    head_yaw: float = 0.0
    head_roll: float = 0.0
    mar: float = 0.05
    yawn_count: float = 0
    typing_rpm: float = 120
    mouse_intensity: float = 0.4
    idle_ratio: float = 0.1
    continuous_screen_min: float = 15
    hour_of_day: float = 11
    session_min: float = 15
    posture_slouch: float = 0.15
    look_away_ratio: float = 0.05
    session_id: int | None = None


class InterventionOut(BaseModel):
    id: str
    title: str
    duration_sec: int
    category: str
    reason: str
    steps: list[str]
    cue: str
    event_id: int | None = None


class PredictOut(BaseModel):
    fatigue_score: float
    level: str
    confidence: float
    drivers: list[dict]
    recommend_break: bool
    intervention: InterventionOut | None = None
    reading_id: int | None = None


class FeedbackIn(BaseModel):
    event_id: int
    status: str
    fatigue_after: float | None = None


class SessionStartOut(BaseModel):
    session_id: int
    started_at: datetime


class SessionEndIn(BaseModel):
    session_id: int
    screen_minutes: float = 0
    blink_total: int = 0
