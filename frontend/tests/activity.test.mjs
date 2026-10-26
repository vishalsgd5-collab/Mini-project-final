import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputSampler, isTypingKey, PersonalPace, activityPayload, activityAdjustment } from '../src/lib/activity.js';
import { localApi } from '../src/lib/localEngine.js';

const sample = (at, keys = 5, distance = 250, mouseMs = 500) => ({ at, dt: 1000, keys, mouseDistance: distance, mouseMs });
function harness() {
  let now = 0, stats;
  const tracker = new PersonalPace(0);
  return { tracker, get now() { return now; }, get stats() { return stats; },
    run(seconds, keys = 5, distance = 250, mouseMs = 500, flags) {
      for (let i = 0; i < seconds; i++) {
        now += 1000; tracker.ingest(sample(now, keys, distance, mouseMs), now, flags); stats = tracker.read(now);
      }
      return stats;
    } };
}
test('typing records a physical keydown once; ignores repeats, modifiers, shortcuts and passwords', () => {
  assert.equal(isTypingKey({ key: 'a' }), true);
  for (const e of [{ key: 'Shift' }, { key: 'a', repeat: true }, { key: 'a', ctrlKey: true }, { key: 'a', metaKey: true }, { key: 'a', target: { type: 'password' } }]) assert.equal(isTypingKey(e), false);
  const s = new InputSampler(0); s.key({ key: 'a' });
  const row = s.sample(1000); assert.equal(row.keys, 1); assert.equal('text' in row, false);
  assert.equal(s.sample(2000).keys, 0);
});
test('mouse measures distance per moving time, independent of event count; stale jumps discarded', () => {
  const one = new InputSampler(0), many = new InputSampler(0);
  one.move({ clientX: 0, clientY: 0 }, 1); one.move({ clientX: 100, clientY: 0 }, 101);
  many.move({ clientX: 0, clientY: 0 }, 1);
  for (let i = 1; i <= 10; i++) many.move({ clientX: i * 10, clientY: 0 }, i * 10 + 1);
  const a = one.sample(1000), b = many.sample(1000);
  assert.equal(a.mouseDistance, b.mouseDistance); assert.equal(a.mouseMs, b.mouseMs);
  one.move({ clientX: 1000, clientY: 0 }, 5000);
  assert.equal(one.sample(6000), null);
  assert.equal(one.sample(7000).mouseDistance, 0);
});
test('first active minute learns independent frozen references; no warm-up contribution', () => {
  const h = harness(); let s = h.run(59);
  assert.equal(s.typing.baseline, null); assert.equal(s.behaviorScore, 0);
  s = h.run(1); assert.equal(s.typing.baseline, 5); assert.equal(s.mouse.baseline, 500);
  assert.equal(s.typing.current * 12, 60); assert.equal(s.behaviorScore, 0);
  h.run(100, 2, 100); assert.equal(h.stats.typing.baseline, 5); assert.equal(h.stats.mouse.baseline, 500);
});
test('fast start then sustained slower typing and mouse raises the personal contribution', () => {
  const h = harness(); h.run(60);
  const slow = h.run(90, 2, 100);
  assert.ok(Math.abs(slow.typing.drop - .6) < .001);
  assert.ok(Math.abs(slow.mouse.drop - .6) < .001);
  assert.ok(slow.behaviorScore > 70);
  assert.equal(activityAdjustment(activityPayload(slow)), 15);
});
test('a naturally slow typist is compared with themselves, not a population speed', () => {
  const h = harness(); h.run(60, 1, 0, 0);
  const s = h.run(120, 1, 0, 0);
  assert.equal(s.typing.baseline * 12, 12);
  assert.equal(s.behaviorScore, 0); assert.equal(s.mouse.baseline, null);
});
test('stable/faster work, short fluctuations and <=15% changes do not raise the score', () => {
  const h = harness(); h.run(60, 10);
  assert.equal(h.run(30, 9).behaviorScore, 0);
  assert.equal(h.run(5, 2, 100).behaviorScore, 0);
  assert.equal(h.run(90, 12, 300).behaviorScore, 0);
});
test('reading/no activity never calibrates and clears slowdown evidence after activity stops', () => {
  const h = harness(); h.run(120, 0, 0, 0);
  assert.equal(h.stats.typing.progress, 0); assert.equal(h.stats.mouse.progress, 0);
  h.run(60); h.run(90, 2, 100); assert.ok(h.stats.behaviorScore > 0);
  const idle = h.run(6, 0, 0, 0);
  assert.equal(idle.behaviorScore, 0); assert.equal(idle.behaviorReady, false);
  assert.equal(idle.typing.heldSeconds, 0);
});
test('keyboard-only and mouse-only preferences work independently', () => {
  const keyboard = harness(); keyboard.run(60, 5, 250, 500, { keyboard: true, mouse: false });
  const a = keyboard.run(90, 2, 100, 500, { keyboard: true, mouse: false });
  assert.equal(a.mouse.baseline, null); assert.ok(a.behaviorScore > 0); assert.equal(a.mouseSpeed, 0);
  const mouse = harness(); mouse.run(60, 5, 250, 500, { keyboard: false, mouse: true });
  const b = mouse.run(90, 2, 100, 500, { keyboard: false, mouse: true });
  assert.equal(b.typing.baseline, null); assert.equal(b.typingRpm, 0); assert.ok(b.behaviorScore > 0);
});
test('stale/duplicate/out-of-order/invalid external batches are ignored', () => {
  const t = new PersonalPace(0);
  assert.equal(t.ingest(sample(1000), 1000), true);
  assert.equal(t.ingest(sample(1000), 1001), false);
  assert.equal(t.ingest(sample(999), 1001), false);
  assert.equal(t.ingest(sample(2000), 9000), false);
  assert.equal(t.ingest(sample(12000), 9000), false);
  assert.equal(t.ingest({ ...sample(3000), keys: NaN }, 3000), false);
  assert.equal(t.ingest({ ...sample(3000), dt: 60000 }, 3000), false);
});
test('pause clears observation windows/hold without changing baseline; restart learns anew', () => {
  const h = harness(); h.run(60); h.run(90, 2, 100);
  h.tracker.suspend(h.now); let s = h.tracker.read(h.now);
  assert.equal(s.behaviorScore, 0); assert.equal(s.typingRpm, 0); assert.equal(s.typing.baseline, 5);
  h.tracker.reset(h.now); s = h.tracker.read(h.now);
  assert.equal(s.typing.baseline, null); assert.equal(s.mouse.baseline, null);
});
test('timer/tracking gaps do not silently satisfy a 30-second slowdown hold', () => {
  const h = harness(); h.run(60); h.run(30, 2, 100);
  const s = h.tracker.read(h.now + 6000);
  assert.equal(s.behaviorScore, 0);
});
test('adjustment is opt-in, bounded and rejects non-finite values', () => {
  assert.equal(activityAdjustment({ behavioral_score: 100, behavioral_ready: true }), 0);
  const f = { personal_activity: true, behavioral_ready: true };
  assert.equal(activityAdjustment({ ...f, behavioral_score: 500 }), 20);
  assert.equal(activityAdjustment({ ...f, behavioral_score: -10 }), 0);
  assert.equal(activityAdjustment({ ...f, behavioral_score: NaN }), 0);
});
test('public demo actually uses the baseline signal in final score and explanation, not just UI', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const f = { personal_activity: true, behavioral_ready: true, behavioral_score: 0, typing_rpm: 300, mouse_intensity: .7, idle_ratio: 0 };
  const predict = body => localApi('/api/fatigue/predict', { method: 'POST', body });
  const fresh = predict(f), slow = predict({ ...f, behavioral_score: 75, typing_rpm: 100, mouse_intensity: .2 });
  assert.ok(Math.abs(slow.fatigue_score - fresh.fatigue_score - 15) < .001);
  assert.equal(slow.activity_adjustment, 15);
  assert.ok(slow.drivers.some(d => d.key === 'personal_pace'));
  assert.equal(predict({ ...f, idle_ratio: 1, typing_rpm: 0 }).fatigue_score, fresh.fatigue_score);
  assert.equal(predict({ ...f, behavioral_ready: false, behavioral_score: 100 }).activity_adjustment, 0);
});
