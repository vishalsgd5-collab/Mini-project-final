import { useEffect, useMemo, useState } from "react";
import { tellBeep } from "../lib/bridge";
import { loadDocket, newItem, saveDocket } from "../lib/docket";
import { enableAlerts, pushWindows } from "../lib/notify";
import { playRitualChime, unlockAudio } from "../lib/sound";

const TAGS = [
  { id: "focus", label: "Focus block" },
  { id: "care", label: "Care / rest" },
  { id: "errand", label: "Errand" },
  { id: "ritual", label: "Ritual" },
];

function fmt(when) {
  if (!when) return "unscheduled";
  const d = new Date(when);
  if (!Number.isFinite(d.getTime())) return "unscheduled";
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Docket() {
  const [items, setItems] = useState(() => loadDocket());
  const [draft, setDraft] = useState(() => newItem());
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    enableAlerts();
  }, []);

  function commit(next) {
    setItems(next);
    saveDocket(next);
  }

  function add(e) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    unlockAudio();
    playRitualChime();
    commit([newItem({ ...draft, title }), ...items]);
    setDraft(newItem({ tag: draft.tag }));
  }

  function toggle(id) {
    commit(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  }

  function remove(id) {
    commit(items.filter((it) => it.id !== id));
  }

  const shown = useMemo(() => {
    const now = Date.now();
    const list = items.filter((it) => {
      if (filter === "open") return !it.done;
      if (filter === "done") return it.done;
      if (filter === "today") {
        if (!it.when) return !it.done;
        const a = new Date(it.when);
        const b = new Date();
        return a.toDateString() === b.toDateString();
      }
      return true;
    });
    return list.sort((a, b) => {
      const ta = a.when ? new Date(a.when).getTime() : now + 8.64e7;
      const tb = b.when ? new Date(b.when).getTime() : now + 8.64e7;
      return ta - tb;
    });
  }, [items, filter]);

  const openCount = items.filter((it) => !it.done).length;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="kicker" style={{ marginBottom: 6 }}>care schedule</div>
          <h1>Ember Docket</h1>
          <p>
            A private slate for the hours you still owe yourself. Due items ping with the same AURA beep and a Windows
            toast — even if you are in another tab.
          </p>
        </div>
        <span className="chip">{openCount} open</span>
      </div>

      <div className="docket">
        <form className="card docket-form" onSubmit={add}>
          <div className="cat">new ember</div>
          <h3>Pin a promise</h3>
          <div className="field">
            <label htmlFor="ember-title">Title</label>
            <input
              id="ember-title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="e.g. 20-minute deep work, then blink reset"
            />
          </div>
          <div className="docket-row">
            <div className="field">
              <label htmlFor="ember-when">When</label>
              <input
                id="ember-when"
                type="datetime-local"
                value={draft.when}
                onChange={(e) => setDraft((d) => ({ ...d, when: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="ember-tag">Kind</label>
              <select
                id="ember-tag"
                value={draft.tag}
                onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))}
              >
                {TAGS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ember-note">Note</label>
            <input
              id="ember-note"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Optional cue — what done looks like"
            />
          </div>
          <button className="btn btn-gold" type="submit" style={{ marginTop: 16 }}>
            Add to Ember Docket
          </button>
        </form>

        <div>
          <div className="docket-filters">
            {[
              ["open", "Open"],
              ["today", "Today"],
              ["done", "Done"],
              ["all", "All"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? "btn btn-gold" : "btn btn-ghost"}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="docket-list">
            {shown.length === 0 && (
              <div className="card">
                <strong>Nothing on this slate.</strong>
                <p className="muted">Pin a focus block or a rest you will actually take.</p>
              </div>
            )}
            {shown.map((it) => (
              <article className={`card docket-item ${it.done ? "is-done" : ""}`} key={it.id}>
                <button
                  type="button"
                  className={`docket-check ${it.done ? "on" : ""}`}
                  onClick={() => toggle(it.id)}
                  aria-label={it.done ? "Mark open" : "Mark done"}
                />
                <div>
                  <div className="cat">
                    {TAGS.find((t) => t.id === it.tag)?.label || it.tag} · {fmt(it.when)}
                  </div>
                  <h3>{it.title}</h3>
                  {it.note && <p className="muted">{it.note}</p>}
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => remove(it.id)}>
                  Drop
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function useEmberReminders() {
  useEffect(() => {
    const id = window.setInterval(() => {
      const items = loadDocket();
      const now = Date.now();
      let changed = false;
      const next = items.map((it) => {
        if (it.done || it.notified || !it.when) return it;
        const t = new Date(it.when).getTime();
        if (!Number.isFinite(t) || t > now + 8000) return it;
        changed = true;
        unlockAudio();
        playRitualChime();
        tellBeep("docket", false);
        pushWindows("Ember Docket · due now", it.title, `ember-${it.id}`);
        return { ...it, notified: true };
      });
      if (changed) saveDocket(next);
    }, 8000);
    return () => window.clearInterval(id);
  }, []);
}
