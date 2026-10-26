// Run with: node extension/tests/schedule.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const listeners = {}, alarms = new Map(), notices = [], data = {}, messages = [], tabs = [], tabMessages = [];
  const event = key => ({ addListener: fn => (listeners[key] ||= []).push(fn) });
  const chrome = {
    runtime: { onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message'), sendMessage: (msg, cb) => { messages.push(msg); cb?.(); }, lastError: null },
    alarms: { onAlarm: event('alarm'), create: async (key, opts) => alarms.set(key, opts), clear: async key => alarms.delete(key), getAll: async () => [...alarms.keys()].map(name => ({ name })) },
    storage: { local: { get: async () => structuredClone(data), set: async obj => Object.assign(data, structuredClone(obj)) } },
    notifications: { create: async (id, body) => notices.push({ id, ...body }) },
    offscreen: { hasDocument: async () => true },
    tabs: { query: (_, cb) => cb(tabs), sendMessage: (id, msg, cb) => { tabMessages.push({ id, msg }); cb?.(); } },
  };
  const context = vm.createContext({ chrome, console, URL, Date });
  context.importScripts = path => vm.runInContext(fs.readFileSync(`extension/${path}`, 'utf8'), context);
  vm.runInContext(fs.readFileSync('extension/background.js', 'utf8'), context);
  const sync = (items, url = 'https://raw.githack.com/vishalsgd5-collab/Mini-project-final/test/docs/index.html') => new Promise(resolve => {
    listeners.message[0]({ type: 'AURA_SCHEDULE_SYNC', items }, { url }, resolve);
  });
  const send = (msg, url = 'https://raw.githack.com/vishalsgd5-collab/Mini-project-final/test/docs/index.html', sender = {}) => new Promise(resolve => {
    const keepAlive = listeners.message[0](msg, { url, ...sender }, resolve);
    if (!keepAlive) resolve({ ok: false });
  });
  return { sync, send, context, alarms, notices, data, messages, tabs, tabMessages };
}
const item = offset => ({ id: 'task-1', title: 'Drink water', note: 'One glass', when: new Date(Date.now() + offset).toISOString() });
test('future reminder is persisted, not delivered early, and cancelled when completed', async () => {
  const h = setup(), it = item(600000);
  assert.equal((await h.sync([it])).ok, true);
  assert.equal(h.alarms.get('ember:task-1').when, Date.parse(it.when));
  assert.equal(h.notices.length, 0);
  await h.sync([{ ...it, done: true }]);
  assert.equal(h.alarms.has('ember:task-1'), false);
});
test('overdue task delivers title/note once; stale tab sync does not repeat it', async () => {
  const h = setup(), it = item(-60000);
  await h.sync([it]);
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].message, 'Drink water — One glass');
  await h.sync([it]);
  assert.equal(h.notices.length, 1);
});
test('persisted due reminder delivers without a tab; repeated alarms do not duplicate', async () => {
  const h = setup();
  h.data.emberItems = [item(-60000)];
  await vm.runInContext('enqueueSchedule(restoreSchedule)', h.context);
  await vm.runInContext('enqueueSchedule(restoreSchedule)', h.context);
  assert.equal(h.notices.length, 1);
});
test('deletion cancels alarm and changing date rearms previously delivered task', async () => {
  const h = setup();
  await h.sync([item(-60000)]);
  await h.sync([item(600000)]);
  assert.equal(h.alarms.has('ember:task-1'), true);
  await h.sync([]);
  assert.equal(h.alarms.has('ember:task-1'), false);
});
test('untrusted website cannot overwrite reminders', async () => {
  const h = setup();
  assert.equal((await h.sync([item(600000)], 'https://example.com')).ok, false);
  assert.equal(h.data.emberItems, undefined);
});

test('selected sound and volume persist and are used for scheduled reminders without app tab', async () => {
  const h = setup();
  assert.equal((await h.send({ type: 'AURA_AUDIO_SETTINGS', settings: { soundId: 'radar-ping', volume: .65, enabled: true } })).ok, true);
  await h.sync([item(-60000)]);
  const plays = h.messages.filter(msg => msg.type === 'AURA_AUDIO_PLAY');
  assert.equal(plays.length, 1);
  assert.equal(plays[0].kind, 'docket');
  assert.equal(plays[0].settings.soundId, 'radar-ping');
  assert.equal(plays[0].settings.volume, .65);
  assert.equal(h.data.auraAudioSettings.soundId, 'radar-ping');
});
test('F8-style mute suppresses scheduled sound but not its desktop notification or away alarm', async () => {
  const h = setup();
  await h.send({ type: 'AURA_AUDIO_SETTINGS', settings: { soundId: 'glass-chime', volume: .5, enabled: false } });
  await h.sync([item(-60000)]);
  assert.equal(h.notices.length, 1);
  assert.equal(h.messages.filter(msg => msg.type === 'AURA_AUDIO_PLAY').length, 0);
  await h.send({ type: 'AURA_BEEP', kind: 'away', loop: true });
  await vm.runInContext('audioQueue', h.context);
  assert.equal(h.messages.find(msg => msg.type === 'AURA_AUDIO_PLAY').kind, 'away');
  await h.send({ type: 'AURA_STOP_BEEP' });
  await vm.runInContext('audioQueue', h.context);
  assert.equal(h.messages.at(-1).type, 'AURA_AUDIO_STOP');
});
test('untrusted site cannot replace sound or trigger beeps; malformed preferences recover safely', async () => {
  const h = setup();
  assert.equal((await h.send({ type: 'AURA_AUDIO_SETTINGS', settings: { soundId: 'radar-ping' } }, 'https://example.com')).ok, false);
  assert.equal((await h.send({ type: 'AURA_BEEP' }, 'https://example.com')).ok, false);
  assert.equal(h.data.auraAudioSettings, undefined);
  await h.send({ type: 'AURA_AUDIO_SETTINGS', settings: null });
  assert.equal(h.data.auraAudioSettings.soundId, 'bright-triple');
  assert.equal(h.data.auraAudioSettings.volume, 1);
});

test('Guardian activity preferences are trusted-site only; defaults do not enable capture', async () => {
  const h = setup();
  const initial = await h.send({ type: 'AURA_ACTIVITY_GET_PREFS' });
  assert.equal(initial.prefs.enabled, undefined);
  assert.equal((await h.send({ type: 'AURA_ACTIVITY_PREFS', enabled: true }, 'https://example.com')).ok, false);
  assert.equal((await h.send({ type: 'AURA_ACTIVITY_PREFS', enabled: true, keyboard: true, mouse: false })).ok, true);
  assert.equal(h.data.auraActivityPrefs.keyboard, true);
  assert.equal(h.data.auraActivityPrefs.mouse, false);
  assert.ok(h.data.auraActivityPrefs.expiresAt > Date.now());
});
test('numeric cross-tab samples go only to AURA, respect disabled inputs, and discard extra content', async () => {
  const h = setup();
  h.tabs.push({ id: 1, url: 'https://raw.githack.com/vishalsgd5-collab/Mini-project-final/test/docs/index.html' }, { id: 2, url: 'https://example.com' });
  await h.send({ type: 'AURA_ACTIVITY_PREFS', enabled: true, keyboard: false, mouse: true });
  h.tabMessages.length = 0;
  const sample = { at: Date.now(), dt: 1000, keys: 4, mouseDistance: 200, mouseMs: 400, text: 'must not be forwarded' };
  const reply = await h.send({ type: 'AURA_ACTIVITY_SAMPLE', sample }, 'https://example.com', { tab: { id: 2, active: true } });
  assert.equal(reply.ok, true);
  assert.equal(h.tabMessages.length, 1); assert.equal(h.tabMessages[0].id, 1);
  assert.equal(h.tabMessages[0].msg.sample.keys, 0);
  assert.equal(h.tabMessages[0].msg.sample.mouseDistance, 200);
  assert.equal('text' in h.tabMessages[0].msg.sample, false);
});
test('stale/invalid/background-tab samples and expired/paused capture cannot influence pace', async () => {
  const h = setup();
  await h.send({ type: 'AURA_ACTIVITY_PREFS', enabled: true, keyboard: true, mouse: true });
  const sample = { at: Date.now(), dt: 1000, keys: 4, mouseDistance: 200, mouseMs: 400 };
  const send = (row, active = true) => h.send({ type: 'AURA_ACTIVITY_SAMPLE', sample: row }, 'https://example.com', { tab: { id: 2, active } });
  assert.equal((await send(sample, false)).ok, false);
  assert.equal((await send({ ...sample, at: Date.now() - 10000 })).ok, false);
  assert.equal((await send({ ...sample, keys: NaN })).ok, false);
  h.data.auraActivityPrefs.expiresAt = Date.now() - 1;
  assert.equal((await send(sample)).ok, false);
  await h.send({ type: 'AURA_ACTIVITY_PREFS', enabled: false });
  assert.equal((await send(sample)).ok, false);
});
