---
name: app-screenshots
description: Capture screenshots of the running Mailspring dev app for docs, PRs, or visual verification — launching with a CDP port, driving the UI, anonymizing or seeding data, and clipping to an element. Use whenever a task needs a picture of the app.
---

# Screenshots of the running app

`screencapture` is blocked in this environment (no Screen Recording permission), and
the app has no test-id hooks. The reliable path is Chrome DevTools Protocol against a
dev build launched with a remote-debugging port. Everything below runs from the repo
root unless noted. Scripts live in `.claude/skills/app-screenshots/scripts/`.

## 1. Launch

```bash
pkill -f "electron ./app"; pkill -f "app/mailsync --mode sync"; sleep 2
(./node_modules/.bin/electron ./app --enable-logging --dev --remote-debugging-port=9333 > /tmp/app.log 2>&1 &)
sleep 18   # window + plugins + first sync
curl -s localhost:9333/json | grep -c webSocketDebuggerUrl   # >0 means ready
```

- Always kill orphaned `mailsync` processes too; they outlive the Electron process and
  hold the SQLite DB open (a later seed script will silently fail to commit).
- Code changes need a **full relaunch** — `location.reload()` serves the compile cache
  for TS/TSX. Edited LESS can be hot-loaded with `AppEnv.themes.reloadCoreStyles()`.
- For doc-sized captures, shrink the window first:
  `AppEnv.getCurrentWindow().setSize(1280, 800)`.

## 2. Drive the UI

`scripts/eval.mjs` evaluates JS in the main window (picks the target whose
`document.body.className` contains `window-type-default`) and optionally captures the
whole window or dispatches a real mouse click:

```bash
node --experimental-websocket scripts/eval.mjs "<js>" [out.png] [clickX clickY]
```

Useful snippets inside the JS:

- Navigate to a sheet: `$m.Actions.focusMailboxPerspective(new (require('../internal_packages/activity/lib/activity-mailbox-perspective').default)($m.FocusedPerspectiveStore.sidebarAccountIds()))`
- Pick from a `DropdownMenu`: click `.dropdown-menu > div`, wait 300ms, then find the
  item by text under `.menu div` and dispatch `mousedown` **and** `click` on it.
- Drive a controlled `<input>`: set the value through
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` and
  dispatch `input`; plain `.value =` doesn't reach React.
- Test real selection/hover behaviour with the click args (`Input.dispatchMouseEvent`),
  not synthetic `el.click()` — the two differ for caret placement and `:hover`.
- Wait after every action; the Reports tab has a 2s minimum "thinking" cover.

## 3. Capture an element

`scripts/shoot.mjs` runs setup JS, then captures one element by selector using
`Page.captureScreenshot` with a `clip` in CSS px:

```bash
node --experimental-websocket scripts/shoot.mjs "<setup-js>" "<selector>" out.png [pad] [maxHeight]
```

- `scale: 1` already yields device pixels (2x on retina). Don't pass `scale: 2` — that
  produces 4x images.
- Clip by element rect; don't crop afterwards with `sips -c`, which crops from the
  centre and pads with black. Use `maxHeight` to trim tall columns instead.
- Connecting a CDP session blurs the window (`body.is-blurred`, greyed traffic
  lights). The script strips the class before capturing.
- **Popovers close on blur.** Open the popover inside the same `setup-js` that the
  capture runs in, never in a previous invocation, and never call
  `activeElement.blur()` to remove the focus ring — inject a `<style>` with
  `outline: none !important` instead.

## 4. Make the data presentable

### Anonymize what's on screen

The dev mailbox contains real correspondents. Before any capture that leaves the
machine, rewrite the rendered DOM: `scripts/anonymize.example.js` walks every text
node and `title` attribute and applies a regex map. Copy it, edit the map for the
current mailbox, and pass its contents as the `setup-js` (after the view has loaded).

- React splits text into separate nodes, so match whole-node values (`/^ben$/`)
  rather than phrases (`/ben opened/`).
- Replace links with `example.com` paths and your own accounts with
  `you@gmail.com` / `you@yourcompany.com`; sidebar account headers are text nodes too.
- Re-run the anonymizer after any action that re-renders (tab switch, dropdown).

### Seed the database when there's nothing to show

`scripts/seed-tracking-metadata.py` writes fake open/click metadata onto real sent
messages. Pattern for any similar seeding:

1. Stop the app **and** mailsync; `cp edgehill.db edgehill.db.bak-<reason>`.
2. Write both places the UI reads from — the model's JSON blob (`Message.data`,
   `metadata` array) and the join table (`ModelPluginMetadata`) that queries filter on.
3. Keep timestamps relative to the message's own date so "N days after sending" and
   relative times look sane.
4. Tell the user where the backup is; the DB is ~1GB.

### Stage a specific layout

For illustrative shots (e.g. every kanban column populated) it's fine to move or
clone rendered nodes with DOM APIs in the setup JS — but React will throw on its next
re-render because its tree no longer matches. So: **take staged captures last**, one
per launch, and relaunch before doing anything interactive again. A blank/"loading"
view right after staging is that crash, not a product bug.

## 5. Review before shipping

Read every PNG back (the Read tool renders images). Things that slipped past
otherwise: focus rings, blurred title bars, un-anonymized names in a second text
node, a broken `<img>` from a guessed asset path (copy an existing icon's resolved
`src` and swap the filename), and letterboxed crops.
