# AURA HTTP API

All application routes are under `/api`. Authenticated routes expect

```
Authorization: Bearer <jwt>
```

## Auth

| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/auth/register` | `{name, email, password}` |
| POST | `/api/auth/login` | `{email, password}` |
| GET | `/api/auth/me` | — |
| PATCH | `/api/auth/settings` | any of `name`, `work_start_hour`, `work_end_hour`, `break_sensitivity`, `enable_camera`, `enable_keyboard`, `enable_mouse` |

Login/register return `{access_token, user}`.

## Sessions & scoring

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/sessions/start` | `{session_id, started_at}` |
| POST | `/api/sessions/end` | `{session_id, screen_minutes, blink_total}` |
| POST | `/api/fatigue/predict` | 17 features + `session_id` → score, level, drivers, optional intervention |
| POST | `/api/interventions/feedback` | `{event_id, status, fatigue_after?}` |
| GET | `/api/interventions/catalog` | eight rituals |
| GET | `/api/dashboard/overview` | today + 7-day series |
| GET | `/api/health` | liveness |

`status` for feedback: `completed` | `partial` | `skipped` | `dismissed`.
