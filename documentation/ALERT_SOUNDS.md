# AURA selectable alert sounds

## Choose your sound

1. Sign in, then open **Studio settings → Beep sound**. The **Aura Monitor** also has a collapsible **Beep sound** section below its top controls.
2. Click **Preview** beside any of the eight options. Preview intentionally works even when fatigue alerts are muted. A new preview replaces the previous one; **Stop preview** cancels it.
3. Click **Use sound**, or choose a name in **Selected beep**. The selected card is marked **✓ Selected**. Choosing a preview alone does **not** save it.
4. Set **Beep volume** (15–100%). Changes save immediately in this browser and survive a refresh; there is no extra Save button for sound preferences.

Sounds: **Soft double beep, Bright triple beep, Digital pulse, Rising alert, Glass chime, Radar ping, Low pulse, Arcade up**. Bright triple is the default when there is no valid saved selection. There is no custom-file upload in this version.

The saved choice applies to fatigue beeps, ritual chimes and Ember Docket reminder sounds. It does **not** change fatigue thresholds, yawn detection or reminder dates. F8 still mutes fatigue/ritual/reminder audio without disabling desktop notifications. The independent five-minute no-face alarm keeps its recognizable fixed tone, ignores F8, and repeats until **Stop alarm**. Its volume still follows the saved volume setting.

## Guardian 1.5.0 (current)

Download the updated project, open `chrome://extensions`, enable Developer mode, and **Load unpacked** the `extension` folder. If Guardian is already installed from that folder, click **Reload** after replacing its files. **Refresh the AURA tab and other existing website tabs** so their content scripts are updated. Click in AURA once, then select a sound. The browser sends the saved sound ID, volume and mute state to Guardian, which persists them in `chrome.storage.local` for future scheduled reminders, including when the AURA tab is closed.

Guardian uses one offscreen audio document, not a separate audio renderer in every website tab. Chrome must remain running for its alarms. Leave the AURA camera tab open for webcam fatigue/away detection; this feature does not make the camera work after closing Chrome. Allow Chrome and Windows notifications, and disable Do Not Disturb if necessary. Windows controls where native toasts appear.

A click/keypress may be needed before browser audio is permitted. Actual loudness depends on Windows volume, the output device, Chrome site sound settings and browser policies. Start with low headphone/system volume. No real-device loudness, webcam accuracy or Windows toast delivery guarantee is implied by automated tests.

## Implementation and checks

- `extension/sound-catalog.js`: shared, local-only note catalog; bounded Web Audio envelopes and WAV fallback generator. Frontend and Guardian render the same notes.
- `frontend/src/lib/sound.js`: sound/volume/mute storage, preview cancellation, local audio playback and Guardian sync. Uses one local playback path at a time (Web Audio, or a WAV fallback).
- `frontend/src/components/SoundPicker.jsx`: accessible select, volume slider, preview/use buttons and live saved status; reused on Monitor and Settings.
- `extension/background.js`: trusted-site preference sync, persistence, scheduled reminder settings and routing to offscreen playback.
- `extension/offscreen.js`: one Guardian renderer, muted normal alerts and independent repeating away tone with immediate Stop cancellation.
- `scripts/generate-beep-options.cjs`: regenerates the standalone listening page and eight WAV downloads from the catalog. Do not use the earlier four-sample generator.

```bash
node --test frontend/tests/*.test.mjs extension/tests/*.test.cjs
PYTHONPATH=backend python -m unittest discover -s backend/tests -p test_mouth_geometry.py -v
npm run build --prefix frontend
node scripts/generate-beep-options.cjs
```

Sound preferences are local to the browser profile/site origin, not stored in the user account or synced across devices. Guardian stores the latest preference received from an allowed AURA tab; multiple AURA windows with different preferences can replace it.

The public static app uses its existing browser rule-based fallback. The repository includes the Python/FastAPI/LightGBM backend, but it must be deployed separately for actual server-side ML scoring.
