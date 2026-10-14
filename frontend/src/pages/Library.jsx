import { useEffect, useState } from "react";
import { api } from "../api";
import { Ritual } from "../components/Intervention";

export default function Library() {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    api("/api/interventions/catalog").then((d) => setItems(d.items));
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Rituals</h1>
          <p>Thirty to ninety seconds. Practise any of them on demand — the bandit still learns from live sessions.</p>
        </div>
      </div>
      <div className="lib">
        {items.map((it) => (
          <article className="card" key={it.id}>
            <div className="cat">{it.category} · {it.duration_sec}s</div>
            <h3>{it.title}</h3>
            <p>{it.cue}</p>
            <ol className="steps">
              {it.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <button className="btn btn-gold" onClick={() => setActive(it)}>Practise</button>
          </article>
        ))}
      </div>
      {active && (
        <Ritual item={active} onDone={() => setActive(null)} onSkip={() => setActive(null)} />
      )}
    </>
  );
}
