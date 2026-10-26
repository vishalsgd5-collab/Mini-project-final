import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YawnDetector } from '../src/lib/yawn.js';
import { FaceActionTracker } from '../src/lib/faceActions.js';
import { YawnTracker, mouthAspect } from '../src/lib/vision.js';

function samples(d, start, end, mar, jaw = 0.1, options) {
  let result;
  for (let t = start; t <= end; t += 100) result = d.push(mar, jaw, t, options);
  return result;
}
function cycle(d, start = 0, jaw = 0.75) {
  samples(d, start, start + 700, 0.1, jaw === undefined ? undefined : 0.1);
  samples(d, start + 800, start + 3200, 0.8, jaw);
  return samples(d, start + 3300, start + 3900, 0.1, jaw === undefined ? undefined : 0.1);
}

test('requires neutral baseline; opening the app with mouth open cannot count', () => {
  const d = new YawnDetector();
  samples(d, 0, 7000, 0.8, 0.8);
  samples(d, 7100, 7800, 0.1);
  assert.equal(d.count, 0);
});
test('short speaking-like openings do not count', () => {
  const d = new YawnDetector();
  samples(d, 0, 700, 0.1);
  for (let t = 800; t < 5000; t += 700) {
    samples(d, t, t + 200, 0.8, 0.8);
    samples(d, t + 300, t + 600, 0.1);
  }
  assert.equal(d.count, 0);
});
test('requires MAR and jaw agreement when both signals are available', () => {
  const marOnly = new YawnDetector(), jawOnly = new YawnDetector();
  cycle(marOnly, 0, 0.2);
  samples(jawOnly, 0, 700, 0.1);
  samples(jawOnly, 800, 3300, 0.2, 0.9);
  samples(jawOnly, 3400, 4000, 0.1);
  assert.equal(marOnly.count, 0);
  assert.equal(jawOnly.count, 0);
});
test('stable opening needs two seconds and counts only after 400ms closure', () => {
  const d = new YawnDetector();
  samples(d, 0, 700, 0.1);
  assert.equal(samples(d, 800, 2700, 0.8, 0.8).active, false);
  assert.equal(d.push(0.8, 0.8, 2800).active, true);
  assert.equal(d.count, 0);
  assert.equal(samples(d, 2900, 3200, 0.1).count, 0);
  assert.equal(d.push(0.1, 0.1, 3300).detected, true);
  assert.equal(d.count, 1);
});
test('rapid threshold crossings are labelled speech-like, not yawns', () => {
  const d = new YawnDetector();
  samples(d, 0, 700, 0.1);
  let flagged = false;
  for (let t = 800; t <= 4000; t += 100) {
    const open = Math.floor(t / 200) % 2 === 0;
    const result = d.push(open ? 0.8 : 0.45, open ? 0.8 : 0.4, t);
    flagged ||= result.status === 'speech-like';
  }
  assert.equal(flagged, true);
  assert.equal(d.count, 0);
});
test('unstable articulation above the thresholds is rejected by variation check', () => {
  const d = new YawnDetector();
  samples(d, 0, 700, 0.1);
  for (let t = 800; t <= 4000; t += 100) d.push(t % 200 ? 0.62 : 1.0, 0.8, t);
  samples(d, 4100, 4800, 0.1);
  assert.equal(d.count, 0);
});
test('holding the mouth open indefinitely is rejected and never repeats', () => {
  const d = new YawnDetector();
  samples(d, 0, 700, 0.1);
  samples(d, 800, 12000, 0.8, 0.8);
  samples(d, 12100, 12800, 0.1);
  assert.equal(d.count, 0);
});
test('speaking mode suppresses candidates without disabling subsequent monitoring', () => {
  const d = new YawnDetector();
  samples(d, 0, 700, 0.1);
  assert.equal(samples(d, 800, 4000, 0.8, 0.8, { speaking: true }).status, 'suppressed');
  assert.equal(d.count, 0);
  cycle(d, 4100);
  assert.equal(d.count, 1);
});
test('missing frames, explicit tracking loss and invalid geometry discard pending cycles', () => {
  for (const method of ['gap', 'reset', 'invalid']) {
    const d = new YawnDetector();
    samples(d, 0, 700, 0.1);
    samples(d, 800, 3000, 0.8, 0.8);
    if (method === 'reset') d.resetCandidate();
    if (method === 'invalid') d.push(NaN, 0.8, 3100);
    samples(d, method === 'gap' ? 5000 : 3200, 6000, 0.1);
    assert.equal(d.count, 0, method);
  }
});
test('six second cooldown and rolling history keep session counts distinct', () => {
  const d = new YawnDetector();
  cycle(d);
  assert.equal(d.count, 1);
  cycle(d, 4000); // begins before cooldown ends: do not start a new opening midway
  assert.equal(d.count, 1);
  cycle(d, 10000);
  assert.equal(d.count, 2);
  const result = d.push(0.1, 0.1, 700000);
  assert.equal(result.recentCount, 0);
  assert.equal(result.count, 2);
});
test('MAR-only fallback works only when expression data is genuinely missing', () => {
  const d = new YawnDetector();
  for (let t = 0; t <= 3900; t += 100) {
    d.push(t >= 800 && t <= 3200 ? 0.8 : 0.1, undefined, t);
  }
  assert.equal(d.count, 1);
});
test('mouth opening affects scoring only after a complete accepted cycle', () => {
  const d = new YawnDetector();
  samples(d, 0, 700, 0.1);
  assert.equal(samples(d, 800, 1800, 0.8, 0.8).scoringMar, 0.05);
  assert.equal(samples(d, 1900, 3200, 0.8, 0.8).scoringMar, 0.05);
  assert.equal(samples(d, 3300, 3900, 0.1).scoringMar, 0.8);
  assert.equal(d.push(0.8, 0.8, 4000, { speaking: true }).scoringMar, 0.05);
  assert.equal(d.push(0.1, 0.1, 10000).scoringMar, 0.05);
});
test('action log and model count update only after a completed candidate cycle', () => {
  const tracker = new FaceActionTracker();
  let result;
  for (let now = 0; now <= 3900; now += 100) {
    const open = now >= 800 && now <= 3200;
    result = tracker.push({ closed: false, blinked: false, mar: open ? 0.8 : 0.1, pitch: 0, yaw: 0, blends: { jawOpen: open ? 0.8 : 0.1 }, now });
  }
  assert.equal(result.counts.yawn, 1);
  assert.equal(result.yawn.recentCount, 1);
  assert.equal(result.events.filter(e => e.type === 'yawn').length, 1);
  assert.equal(result.events[0].label, 'Yawn candidate');
  assert.ok(Math.abs(result.events[0].t - Date.now()) < 1000);
});
test('compatibility adapter and landmark geometry remain usable', () => {
  const tracker = new YawnTracker();
  for (let t = 0; t <= 3900; t += 100) tracker.push(t >= 800 && t <= 3200 ? 0.8 : 0.1, t);
  assert.equal(tracker.count, 1);
  const points = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const values = { 61: [0, 0], 291: [1, 0], 81: [0.25, -0.4], 311: [0.75, -0.4], 178: [0.25, 0.4], 402: [0.75, 0.4] };
  for (const [i, [x, y]] of Object.entries(values)) points[i] = { x, y };
  assert.ok(mouthAspect(points) > 0.72);
});
test('a visually identical acted full cycle cannot be authenticated as fake', () => {
  const d = new YawnDetector();
  cycle(d);
  assert.equal(d.count, 1); // Document the unavoidable visual-only limitation, not a genuine-yawn guarantee.
});
