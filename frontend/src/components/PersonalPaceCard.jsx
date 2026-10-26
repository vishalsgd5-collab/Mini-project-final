export default function PersonalPaceCard({ activity, keyboard, mouse, running, adjustment }) {
  const render = (label, enabled, c, typing) => {
    const format = v => `${Math.round(typing ? v * 12 : v)} ${typing ? "WPM" : "px/s"}`;
    return <div className="sound-choice">
      <strong>{label}</strong>
      {!enabled ? <p>Disabled in Studio settings. Not measured or used for this comparison.</p> : <>
        <p>{c.baseline === null ? `Learning your starting pace: ${Math.round(c.progress * 60)} / 60 active seconds` : `Starting pace: ${format(c.baseline)} · Current active pace: ${format(c.current)}`}</p>
        <progress max="1" value={c.progress} aria-label={`${label} baseline calibration`} style={{ width: "100%", accentColor: "var(--gold)" }} />
        <p className="muted">{c.baseline === null ? "Work naturally; pauses do not count toward calibration." : !c.active ? "Waiting for enough recent activity. No slowdown evidence while idle." : c.drop > .15 ? `${Math.round(c.drop * 100)}% slower · sustained ${c.heldSeconds}s (30s needed)` : "Within your starting range, or faster. No slowdown contribution."}</p>
      </>}
    </div>;
  };
  return <details className="card sound-picker" open>
    <summary>Your personal work pace · {running ? "learning & comparing" : "paused"}</summary>
    <div className="sound-picker-body">
      <p className="muted">AURA learns your first 60 active seconds for each input separately, then compares with your own starting pace—not another person’s speed. Use the same kind of task for a meaningful comparison.</p>
      <div className="sound-choice-grid">
        {render("Typing pace", keyboard, activity.typing, true)}
        {render("Mouse movement speed", mouse, activity.mouse, false)}
      </div>
      <p role="status">Personal slowdown contribution in the last prediction: <strong>+{adjustment.toFixed(1)} / 20 points</strong>. It is combined with eye, blink, posture and other signals—not a diagnosis.</p>
      <p className="muted">A slowdown greater than 15% must persist for 30 seconds with enough activity before it contributes. Reading, an unused mouse, and task changes are not proof of fatigue. Typing WPM is estimated as five keypresses per word; active typing pace excludes completely idle seconds. Mouse speed is CSS pixels per moving second, not event frequency.</p>
      <button type="button" className="btn btn-ghost" onClick={activity.resetBaseline}>Restart pace baseline</button>
      <p className="muted" style={{ marginTop: 12 }}>Optional: type naturally below or move your pointer to calibrate here. The text is not saved or transmitted. For other websites, reload Guardian 1.5.0 and keep this monitor open. Native desktop-app keyboard/mouse activity is not accessible to this browser extension.</p>
      {keyboard && <textarea aria-label="Optional typing calibration area" placeholder="Type normally here to learn your personal starting pace…" autoComplete="off" spellCheck={false} disabled={!running} rows={3} style={{ width: "100%", marginTop: 10, padding: 12, background: "var(--ink-2)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10 }} />}
    </div>
  </details>;
}
