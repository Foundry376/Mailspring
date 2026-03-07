# Accessibility Plan 03: Icon Button Accessible Names and Image Alt Text

## 1. Assessment of the `RetinaImg` Component

**File:** `app/src/components/retina-img.tsx`

**Current behavior (line 159):**
```tsx
<img alt={this.props.name} className={className} src={path} style={style} {...otherProps} />
```

`RetinaImg` defaults `alt` to `this.props.name` — the image filename string (e.g., `"toolbar-archive.png"`). A screen reader user hears *"toolbar-archive.png, image"* instead of *"Archive"*.

Because `{...otherProps}` is spread after `alt`, callers can already override `alt` by passing it explicitly. The TypeScript type for `RetinaImgProps` does not include `alt` in its named props, but it passes through via `React.HTMLProps<HTMLImageElement>`.

**Key insight:** The fix does not require changing the component's internal logic at all — `alt=""` can be passed by callers. However, changing the default from `this.props.name` to `""` eliminates the broken behavior everywhere in one change, with callers needing to opt-in only where the image genuinely conveys information.

---

## 2. Recommended Fix Strategy

**Track A — Change `RetinaImg`'s default `alt` to `""`**

Change line 159 of `app/src/components/retina-img.tsx`:
```tsx
// Before:
<img alt={this.props.name} className={className} src={path} style={style} {...otherProps} />

// After:
<img alt={''} className={className} src={path} style={style} {...otherProps} />
```

The `{...otherProps}` spread overrides `alt` when callers pass one explicitly, so any site that genuinely needs alt text just passes `alt="some text"` and continues to work. Callers relying on the broken filename default now get `alt=""` — a net improvement.

**Track B — Add `aria-label` to icon-only buttons; add `aria-hidden="true"` to images within them**

Every icon-only button needs `aria-label` on the `<button>` element. With Track A in place, images default to `alt=""`. As belt-and-suspenders best practice, also add `aria-hidden="true"` to `<RetinaImg>` inside buttons so the image is fully removed from the accessibility tree.

---

## 3. Complete Inventory of Icon-Only Buttons Needing `aria-label`

### `app/internal_packages/thread-list/lib/thread-toolbar-buttons.tsx`

| Component | Current `title` | `aria-label` value |
|---|---|---|
| `ArchiveButton` | `localized('Archive')` | `localized('Archive')` |
| `TrashButton` | `localized('Move to Trash')` | `localized('Move to Trash')` |
| `MarkAsSpamButton` (not-spam) | `localized('Not Spam')` | `localized('Not Spam')` |
| `MarkAsSpamButton` (spam) | `localized('Mark as Spam')` | `localized('Mark as Spam')` |
| `ToggleStarredButton` | dynamic `title` | same dynamic value |
| `ToggleUnreadButton` | `localized('Mark as %@', fragment)` | same value |
| `ThreadArrowButton` (down) | — | `localized('Next thread')` |
| `ThreadArrowButton` (up) | — | `localized('Previous thread')` |

Note: `ThreadArrowButton` renders a `<div onClick>` — needs `role="button"` too (see ARIA plan).

### `app/internal_packages/message-list/lib/find-in-thread.tsx`

Three buttons with **no `title` or `aria-label` at all** — worst-case scenario:

| Button | `aria-label` |
|---|---|
| Previous result | `localized('Previous result')` |
| Next result | `localized('Next result')` |
| Close | `localized('Close')` |

### `app/internal_packages/message-list/lib/message-controls.tsx`

- Ellipsis `<div onClick>`: needs `role="button"`, `tabIndex={0}`, `aria-label={localized('More message actions')}`

### `app/internal_packages/message-list/lib/message-item.tsx`

- Header detail toggle div: `aria-label={localized('Show message details')}` / `aria-label={localized('Hide message details')}`
- Sending spinner `<RetinaImg>`: decorative → `alt="" aria-hidden="true"`
- Draft pencil icon: decorative → `alt="" aria-hidden="true"`

### `app/internal_packages/message-list/lib/message-list.tsx`

- Footer reply `<RetinaImg>`: icon + text pattern → image is decorative, `alt="" aria-hidden="true"`

### `app/internal_packages/message-list/lib/subject-line-icons.tsx`

Three `<div onClick>` with `title` on the `RetinaImg` (not the wrapper — wrong):

| Control | `aria-label` on div |
|---|---|
| Expand/Collapse All | `localized('Expand All')` / `localized('Collapse All')` |
| Print Thread | `localized('Print Thread')` |
| Pop in/out | `localized('Pop thread in')` / `localized('Popout thread')` |

### `app/internal_packages/composer/lib/compose-button.tsx`

`aria-label={localized('Compose new message')}`

### `app/internal_packages/composer/lib/composer-view.tsx`

- `AttachFileButton`: `aria-label={localized('Attach File')}`
- `DeleteButton`: `aria-label={localized('Delete Draft')}`
- `DropToAttachCover` RetinaImg: decorative → `alt="" aria-hidden="true"`

### `app/internal_packages/composer/lib/composer-header-actions.tsx`

- Popout `<span>`: needs `role="button"`, `tabIndex={0}`, `aria-label={localized('Popout composer…')}`

### `app/internal_packages/composer/lib/send-action-button.tsx`

- Send icon: icon + text → `alt="" aria-hidden="true"`

### `app/internal_packages/draft-list/lib/draft-toolbar-buttons.tsx`

`aria-label={localized('Delete')}`

### `app/internal_packages/category-picker/lib/toolbar-category-picker.tsx`

- Move to Folder: `aria-label={localized('Move to Folder')}`
- Apply Label: `aria-label={localized('Apply Label')}`

### `app/internal_packages/contacts/lib/ContactDetailToolbar.tsx`

- Delete: `aria-label={localized('Delete')}`
- Export vCard: `aria-label={localized('Export vCard')}`

### `app/internal_packages/mode-switch/lib/mode-toggle.tsx`

Dynamic: `aria-label={hidden ? localized('Show Sidebar') : localized('Hide Sidebar')}`

### `app/internal_packages/main-calendar/lib/core/header-controls.tsx`

- Previous: `aria-label={localized('Previous')}`
- Next: `aria-label={localized('Next')}`

### `app/internal_packages/main-calendar/lib/quick-event-button.tsx`

`aria-label={localized('Create new event')}`

### `app/src/sheet-toolbar.tsx`

- `ToolbarMenuControl`: `aria-label={localized('Application menu')}`; RetinaImg → `alt=""`
- `ToolbarWindowControls` close: `aria-label={localized('Close window')}`
- `ToolbarWindowControls` minimize: `aria-label={localized('Minimize window')}`
- `ToolbarWindowControls` maximize: `aria-label={localized('Maximize window')}`

### `app/src/components/button-dropdown.tsx`

Secondary picker `<div>`: `role="button"`, `tabIndex={0}`, `aria-label={localized('More options')}`, `aria-haspopup="true"`, `aria-expanded={...}`. RetinaImg → `alt=""`.

### `app/src/components/metadata-composer-toggle-button.tsx`

Dynamic label matching `title`. Warning overlay RetinaImg: `aria-hidden="true"`.

### `app/internal_packages/composer-grammar-check/lib/grammar-check-toggle.tsx`

Same pattern. Warning overlay: `aria-hidden="true"`.

### `app/internal_packages/composer-templates/lib/template-picker.tsx`

`aria-label={localized('Quick Reply')}`; both inner RetinaImg → `alt=""`.

### `app/internal_packages/composer-signature/lib/signature-composer-dropdown.tsx`

Add `primaryTitle={localized('Choose signature')}` to `ButtonDropdown`.

### `app/internal_packages/activity/lib/list/activity-list-button.tsx`

`role="button"`, `tabIndex` fix, `aria-label` including unread count.

### `app/internal_packages/open-tracking/lib/open-tracking-icon.tsx`

`role="button"` on wrapper div, `tabIndex={0}`, `aria-label={title}`. RetinaImg → `alt=""`.

### `app/src/components/composer-editor/emoji-toolbar-popover.tsx`

Emoji category tabs (interactive `<RetinaImg>`): wrap each in `<button aria-label={localizedCategoryName}>`.

### `app/src/components/editable-list.tsx`

Edit icon `<RetinaImg>`: wrap in `<button aria-label={localized('Edit Item')}>`.

### `app/internal_packages/message-list/lib/message-item.tsx`

- Download All button (`.download-all-action`): `role="button"`, `tabIndex={0}`, `aria-label={localized('Download all attachments')}`

---

## 4. Cases Where `RetinaImg` Alt Text IS Meaningful

After the Track A change (default `alt=""`), these must **explicitly pass `alt`**:

| Location | Image | Required alt |
|---|---|---|
| `personal-level-indicators/lib/personal-level-icon.tsx` | PLI level icons | `localized('Personal message')` or `localized('You are in CC or BCC')` |
| `attachment-items.tsx` action icons | download/remove icons | Use `aria-label` on the parent interactive div; image → `alt=""` |

---

## 5. Patterns Requiring Special Handling

**Pattern: `title` on `RetinaImg` instead of on the interactive wrapper**

In `subject-line-icons.tsx` and `editable-list.tsx`, `title` is passed to `RetinaImg` making it `<img title="...">`. The tooltip appears but the accessible name is on the image, not the interactive element. Move `title` to the wrapper and replace with `aria-label`.

**Pattern: `ButtonDropdown` secondary picker**

Used in ~5 places (send action, message controls, signature picker, template picker). Fixing `button-dropdown.tsx` propagates to all call sites simultaneously.

---

## 6. ESLint Enforcement Strategy

**Step 1:** Check for `eslint-plugin-jsx-a11y`:
```bash
grep "jsx-a11y" /home/user/Mailspring/package.json
```

**Step 2:** Enable relevant `jsx-a11y` rules in `.eslintrc`:
```json
"jsx-a11y/interactive-supports-focus": "error",
"jsx-a11y/click-events-have-key-events": "error",
"jsx-a11y/alt-text": "error"
```

The `jsx-a11y/alt-text` rule catches `<img>` without `alt`. After Track A change, it will flag any new `<img>` rendered by `RetinaImg` without explicit `alt`.

**Step 3:** Custom ESLint rule for unlabeled icon buttons — warn when a `<button>` has no `aria-label`, no `aria-labelledby`, no visible text children, and a child that is `RetinaImg` or `<img>`.

---

## 7. Migration Approach — Phased Implementation

**Phase 1: Change `RetinaImg` default alt (1 file, 1 line)**

Immediately stops the "toolbar-archive.png, image" problem everywhere.

**Phase 2: Fix toolbar buttons (highest impact)**

Priority order:
1. `thread-toolbar-buttons.tsx` — used on every thread list page
2. `compose-button.tsx`, `composer-view.tsx`, `send-action-button.tsx`
3. `message-controls.tsx`, `find-in-thread.tsx`
4. `toolbar-category-picker.tsx`

Pattern for each:
```tsx
<button
  tabIndex={-1}
  className="btn btn-toolbar"
  title={localized('Archive')}
  aria-label={localized('Archive')}
  onClick={this._onArchive}
>
  <RetinaImg name="toolbar-archive.png" mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
</button>
```

**Phase 3: Fix `ButtonDropdown` (multiplier effect)**

Fixing `button-dropdown.tsx` benefits all consumers at once.

**Phase 4: Fix non-button interactive divs**

`subject-line-icons.tsx`, `message-controls.tsx` ellipsis, `attachment-items.tsx`, `activity-list-button.tsx`, `open-tracking-icon.tsx`.

**Phase 5: Standalone meaningful images**

`personal-level-indicators`, attachment icons.

**Phase 6: Add ESLint rules to prevent regression**

---

## 8. Complete aria-label Reference Table

| File | Component / Location | Image | `aria-label` value |
|---|---|---|---|
| `thread-toolbar-buttons.tsx` | `ArchiveButton` | `toolbar-archive.png` | `localized('Archive')` |
| `thread-toolbar-buttons.tsx` | `TrashButton` | `toolbar-trash.png` | `localized('Move to Trash')` |
| `thread-toolbar-buttons.tsx` | `MarkAsSpamButton` (not spam) | `toolbar-not-spam.png` | `localized('Not Spam')` |
| `thread-toolbar-buttons.tsx` | `MarkAsSpamButton` (spam) | `toolbar-spam.png` | `localized('Mark as Spam')` |
| `thread-toolbar-buttons.tsx` | `ToggleStarredButton` | `toolbar-star*.png` | `localized('Star')` / `localized('Unstar')` |
| `thread-toolbar-buttons.tsx` | `ToggleUnreadButton` | `toolbar-markas*.png` | `localized('Mark as %@', fragment)` |
| `thread-toolbar-buttons.tsx` | `ThreadArrowButton` (down) | `toolbar-down-arrow.png` | `localized('Next thread')` |
| `thread-toolbar-buttons.tsx` | `ThreadArrowButton` (up) | `toolbar-up-arrow.png` | `localized('Previous thread')` |
| `find-in-thread.tsx` | Previous result | `ic-findinthread-previous.png` | `localized('Previous result')` |
| `find-in-thread.tsx` | Next result | `ic-findinthread-next.png` | `localized('Next result')` |
| `find-in-thread.tsx` | Close | `ic-findinthread-close.png` | `localized('Close')` |
| `message-controls.tsx` | Ellipsis div | `message-actions-ellipsis.png` | `localized('More message actions')` |
| `compose-button.tsx` | `ComposeButton` | `toolbar-compose.png` | `localized('Compose new message')` |
| `composer-view.tsx` | `AttachFileButton` | attachment icon | `localized('Attach File')` |
| `composer-view.tsx` | `DeleteButton` | trash icon | `localized('Delete Draft')` |
| `composer-header-actions.tsx` | Popout span | `composer-popout.png` | `localized('Popout composer…')` |
| `draft-toolbar-buttons.tsx` | Delete | `icon-composer-trash.png` | `localized('Delete')` |
| `toolbar-category-picker.tsx` | Move picker | `toolbar-movetofolder.png` | `localized('Move to Folder')` |
| `toolbar-category-picker.tsx` | Label picker | `toolbar-tag.png` | `localized('Apply Label')` |
| `ContactDetailToolbar.tsx` | Delete | `toolbar-trash.png` | `localized('Delete')` |
| `ContactDetailToolbar.tsx` | Export vCard | `toolbar-export-contact.png` | `localized('Export vCard')` |
| `mode-toggle.tsx` | Sidebar toggle | `toolbar-person-sidebar.png` | dynamic Show/Hide |
| `header-controls.tsx` | Previous | calendar arrow | `localized('Previous')` |
| `header-controls.tsx` | Next | calendar arrow | `localized('Next')` |
| `quick-event-button.tsx` | New event | `toolbar-compose.png` | `localized('Create new event')` |
| `sheet-toolbar.tsx` | Menu | `windows-menu-icon.png` | `localized('Application menu')` |
| `sheet-toolbar.tsx` | Close | (CSS) | `localized('Close window')` |
| `sheet-toolbar.tsx` | Minimize | (CSS) | `localized('Minimize window')` |
| `sheet-toolbar.tsx` | Maximize | (CSS) | `localized('Maximize window')` |
| `button-dropdown.tsx` | Secondary picker | `icon-thread-disclosure.png` | `localized('More options')` |
| `metadata-composer-toggle-button.tsx` | Toggle | dynamic | dynamic |
| `grammar-check-toggle.tsx` | Grammar check | icon | dynamic |
| `template-picker.tsx` | Quick Reply | template icons | `localized('Quick Reply')` |
| `emoji-toolbar-popover.tsx` | Category tabs | emoji category icons | `LocalizedCategoryNames[category]` |
| `activity-list-button.tsx` | Activity | `icon-toolbar-activity.png` | `localized('View activity')` |
| `subject-line-icons.tsx` | Expand/Collapse | expand/collapse icons | `localized('Expand All')` / `localized('Collapse All')` |
| `subject-line-icons.tsx` | Print | `print.png` | `localized('Print Thread')` |
| `subject-line-icons.tsx` | Pop in/out | thread popout icons | `localized('Pop thread in')` / `localized('Popout thread')` |
| `message-item.tsx` | Detail toggle | disclosure triangle | `localized('Show/Hide message details')` |
| `attachment-items.tsx` | Remove | `remove-attachment.png` | `localized('Remove attachment')` |
| `attachment-items.tsx` | Save | `icon-attachment-download.png` | `localized('Save attachment')` |
| `attachment-items.tsx` | Quick Look | `attachment-quicklook.png` | `localized('Quick Look')` |

---

## Critical Files

- `app/src/components/retina-img.tsx` — Root cause; change default `alt` from `this.props.name` to `""`. Single highest-impact change touching all ~420 usages.
- `app/internal_packages/thread-list/lib/thread-toolbar-buttons.tsx` — Most-used toolbar; 6 icon-only buttons.
- `app/src/components/button-dropdown.tsx` — Shared component; fixing secondary-picker div propagates to 5+ call sites.
- `app/internal_packages/message-list/lib/find-in-thread.tsx` — Worst case: 3 buttons with zero labeling.
- `app/internal_packages/message-list/lib/subject-line-icons.tsx` — `title`-on-image antipattern that needs fixing across codebase.
