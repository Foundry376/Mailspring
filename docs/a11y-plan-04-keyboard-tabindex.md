# Accessibility Plan 04: Keyboard Tab Order and `tabIndex` Usage

**Scope:** All TypeScript/TSX files in `app/src/` and `app/internal_packages/`
**Goal:** Fix `tabIndex` usage to comply with WAI-ARIA best practices without breaking the existing keyboard shortcut system.

---

## 1. Background: Existing Keyboard Systems

### `KeyCommandsRegion` (Command Dispatch)

`app/src/components/key-commands-region.tsx` registers handlers for named commands (e.g., `core:archive-item`). Commands fire as DOM CustomEvents on `document.body` via `globalHandlers` regardless of which element has focus. **Local handlers** require focus to be inside the `KeyCommandsRegion`'s DOM node.

### `TabGroupRegion` (Custom Tab Cycling)

`app/src/components/tab-group-region.tsx` **intercepts the Tab key entirely**, preventing native Tab behavior. It cycles focus among `input`, `textarea`, `[contenteditable]`, and `[tabIndex]` descendants. Elements with `tabIndex={-1}` (not `contenteditable`) are **skipped** in this cycle. Used in the Composer.

### The Core Tension

`tabIndex={-1}` on toolbar buttons was a deliberate design choice to prevent Tab from reaching toolbar buttons inside `TabGroupRegion`. However, **when `TabGroupRegion` is not wrapping a region**, `tabIndex={-1}` makes controls unreachable by standard Tab navigation — a keyboard accessibility failure.

---

## 2. ESLint Configuration Findings

**File:** `/home/user/Mailspring/.eslintrc`

Disabled rules:
```json
"jsx-a11y/tabindex-no-positive": 0,
"jsx-a11y/label-has-for": 0,
```

Per-file disables (redundant since the rule is globally off):
- `app/src/components/editable-list.tsx` line 1: `/* eslint jsx-a11y/tabindex-no-positive: 0 */`
- `app/src/components/outline-view-item.tsx` line 2: `/* eslint jsx-a11y/tabindex-no-positive:0 */`

---

## 3. Complete `tabIndex` Inventory and Categorization

### Category A: Toolbar Buttons with `tabIndex={-1}` — ACCESSIBILITY BUG

Interactive elements keyboard users cannot reach via Tab:

| File | Element | Context |
|------|---------|---------|
| `app/src/sheet-toolbar.tsx` lines 153-155 | `<button>` close/minimize/maximize | Window controls |
| `app/src/sheet-toolbar.tsx` line 181 | `<button>` hamburger menu | Windows/Linux menu |
| `thread-list/thread-toolbar-buttons.tsx` lines 48, 90, 236, 257, 297, 346 | `<button>` Archive, Trash, Spam, Star, Unread | Thread list toolbar |
| `category-picker/toolbar-category-picker.tsx` lines 87, 97 | `<button>` Move, Label | Thread list toolbar |
| `contacts/ContactDetailToolbar.tsx` lines 107, 116, 124, 132 | `<button>` Delete, Export, Remove, Edit | Contact toolbar |
| `contacts/ContactDetail.tsx` lines 139, 143 | `<button>` Cancel, Save | Contact edit footer |
| `contacts/AddContactToolbar.tsx` line 45 | `<button>` | Add contact toolbar |
| `composer/composer-view.tsx` lines 493, 520, 532 | `<button>` Send, Attach, Delete | Composer action bar |
| `composer-templates/template-picker.tsx` line 128 | `<button>` | Composer toolbar |
| `composer-grammar-check/grammar-check-toggle.tsx` line 98 | `<button>` | Composer toolbar |
| `send-later/send-later-button.tsx` lines 142, 174 | `<button>` | Composer toolbar |
| `send-reminders/send-reminders-composer-button.tsx` lines 79, 97 | `<button>` | Composer toolbar |
| `thread-snooze/snooze-buttons.tsx` line 58 | `<button>` | Thread toolbar |
| `translation/composer-button.tsx` line 99 | `<button>` | Composer toolbar |
| `message-list/find-in-thread.tsx` lines 132, 145 | `<button>` Prev/Next | Find-in-thread panel |
| `app/src/components/metadata-composer-toggle-button.tsx` line 163 | `<button>` | Composer plugin toggle |

**Category A2: `<div>` interactive elements with `tabIndex={-1}` — BUG**

| File | Notes |
|------|-------|
| `translation/lib/message-header.tsx` lines 304, 356 | `<div class="action" onClick>` — should be `<button>` |
| `activity/list/activity-list-button.tsx` line 53 | `<div onClick>` — should be `<button>` |

---

### Category B: Container `<div>` Elements with `tabIndex={-1}` — CORRECT

These are non-interactive containers allowing programmatic `.focus()` calls:

| File | Element | Justification |
|------|---------|---------------|
| `app/src/components/menu.tsx` line 333 | `<div class="menu">` | Handles arrow-key navigation; correct for menu/listbox |
| Various popover root divs | `<div>` | Focus trap for `onBlur` detection |
| `button-dropdown.tsx` lines 60, 84 | `<div ref="button">` | onBlur blur-out detection |
| Composer `KeyCommandsRegion` line 444 | Container div | Outer wrap; programmatic only |
| `list-tabular.tsx` ScrollRegion line 433 | Scroll container | Thread list scroll; programmatic only |

---

### Category C: Positive `tabIndex` Values — ACCESSIBILITY BUG

Positive values jump elements to front of Tab order globally, disrupting reading order:

| File | Line | Element | Value | Fix |
|------|------|---------|-------|-----|
| `app/src/components/editable-list.tsx` | 476 | `<KeyCommandsRegion>` | `tabIndex={1}` | → `tabIndex={0}` |
| `app/src/components/outline-view-item.tsx` | 333 | `<input>` (edit mode) | `tabIndex={1}` | → `tabIndex={0}` |
| `category-picker/label-picker-popover.tsx` | 250 | `<input class="search">` | `tabIndex={1}` | → `autoFocus` |
| `category-picker/move-picker-popover.tsx` | 257 | `<input class="search">` | `tabIndex={1}` | → `autoFocus` |
| `composer-templates/template-picker.tsx` | 72 | `<input class="search">` | `tabIndex={1}` | → `autoFocus` |
| `preferences/preferences-root.tsx` | 78 | `<KeyCommandsRegion>` | `tabIndex={1}` | → `tabIndex={0}` |
| `thread-sharing/thread-sharing-popover.tsx` | 114 | `<div>` popover | `tabIndex={1}` | → `tabIndex={-1}` (container) |
| `theme-picker/theme-picker.tsx` | 90 | `<div class="theme-picker">` | `tabIndex={1}` | → `tabIndex={0}` |
| `app/src/components/date-input.tsx` | 99 | `<input>` | `tabIndex={1}` | → `tabIndex={0}` |

**Important:** `auto-focuses.tsx` and `modal.tsx` currently use `tabIndex > 0` as a priority signal to find the most important element to auto-focus. Replacing positive `tabIndex` with `autoFocus` in popover inputs (label-picker, move-picker, template-picker) preserves this behavior without the global Tab order disruption.

**Fix for `preferences-root.tsx` `_focusContent`:** After changing `tabIndex={1}` to `tabIndex={0}`, update the selector in `_focusContent` from `'[tabindex]'` to `'input, select, textarea, [tabindex="0"], button'`.

---

### Category D: Correct `tabIndex={0}` Usage — CORRECT

Already correct; no changes needed: onboarding form inputs, calendar event elements, `attachment-items.tsx` focusable prop, `editable-table.tsx`.

---

## 4. Recommended Fix Per Category

### Fix A: Toolbar Buttons — Implement WAI-ARIA Toolbar Pattern

Per WAI-ARIA 1.2:
1. Wrap toolbar in `<div role="toolbar" aria-label="...">` (single Tab stop)
2. Within the toolbar, buttons use `tabIndex={-1}` and arrow keys cycle focus (roving tabindex)
3. Only one button holds `tabIndex={0}` at a time

This gives keyboard users **one Tab stop per toolbar** with arrow-key navigation within it. Used by Gmail, Outlook Web, and most major email clients.

#### Fix A1: Sheet Toolbar (Window Controls)

`ToolbarWindowControls` — add `role="toolbar" aria-label="Window controls"` wrapper. First button gets `tabIndex={0}`, others `tabIndex={-1}`, with ArrowLeft/Right cycling.

`ToolbarMenuControl` hamburger — independently gets `tabIndex={0}`.

#### Fix A2: Thread-List Toolbar Buttons

Wrap each logical button group (created by `CreateButtonGroup`) in `role="toolbar"`:
```tsx
<div role="toolbar" aria-label={groupLabel}>
  {/* children with roving tabindex */}
</div>
```

Implement a `RovingTabIndexToolbar` helper component (see Section 5).

#### Fix A3: Composer Action Bar Buttons

**Phase 1 (Quick):** Change action bar buttons from `tabIndex={-1}` to `tabIndex={0}`. `TabGroupRegion` will include them in its Tab cycle. Unblocks keyboard access.

**Phase 2 (Correct):** Wrap `.composer-action-bar-content` in `role="toolbar"` with roving tabindex. `TabGroupRegion` lands on the toolbar as a single Tab stop; arrows navigate within.

#### Fix A4: Contacts Toolbar and Edit Footer

Contact toolbar buttons → `tabIndex={0}` with `role="toolbar"`. Cancel/Save buttons → `tabIndex={0}` (form controls, not toolbar items).

#### Fix A5: Find-In-Thread

Previous/Next `<button tabIndex={-1}>` → remove `tabIndex={-1}` (three buttons in a panel, straightforward).

#### Fix A6: Interactive `<div>` Elements

`translation/lib/message-header.tsx` `<div class="action">` → `<button tabIndex={0}>`.

### Fix C: Positive `tabIndex` Values

| # | Fix |
|---|-----|
| C1 `editable-list.tsx` | `tabIndex={1}` → `tabIndex={0}` |
| C2 `outline-view-item.tsx` | `tabIndex={1}` → `tabIndex={0}`, remove per-file eslint-disable |
| C3 Popover search inputs | `tabIndex={1}` → `autoFocus` attribute; update `auto-focuses.tsx` to use `autoFocus` signal |
| C4 `preferences-root.tsx` | `tabIndex={1}` → `tabIndex={0}`, fix `_focusContent` selector |
| C5 `thread-sharing-popover.tsx` | `tabIndex={1}` → `tabIndex={-1}` (container for onBlur tracking) |
| C6 `theme-picker.tsx` | `tabIndex={1}` → `tabIndex={0}` |
| C7 `date-input.tsx` | `tabIndex={1}` → `tabIndex={0}` (or omit; inputs default to tab-reachable) |

---

## 5. `RovingTabIndexToolbar` Component

Create `app/src/components/roving-tab-index-toolbar.tsx`:

**Props:**
- `label: string` — value for `aria-label`
- `children: ReactNode`
- `orientation?: 'horizontal' | 'vertical'` — defaults to `'horizontal'`

**Behavior:**
- On mount: `tabIndex={0}` on first non-disabled focusable child; all others get `tabIndex={-1}`
- ArrowRight/Down: focus next enabled button, update tabIndex
- ArrowLeft/Up: focus previous enabled button, update tabIndex
- Home: focus first enabled button
- End: focus last enabled button
- Tab: NOT intercepted (Tab exits toolbar — correct WAI-ARIA behavior)
- On re-entry via Tab: focus last-focused child (or first if none previously focused)

**Important:** Does NOT interfere with `KeyCommandsRegion` — global handlers fire on `document.body` regardless of focus. The roving tabindex changes which button is the Tab stop; `BindGlobalCommands` continues to work.

**Interaction with `TabGroupRegion`:** After implementing this, the toolbar container (`tabIndex={0}`) becomes ONE Tab stop in `TabGroupRegion`'s cycle. Pressing Tab while in the composer lands on the toolbar; arrow keys navigate within it; Tab exits. This is the correct behavior.

The existing `TabGroupRegion.shiftFocus` filter at line 53: `if (node.tabIndex === -1 && !node.isContentEditable) continue;` — elements with `tabIndex={0}` are NOT skipped. Compatible.

### F6 Panel Navigation (Future Enhancement)

Register `F6` / `Shift+F6` to cycle focus between main regions: sidebar → toolbar → thread list → message list → composer. Add to `keymaps/base.cson` as `core:focus-next-panel` / `core:focus-prev-panel`.

---

## 6. Re-enabling the ESLint Rule

### Step 1: Fix all positive `tabIndex` values (Category C)
### Step 2: Remove per-file `eslint-disable` comments from `editable-list.tsx` and `outline-view-item.tsx`
### Step 3: Enable in `.eslintrc`:
```json
// Change:
"jsx-a11y/tabindex-no-positive": 0,
// To:
"jsx-a11y/tabindex-no-positive": "error",
```

### Step 4: Add additional rules (start as `"warn"` for incremental fixing):
```json
"jsx-a11y/interactive-supports-focus": "warn",
"jsx-a11y/click-events-have-key-events": "warn",
"jsx-a11y/no-noninteractive-element-interactions": "warn"
```

---

## 7. Interaction with `KeyCommandsRegion`: Detailed Analysis

**Global commands:** Fire on `document.body` via CustomEvent bubbling. Work regardless of which element has focus. Changing `tabIndex` values does NOT break global command dispatch.

**Local commands:** Registered on the `KeyCommandsRegion`'s own DOM node. Fire when event bubbles through that node. `EditableList` uses local handlers — after changing `tabIndex={1}` to `tabIndex={0}`, it still receives focus when clicked/tabbed, and local handlers continue to work.

**`BindGlobalCommands`:** Registers on `document.body`. After changing buttons to `tabIndex={0}`, keyboard shortcuts still fire anywhere in the window.

---

## 8. Recommended Tab Order for Overall App Layout

```
[1] Account Sidebar
    - Each folder/label item (tabIndex=0 on DropZone)
    - Arrow keys navigate within list (existing KeyCommandsRegion)
    - "+ New Item" button

[2] Sheet Toolbar (per active column)
    - Single Tab stop with role="toolbar"
    - ArrowLeft/Right navigate between buttons

[3] Thread List
    - ListTabular ScrollRegion (tabIndex=-1 → tabIndex=0)
    - Arrow keys select threads (existing KeyCommandsRegion)

[4] Message List / Thread View
    - Subject area (read-only, tabIndex=0)
    - Each message (tabIndex=0 on expand/collapse)
    - Message toolbar (role="toolbar")
    - Inline reply composer (if present)

[5] Composer (if open)
    - To field
    - Cc/Bcc (if visible)
    - Subject
    - Composer toolbar (role="toolbar")
    - Body (contenteditable)
    - Action bar (role="toolbar")
```

---

## 9. Implementation Sequence

**Phase 1: Fix Positive `tabIndex` Values (Low Risk)**

1. `editable-list.tsx`: `tabIndex={1}` → `tabIndex={0}`
2. `outline-view-item.tsx`: `tabIndex={1}` → `tabIndex={0}`, remove per-file disable
3. `label-picker-popover.tsx`, `move-picker-popover.tsx`, `template-picker.tsx`: Replace `tabIndex={1}` with `autoFocus`; update `auto-focuses.tsx`
4. `preferences-root.tsx`: `tabIndex={1}` → `tabIndex={0}`, fix `_focusContent`
5. `thread-sharing-popover.tsx`: `tabIndex={1}` → `tabIndex={-1}`
6. `theme-picker.tsx`, `date-input.tsx`: `tabIndex={1}` → `tabIndex={0}`
7. Enable `jsx-a11y/tabindex-no-positive` as `"error"`, remove per-file disables

**Phase 2: Fix `<div>` Interactive Elements**

8. `translation/lib/message-header.tsx`: `<div onClick>` → `<button tabIndex={0}>`

**Phase 3: Fix Non-Toolbar Buttons**

9. `contacts/ContactDetail.tsx`: Remove `tabIndex={-1}` from Cancel/Save
10. `message-list/find-in-thread.tsx`: Remove `tabIndex={-1}` from prev/next
11. `contacts/AddContactToolbar.tsx`: Remove `tabIndex={-1}`

**Phase 4: Implement `RovingTabIndexToolbar`**

12. Create `app/src/components/roving-tab-index-toolbar.tsx`
13. Write unit tests
14. Apply to `CreateButtonGroup` in `mailspring-component-kit`
15. Apply to `ContactDetailToolbar`
16. Apply to `ToolbarWindowControls` and `ToolbarMenuControl`

**Phase 5: Composer Action Bar (Higher Risk)**

17. Apply `RovingTabIndexToolbar` to composer action bar
18. Verify `TabGroupRegion.shiftFocus` handles new toolbar container
19. Test full Tab cycle: To → Subject → Body → Toolbar → (wrap)
20. Test all composer keyboard shortcuts continue working

**Phase 6: App-Level Tab Order**

21. Thread list `ScrollRegion`: `tabIndex={-1}` → `tabIndex={0}`
22. Add F6 panel navigation command

---

## 10. Testing Checklist

- [ ] Tab from any point reaches every toolbar button (via roving tabindex)
- [ ] Arrow keys navigate within each toolbar
- [ ] Tab exits toolbars and continues to next region
- [ ] All existing shortcuts (e, r, !, #, etc.) continue to work
- [ ] Composer Tab cycle: To → Cc → Subject → Body → Action bar → (wrap)
- [ ] Shift+Tab reverses cycle correctly
- [ ] Enter/Space on toolbar buttons activates them
- [ ] Inline editing (rename folder) works correctly
- [ ] `npm run lint` passes with `jsx-a11y/tabindex-no-positive` as error

---

## Critical Files

- `app/src/components/tab-group-region.tsx` — Core Tab interceptor in Composer; changes must be compatible with `shiftFocus` method
- `app/src/components/key-commands-region.tsx` — Confirms global handlers fire on `document.body` regardless of focus
- `app/src/components/decorators/auto-focuses.tsx` — Contains positive-`tabIndex`-priority logic that must be updated when removing positive values
- `app/internal_packages/thread-list/lib/thread-toolbar-buttons.tsx` — Primary source of toolbar `tabIndex={-1}` bugs; fix pattern here becomes template for all other toolbar files
- `app/.eslintrc` — `jsx-a11y/tabindex-no-positive` must be re-enabled after all positive values are fixed
