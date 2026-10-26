from app.ml.ear import EAR_BLINK_THRESH, both_ears, mouth_aspect
from app.ml.bandit import build_context, reward_from_feedback, should_interrupt
from app.ml.train import synthesize, train


def test_ear_open_eye():
    pts = {i: (0.0, 0.0) for i in range(500)}
    # wide-open left eye
    pts[33] = (0, 0)
    pts[133] = (2, 0)
    pts[160] = (0.6, 0.5)
    pts[158] = (1.4, 0.5)
    pts[153] = (1.4, -0.5)
    pts[144] = (0.6, -0.5)
    # copy to right
    pts[362], pts[263], pts[385], pts[387], pts[373], pts[380] = (
        pts[33],
        pts[133],
        pts[160],
        pts[158],
        pts[153],
        pts[144],
    )
    left, right, avg = both_ears(pts)
    assert avg > EAR_BLINK_THRESH


def test_mar_closed_mouth():
    pts = {i: (0.0, 0.0) for i in range(500)}
    pts[61] = (0, 0)
    pts[81] = (0.7, 0.05)
    pts[311] = (1.3, 0.05)
    pts[291] = (2, 0)
    # Lower lip points must remain on the same side as their upper partners.
    pts[178] = (0.7, -0.05)
    pts[402] = (1.3, -0.05)
    assert mouth_aspect(pts) < 0.2


def test_bandit_helpers():
    x = build_context({"perclos": 0.3, "blink_rate": 8, "posture_slouch": 0.7,
                       "continuous_screen_min": 70, "idle_ratio": 0.4,
                       "hour_of_day": 15, "typing_rpm": 40}, 72)
    assert x.shape == (9,) or x.shape == (10,)
    assert should_interrupt(80, "gentle", 20, {"continuous_screen_min": 10})
    assert not should_interrupt(40, "gentle", 20, {"continuous_screen_min": 10})
    assert not should_interrupt(90, "balanced", 3, {"continuous_screen_min": 80})
    assert reward_from_feedback("completed", 70, 40) > 0.9
    assert reward_from_feedback("dismissed", 70, None) < 0


def test_synthesize_bounds():
    X, y = synthesize(200, seed=1)
    assert X.shape == (200, 17)
    assert y.min() >= 0 and y.max() <= 100


def test_train_smoke():
    metrics = train(n=800)
    assert metrics["mae"] < 12
    assert "blink_rate" in metrics["importances"]
