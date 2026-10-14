"""Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR).

Soukupová & Čech, 2016. Same six-point geometry used in the browser
pipeline (MediaPipe Face Mesh indices) so Python tooling stays aligned.

Left eye  : 33, 160, 158, 133, 153, 144
Right eye : 362, 385, 387, 263, 373, 380
Mouth     : 61, 81, 311, 291, 178, 402
"""

from __future__ import annotations

import math

LEFT_EYE = (33, 160, 158, 133, 153, 144)
RIGHT_EYE = (362, 385, 387, 263, 373, 380)
MOUTH = (61, 81, 311, 291, 178, 402)

EAR_BLINK_THRESH = 0.21
MAR_YAWN_THRESH = 0.55


def _dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def aspect_ratio(points, idx) -> float:
    p1, p2, p3, p4, p5, p6 = (points[i] for i in idx)
    return (_dist(p2, p6) + _dist(p3, p5)) / (2.0 * (_dist(p1, p4) + 1e-6))


def both_ears(points) -> tuple[float, float, float]:
    left = aspect_ratio(points, LEFT_EYE)
    right = aspect_ratio(points, RIGHT_EYE)
    return left, right, (left + right) / 2.0


def mouth_aspect(points) -> float:
    return aspect_ratio(points, MOUTH)
