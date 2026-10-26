import { useEffect, useId, useState } from "react";
import { BEEP_SOUNDS, getAudioSettings, previewBeep, setBeepSound, setVolume, stopBeepPreview } from "../lib/sound";

export default function SoundPicker({ compact = false }) {
  const id = useId();
  const [settings, setSettings] = useState(getAudioSettings);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () => setSettings(getAudioSettings());
    const blocked = () => setMessage("Chrome blocked playback. Allow site sound, then click Preview again.");
    window.addEventListener("aura-audio-settings", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("aura-audio-blocked", blocked);
    return () => {
      window.removeEventListener("aura-audio-settings", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("aura-audio-blocked", blocked);
      stopBeepPreview();
    };
  }, []);
  const selected = BEEP_SOUNDS.find(sound => sound.id === settings.soundId);
  function choose(soundId) {
    stopBeepPreview();
    setBeepSound(soundId);
    setMessage("Saved automatically for this browser. Guardian uses this choice after its updated extension is loaded.");
  }
  return (
    <details className="card sound-picker" open={compact ? undefined : true}>
      <summary>Beep sound · {selected.name} <span className="muted">({BEEP_SOUNDS.length} choices)</span></summary>
      <div className="sound-picker-body">
        <p className="muted">Choose your own alert sound. Your selection is saved for fatigue alerts, ritual chimes and scheduled reminders. The away alarm keeps its distinct tone.</p>
        <div className="sound-picker-controls">
          <label className="field" htmlFor={`${id}-sound`}>
            <span>Selected beep</span>
            <select id={`${id}-sound`} value={settings.soundId} onChange={e => choose(e.target.value)}>
              {BEEP_SOUNDS.map(sound => <option key={sound.id} value={sound.id}>{sound.name}</option>)}
            </select>
          </label>
          <label className="field" htmlFor={`${id}-volume`}>
            <span>Beep volume · {Math.round(settings.volume * 100)}%</span>
            <input id={`${id}-volume`} type="range" min="15" max="100" step="5" value={Math.round(settings.volume * 100)} onChange={e => setVolume(Number(e.target.value) / 100)} />
          </label>
        </div>
        <p className="muted">Start at a low Windows/headphone volume. Preview is intentional playback and works even when fatigue alerts are muted.</p>
        <div className="sound-choice-grid">
          {BEEP_SOUNDS.map((sound, index) => (
            <div className={`sound-choice ${settings.soundId === sound.id ? "selected" : ""}`} key={sound.id}>
              <strong>{index + 1}. {sound.name}</strong>
              <p className="muted">{sound.detail}</p>
              <div className="sound-choice-actions">
                <button type="button" className="btn btn-ghost" aria-label={`Preview ${sound.name}`} onClick={() => setMessage(previewBeep(sound.id) ? `Preview: ${sound.name}. Click Use sound to save it.` : "Could not start audio. Allow sound in Chrome site settings.")}>▶ Preview</button>
                <button type="button" className={settings.soundId === sound.id ? "btn btn-gold" : "btn btn-ghost"} aria-pressed={settings.soundId === sound.id} onClick={() => choose(sound.id)}>{settings.soundId === sound.id ? "✓ Selected" : "Use sound"}</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => { stopBeepPreview(); setMessage("Preview stopped."); }}>Stop preview</button>
        <p role="status" aria-live="polite">{message}</p>
      </div>
    </details>
  );
}
