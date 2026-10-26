import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { faceUsable, trackingFresh, ownedTask, loadFaceEngine, visionAssetRoot } from '../src/lib/faceEngine.js';

const page = 'https://raw.githack.com/vishalsgd5-collab/Mini-project-final/test/docs/index.html#/app/monitor';
test('same-site asset paths work below a commit/subdirectory, never at site root or on a model CDN', () => {
  assert.equal(visionAssetRoot('./', page), 'https://raw.githack.com/vishalsgd5-collab/Mini-project-final/test/docs/vision/');
});
test('starting/error/stopped/stale tracking is not absence evidence, even with a streaming webcam', () => {
  for (const state of ['starting', 'error', 'stopped', 'stale']) {
    assert.equal(trackingFresh({ trackingState: state, lastProcessedAt: 1000 }, 2000), false);
  }
  assert.equal(trackingFresh({ trackingState: 'healthy', lastProcessedAt: null }, 2000), false);
  assert.equal(trackingFresh({ trackingState: 'healthy', lastProcessedAt: 3000 }, 2000), false);
  assert.equal(trackingFresh({ trackingState: 'healthy', lastProcessedAt: 1000 }, 6001), false);
});
test('healthy fresh no-face frames can run the away timer, but cannot produce a face fatigue estimate', () => {
  const empty = { trackingState: 'healthy', lastProcessedAt: 1000, present: false };
  assert.equal(trackingFresh(empty, 2000), true); assert.equal(faceUsable(empty, 2000), false);
  assert.equal(faceUsable({ ...empty, present: true }, 2000), true);
  assert.equal(faceUsable({ ...empty, present: true }, 6001), false);
});
test('late model initialization is closed after cancellation and cannot overwrite a newer retry', async () => {
  const controller = new AbortController();
  let finish, disposed = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const promise = ownedTask(pending, { signal: controller.signal, dispose: value => value.close() });
  controller.abort(); await assert.rejects(promise, /cancelled/);
  finish({ close: () => disposed++ });
  await Promise.resolve(); assert.equal(disposed, 1);
});
test('timed-out startup disposes a model if it finishes later', async () => {
  let finish, disposed = 0;
  const promise = ownedTask(new Promise(resolve => { finish = resolve; }), { timeoutMs: 5, dispose: () => disposed++ });
  await assert.rejects(promise, /timed out/);
  finish({}); await Promise.resolve(); assert.equal(disposed, 1);
});
test('model/WASM startup uses bundled bytes and the CPU delegate', async () => {
  const calls = {};
  const result = { close() {} };
  const engine = await loadFaceEngine({ page, fetcher: async url => {
    calls.model = url; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1000001) };
  }, importVision: async () => ({
    FilesetResolver: { forVisionTasks: async url => { calls.wasm = url; return {}; } },
    FaceLandmarker: { createFromOptions: async (_, options) => { calls.options = options; return result; } },
  }) });
  assert.equal(engine, result);
  assert.equal(calls.options.baseOptions.delegate, 'CPU');
  assert.equal(calls.options.baseOptions.modelAssetBuffer.length, 1000001);
  assert.ok(calls.model.startsWith(visionAssetRoot('./', page)));
  assert.equal(calls.wasm.endsWith('/'), false, 'avoid double slashes on static/CDN hosting');
  assert.equal(calls.options.runningMode, 'VIDEO');
});
test('HTTP or incomplete model errors are explicit rather than a fake successful camera-only state', async () => {
  const importVision = async () => ({});
  await assert.rejects(loadFaceEngine({ page, importVision, fetcher: async () => ({ ok: false, status: 404 }) }), /download failed \(404\)/);
  await assert.rejects(loadFaceEngine({ page, importVision, fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(132) }) }), /missing or incomplete/);
});
test('packaged model is the full checksum-verified task, not a Git LFS pointer; both WASM variants shipped', () => {
  const root = new URL('../public/vision/', import.meta.url);
  const bytes = readFileSync(new URL('face_landmarker.task', root));
  assert.equal(bytes.length, 3758596);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff');
  for (const name of ['vision_wasm_internal', 'vision_wasm_nosimd_internal']) {
    const wasm = readFileSync(new URL(`${name}.wasm`, root));
    assert.equal(wasm.subarray(0, 4).toString('hex'), '0061736d');
    assert.ok(readFileSync(new URL(`${name}.js`, root)).length > 100000);
  }
});
test('Monitor uses real pipeline health for alarms and predictions and exposes tracker errors with camera on', () => {
  const monitor = readFileSync(new URL('../src/pages/Monitor.jsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/hooks/useFaceMesh.js', import.meta.url), 'utf8');
  assert.match(monitor, /const liveCam = statusRef.current === "live" && trackingFresh\(liveRef.current\)/);
  assert.match(monitor, /!faceUsable\(snapshot\)/);
  assert.match(monitor, /Retry face detection/);
  assert.match(monitor, /\{camOn && \(/);
  assert.match(monitor, /available=\{scoreReady\}/);
  assert.doesNotMatch(hook, /setStatus\(hasCam \? "live"/);
  assert.doesNotMatch(hook, /requestAnimationFrame/);
  assert.match(hook, /void recover\(error\)/);
});
