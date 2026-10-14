import { useEffect, useState } from "react";

export function Offer({ item, onStart, onDismiss }) {
  if (!item) return null;
  return (
    <aside className="offer">
      <div className="cat">{item.category} · {item.duration_sec}s</div>
      <h3>{item.title}</h3>
      <p>{item.reason}</p>
      <div className="overlay-actions">
        <button className="btn btn-gold" onClick={onStart}>Begin</button>
        <button className="btn btn-ghost" onClick={onDismiss}>Not now</button>
      </div>
    </aside>
  );
}

export function Ritual({ item, onDone, onSkip }) {
  const [left, setLeft] = useState(item.duration_sec);
  useEffect(() => {
    setLeft(item.duration_sec);
    const id = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          onDone();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [item]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const breath = item.id === "box_breathing";
  const phase = breath ? ["inhale", "hold", "exhale", "hold"][Math.floor(((item.duration_sec - left) % 16) / 4)] : item.cue;

  return (
    <div className="overlay">
      <div className="ritual">
        <div className="cat">{item.category}</div>
        <h2>{item.title}</h2>
        <p className="cue">{phase}</p>
        {breath && <div className="breath"><span className="timer">{phase}</span></div>}
        {!breath && <div className="timer">{mm}:{ss}</div>}
        <ol className="steps">
          {item.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="overlay-actions">
          <button className="btn btn-gold" onClick={onDone}>I finished</button>
          <button className="btn btn-ghost" onClick={onSkip}>Skip</button>
        </div>
      </div>
    </div>
  );
}
