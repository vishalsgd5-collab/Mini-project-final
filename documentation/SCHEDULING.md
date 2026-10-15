# Ember Docket — Windows date/time reminders

1. Open AURA → Ember Docket (schedule icon).
2. Click **Enable / test Windows reminders**, allow Chrome notifications, and check the Windows toast.
3. Enter a title, future local date/time, kind, and optional note. Save the reminder.
4. Use **Edit / reschedule**, **Remind in 5 min**, the completion checkbox, or **Drop** as needed.

## Background delivery (recommended)

Download this repository, open `chrome://extensions`, enable Developer mode, and **Load unpacked** the `extension/` folder. For an existing installation, replace the extension files, click Reload, and refresh AURA. Visit Ember Docket; its status should read **Guardian connected · background scheduling active**.

The extension persists tasks in Chrome storage and uses Chrome alarms, rather than an open-page timer. Date/time tasks continue after the AURA tab closes while Chrome is running. Reminders missed while Chrome/Windows was closed are delivered when Chrome next starts. Completing, deleting, or changing a task in AURA updates its extension alarm. Reopen AURA after changing the schedule to ensure synchronization if Guardian was disconnected.

Without Guardian, reminders use a browser timer and an in-app popup. Keep AURA open. Background tab throttling/sleep can delay these reminders. The extension can also display the task overlay on supported web pages; Chrome internal pages and other restricted pages do not allow content overlays.

Windows Settings → System → Notifications: enable notifications for Chrome; turn off Do Not Disturb/Focus Assist for banners. Windows controls the toast monitor, placement, and duration. A web app cannot force popups onto every physical monitor, the lock screen, secure dialogs, or every exclusive full-screen application. Chrome must be running for extension alarms; this is not a native Windows service.

Schedules are local to this browser/profile, not synced through the backend. Extension storage is separate from website storage. Only trusted AURA host origins may synchronize schedules. Synthetic model scoring is unrelated to date/time reminders.

## Checks

- `node extension/tests/schedule.test.cjs`: persistence, due-time delivery, deduplication, cancellation, rescheduling, and origin rejection using mocked Chrome APIs.
- `npm run build --prefix frontend`: production frontend build.
- Actual Windows banner delivery requires testing in Chrome on Windows with notifications allowed.
