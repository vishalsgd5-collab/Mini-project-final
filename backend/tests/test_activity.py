import math

import numpy as np
import pytest
from pydantic import ValidationError

from app.config import FEATURE_COLUMNS
from app.ml.activity import activity_adjustment, model_payload
from app.ml import fatigue_model
from app.schemas import FeatureIn


def test_adjustment_is_opt_in_and_bounded():
    assert activity_adjustment({"behavioral_score": 100, "behavioral_ready": True}) == 0
    flags = {"personal_activity": True, "behavioral_ready": True}
    for value, expected in [(75, 15), (1000, 20), (-1, 0), (math.nan, 0), (math.inf, 0), (None, 0), ("bad", 0)]:
        assert activity_adjustment({**flags, "behavioral_score": value}) == expected
    assert activity_adjustment({**flags, "behavioral_ready": False, "behavioral_score": 100}) == 0


def test_schema_preserves_new_signal_and_rejects_invalid_values():
    f = FeatureIn(personal_activity=True, behavioral_ready=True, behavioral_score=75, typing_slowdown=.6)
    assert f.model_dump()["behavioral_score"] == 75
    for field, value in [("behavioral_score", -1), ("behavioral_score", 101), ("behavioral_score", math.nan), ("typing_slowdown", 2), ("mouse_slowdown", math.inf)]:
        with pytest.raises(ValidationError):
            FeatureIn(**{field: value})


def test_existing_model_schema_unchanged_and_absolute_activity_neutralized():
    old = {"typing_rpm": 20, "mouse_intensity": .05, "idle_ratio": 1, "perclos": .3}
    assert model_payload(old) is old  # Backward-compatible old clients.
    actual = model_payload({**old, "personal_activity": True})
    assert actual["typing_rpm"] == 220
    assert actual["mouse_intensity"] == .6
    assert actual["idle_ratio"] == .1
    assert actual["perclos"] == .3
    assert old["typing_rpm"] == 20
    assert len(FEATURE_COLUMNS) == 17


def test_python_prediction_applies_personal_slowdown_and_explains_it(monkeypatch):
    seen = []
    class FixedModel:
        def predict(self, row):
            seen.append(row)
            return np.array([50.0])
    monkeypatch.setattr(fatigue_model, "get_model", lambda: FixedModel())
    payload = FeatureIn(personal_activity=True, behavioral_ready=True, behavioral_score=75, typing_rpm=100).model_dump()
    result = fatigue_model.predict_fatigue(payload)
    assert result["fatigue_score"] == 65
    assert result["activity_adjustment"] == 15
    assert any(d["key"] == "personal_pace" for d in result["drivers"])
    assert seen[0].shape == (1, 17)
    assert seen[0][0, FEATURE_COLUMNS.index("typing_rpm")] == 220
    payload["behavioral_ready"] = False
    assert fatigue_model.predict_fatigue(payload)["fatigue_score"] == 50


def test_prediction_route_keeps_adjustment_in_response(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from sqlalchemy.pool import StaticPool
    from app.auth import get_current_user
    from app.database import Base, get_db
    from app.models import User, WorkSession
    from app.routers import fatigue

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(name="Test", email="pace@example.test", password_hash="not-used")
        db.add(user); db.commit(); db.refresh(user)
        session = WorkSession(user_id=user.id)
        db.add(session); db.commit(); db.refresh(session)
        monkeypatch.setattr(fatigue_model, "get_model", lambda: type("Model", (), {"predict": lambda self, row: [50]})())
        monkeypatch.setattr(fatigue, "recommend", lambda *args: None)
        app = FastAPI()
        app.include_router(fatigue.router)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            response = client.post("/api/fatigue/predict", json={"session_id": session.id, "personal_activity": True, "behavioral_ready": True, "behavioral_score": 75})
            assert response.status_code == 200, response.text
            assert response.json()["activity_adjustment"] == 15
            assert response.json()["fatigue_score"] == 65
    engine.dispose()
