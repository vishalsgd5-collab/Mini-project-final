from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
DB_PATH = BASE_DIR / "aura.db"

SECRET_KEY = "aura-wellness-dev-secret-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 14

FEATURE_COLUMNS = [
    "blink_rate",
    "perclos",
    "avg_ear",
    "ear_std",
    "head_pitch",
    "head_yaw",
    "head_roll",
    "mar",
    "yawn_count",
    "typing_rpm",
    "mouse_intensity",
    "idle_ratio",
    "continuous_screen_min",
    "hour_of_day",
    "session_min",
    "posture_slouch",
    "look_away_ratio",
]

FATIGUE_LEVELS = [
    (0, 25, "alert"),
    (25, 50, "mild"),
    (50, 75, "moderate"),
    (75, 101, "severe"),
]


def score_to_level(score: float) -> str:
    for lo, hi, name in FATIGUE_LEVELS:
        if lo <= score < hi:
            return name
    return "severe"
