// Run with: node extension/tests/schedule.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const listeners = {}, alarms = new Map(), notices = [], data = {};
  const event = key => ({ addListener: fn => (listeners[key] ||= []).push(fn) });
  const chrome = {
    runtime: { onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message'), sendMessage: (_, cb) => cb?.(), lastError: null },
    alarms: { onAlarm: event('alarm'), create: async (key, opts) => alarms.set(key, opts), clear: async key => alarms.delete(key), getAll: async () => [...alarms.keys()].map(name => ({ name })) },
    storage: { local: { get: async () => structuredClone(data), set: async obj => Object.assign(data, structuredClone(obj)) } },
    notifications: { create: async (id, body) => notices.push({ id, ...body }) },
    offscreen: { hasDocument: async () => true },
    tabs: { query: (_, cb) => cb([]) },
  };
  const context = vm.createContext({ chrome, console, URL, Date });
  vm.runInContext(fs.readFileSync('extension/background.js', 'utf8'), context);
  const sync = (items, url = 'https://raw.githack.com/vishalsgd5-collab/Mini-project-final/test/docs/index.html') => new Promise(resolve => {
    listeners.message[0]({ type: 'AURA_SCHEDULE_SYNC', items }, { url }, resolve);
  });
  return { sync, context, alarms, notices, data };
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
