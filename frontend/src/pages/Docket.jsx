import { useEffect, useMemo, useState } from "react";
import { connectSchedule, dueSoon, loadDocket, newItem, saveDocket, scheduleManaged } from "../lib/docket";
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
  const [message, setMessage] = useState("");
  const [guardian, setGuardian] = useState(false);
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    const refresh = () => { setItems(loadDocket()); setGuardian(scheduleManaged()); };
    window.addEventListener("aura-docket", refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => { window.removeEventListener("aura-docket", refresh); window.removeEventListener("storage", refresh); };
  }, []);

  function commit(next) {
    setItems(next);
    saveDocket(next);
  }

  function add(e) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    if (!draft.when || !Number.isFinite(new Date(draft.when).getTime()) || new Date(draft.when).getTime() <= Date.now()) {
      setMessage("Choose a future date and time for your reminder."); return;
    }
    setMessage("Reminder saved. Date and time use your computer’s local timezone.");
    unlockAudio();
    playRitualChime();
    commit([newItem({ ...draft, title, notified: false }), ...loadDocket().filter(it => it.id !== draft.id)]);
    setDraft(newItem({ tag: draft.tag }));
  }

  function toggle(id) {
    commit(loadDocket().map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  }

  function remove(id) {
    commit(loadDocket().filter((it) => it.id !== id));
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
            Schedule a task by date and time. Windows reminders can appear over other apps while Chrome is running.
          </p>
        </div>
        <span className="chip">{openCount} open</span>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <strong>{guardian ? "Guardian connected · background scheduling active" : "Browser reminders · keep AURA open"}</strong>
        <p className="muted">Install/reload AURA Guardian and refresh this page to receive reminders even after closing the AURA tab. Keep Chrome running. Enable Windows Settings → System → Notifications → Chrome, and turn off Do Not Disturb. Windows chooses the toast screen; this cannot force a popup onto every monitor or secure/full-screen application.</p>
        <button className="btn btn-gold" type="button" onClick={async () => {
          unlockAudio();
          const allowed = await enableAlerts();
          playRitualChime();
          const shown = allowed && await pushWindows("Ember Docket · reminder test", "Scheduled reminders appear here while you work in other apps.", "ember-test");
          setMessage(shown ? "Test sent — check Windows notifications." : "Allow notifications in Chrome site settings, then test again.");
        }}>Enable / test Windows reminders</button>
        {message && <p role="status">{message}</p>}
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
              <label htmlFor="ember-when">Reminder date &amp; time (local)</label>
              <input
                id="ember-when"
                type="datetime-local"
                required
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
            Save scheduled reminder
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
                  <p className="muted">{it.done ? "Completed" : it.notified ? "Reminder delivered" : "Scheduled"}</p>
                  <button type="button" className="btn btn-ghost" onClick={() => setDraft({ ...it, notified: false })}>Edit / reschedule</button>
                  {!it.done && <button type="button" className="btn btn-ghost" onClick={() => commit(loadDocket().map(row => row.id === it.id ? { ...row, when: new Date(Date.now() + 5 * 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), notified: false } : row))}>Remind in 5 min</button>}
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
  const [reminder, setReminder] = useState(null);
  useEffect(() => {
    const disconnect = connectSchedule();
    const tick = () => {
      if (scheduleManaged()) return;
      const items = loadDocket();
      const now = Date.now();
      let changed = false;
      const next = items.map((it) => {
        if (!dueSoon(it, now)) return it;
        changed = true;
        setReminder(it);
        unlockAudio();
        playRitualChime();

        pushWindows("Ember Docket · due now", `${it.title}${it.note ? " — " + it.note : ""}`, `ember-${it.id}`);
        return { ...it, notified: true };
      });
      if (changed) saveDocket(next);
    };
    const id = window.setInterval(tick, 1000);
    const catchUp = () => tick();
    window.addEventListener("focus", catchUp);
    return () => { disconnect(); window.clearInterval(id); window.removeEventListener("focus", catchUp); };
  }, []);
  return { reminder, dismissReminder: () => setReminder(null) };
}
