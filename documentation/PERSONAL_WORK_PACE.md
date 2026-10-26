# Session-relative typing and mouse fatigue evidence

## What changed

Previously the browser counted both `keydown` and `keypress`, so some typed keys counted twice. Mouse "intensity" was a capped event count (dependent on browser/device event frequency), not a movement speed. The dashboard displayed a maximum of local and Guardian typing counts, but prediction used only local activity. No within-person starting baseline was stored.

AURA now starts learning **your own starting pace when the Monitor opens**, independently for keyboard and mouse. The reference is held in memory for that Monitor session and is not a population typing threshold or a claim that you were rested initially.

## User flow

1. Open **Aura Monitor → Your personal work pace**. Work naturally, preferably on comparable tasks. An optional local-only typing area is available to try calibration without leaving AURA.
2. Each enabled channel learns from its **first 60 active seconds**, not simply 60 wall-clock seconds. Pauses do not calibrate a zero-speed baseline. Typing-only users do not have to move the mouse, and mouse-only users do not have to type.
3. After calibration, the starting pace freezes; it does not drift down as work slows. The UI displays starting pace, current active pace, calibration progress and slowdown.
4. **Restart pace baseline** discards both references and observations and starts learning again. Opening a new Monitor session/reloading also starts again. **Pause** clears observation windows/slowdown timers, keeps references, and stops input collection; Resume gathers fresh evidence. Changing keyboard/mouse permissions restarts calibration to discard earlier input.

## Measurements

- One eligible `keydown` counts once; repeat events, modifier/function keys, Ctrl/Meta/Alt shortcuts and password fields are excluded. Typed characters and document contents are not recorded or sent.
- Rolling **keys/min** is the key count in the last minute (normalized by elapsed time during the first minute). **Typing WPM** estimates five keypresses per word; it is not a spelling/accuracy-adjusted typing-test score.
- **Active typing pace** for baseline comparison divides key count by time in one-second batches with at least one eligible key. Fully idle seconds are excluded. Consequently it can differ from rolling WPM, which includes pauses.
- Mouse speed is **CSS pixels per moving second**: summed pointer path distance divided by elapsed time between nearby movement events. Long gaps/jumps are excluded. A static cursor and higher event polling frequency are not themselves slow movement. Only the last point is held transiently to compute distance; coordinates are never transmitted or persisted.
- The comparison uses a **rolling 60-second window**. An input channel needs at least **20 active seconds in that window**, a calibrated baseline, and activity in the last **5 seconds** to be eligible. Otherwise its slowdown contribution is zero; unavailable data is not fatigue evidence.

## Score integration

For each eligible channel:

```text
drop = clamp(1 - current_active_pace / starting_active_pace, 0, 1)

If drop <= 0.15, activity is absent, or the read timer has a >5s gap:
    reset the sustained-slowdown timer

After drop > 0.15 persists for 30 seconds:
    evidence = clamp((drop - 0.15) / 0.60, 0, 1)
Before that:
    evidence = 0

behavioral_score = 100 * mean(evidence across eligible channels)
activity_adjustment = 20 * behavioral_score / 100
final_fatigue_score = clamp(existing_visual_context_score + activity_adjustment, 0, 100)
```

The UI shows **+X / 20 points** from the last prediction. Example: an active baseline of 60 WPM later sustained at 24 WPM is a 60% decline. If typing is the only eligible channel, its evidence is `(0.60 - 0.15) / 0.60 = 0.75`, adding **15 points**, once the observation/hold requirements are met. The same applies when both channels decline by 60%. If the other eligible channel is stable, the mean contribution is smaller.

The Python model still uses its original **17 inputs**. For the new personal-activity path, its old absolute activity inputs are neutralized to typing 220 keys/min, mouse intensity 0.6 and idle ratio 0.1. The new bounded adjustment is then added explicitly. This prevents an inherently slow typist, a reading pause, or the same slowdown being counted twice through old absolute activity features. Raw measured counts remain available for display/readings. Existing clients without `personal_activity` retain their prior behavior.

The browser fallback uses the same adjustment and neutral idle contribution. Python/FastAPI now accepts bounded `behavioral_score`, readiness and channel slowdown fields, and returns `activity_adjustment` without dropping it from the response schema. This is an **explicit heuristic layer**, not a retrained LightGBM model or a measured clinical improvement. The existing score-75 beep trigger/timing, F8 mute, selected sound and independent away alarm are unchanged.

## Guardian 1.5.0 and scope

Reload the updated `extension` folder at `chrome://extensions` and refresh AURA and the other website tabs. Leave the Monitor open. Guardian batches only **numeric counts, distance and moving time** once per second from a visible, focused browser document. It routes these only to trusted AURA tabs. The Monitor uses local input while focused and Guardian batches otherwise—not both, and not a maximum of stale counts. Stale, duplicate, out-of-order and invalid batches are discarded before baseline learning.

AURA synchronizes running state and keyboard/mouse preferences to Guardian, including when the content script becomes ready after page load. Disabled inputs are masked both before collection and during forwarding. Activity capture permission is renewed while the Monitor runs and expires after 90 seconds without renewal, so a closed Monitor cannot leave indefinite collection enabled. Browser background timer throttling can pause measurement/renewal; gaps do not count as sustained slowing.

A browser extension **cannot measure native Windows application input** (Word, desktop Zoom, etc.), restricted Chrome pages, or arbitrary cross-origin iframe input. It does not infer fatigue from those unavailable signals. Without Guardian, input measurement is confined to the focused AURA page. Multiple open Monitor instances can replace Guardian's last activity preferences; use one active Monitor session for predictable references.

## Limits and checks

Different tasks, pointer sensitivity/zoom, changing devices, injuries, distractions and deliberate pacing can change speed without fatigue. Resting at the start is not verified. AURA therefore keeps eye/blink/posture/context evidence and bounds activity to 20 score points. It does not force the initial total score to zero. These timing/weight choices are engineering defaults, not clinically validated thresholds.

Tests cover fast-to-slow trends, slow-from-start users, constant/faster work, brief fluctuations, idle reading, independent opt-outs, pause/reset, mouse polling invariance, stale/duplicate input, missing telemetry, public fallback scoring, Python prediction/schema/route integration, Guardian routing and capture expiry. Test training uses a temporary directory rather than overwriting published model metrics.

```bash
node --test frontend/tests/*.test.mjs extension/tests/*.test.cjs
PYTHONPATH=backend python -m pytest backend/tests -q
npm run build --prefix frontend
```
