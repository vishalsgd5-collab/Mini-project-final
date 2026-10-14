"""Create the demo login only — no fake fatigue history."""

from sqlalchemy.orm import Session

from .auth import hash_password
from .models import User

DEMO_EMAIL = "demo@aura.health"
DEMO_PASSWORD = "aura1234"


def seed_demo(db: Session) -> User:
    user = db.query(User).filter_by(email=DEMO_EMAIL).one_or_none()
    if user:
        return user
    user = User(
        name="Maya Chen",
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD),
        break_sensitivity="balanced",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
