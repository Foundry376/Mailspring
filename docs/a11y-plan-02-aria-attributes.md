# Accessibility Plan 02: ARIA Attributes for Interactive Widgets

## Status: Zero ARIA Usage

A search across the entire `app/` directory for `aria-` and `role=` in `.tsx` files returns zero matches. This is a greenfield accessibility implementation.

## How `localized()` Works

Import path: `import { localized } from 'mailspring-exports';`

Implemented in `/home/user/Mailspring/app/src/intl.ts`. Supports simple strings and printf-style substitution: `localized('Mark as %@', fragment)`. All ARIA label strings facing users **must** be wrapped in `localized()` so they translate correctly. Standard ARIA role identifiers (`"listbox"`, `"option"`, etc.) are HTML-standard and do **not** need localization.

## Architecture Observations

1. `RetinaImg` renders `<img alt={this.props.name}>` (filename default). Override with `alt=""` when parent has `aria-label`.
2. `ThreadArrowButton` — `<div onClick>` not `<button>`. Needs `role="button"`, `tabIndex={0}`, `aria-disabled`.
3. `DisclosureTriangle` — `<div onClick>`. Needs `role="button"`, `aria-expanded`, `aria-label`.
4. `Switch` — `<div onClick>`. Needs `role="switch"`, `aria-checked`, `aria-label`.
5. `OutlineView` collapse button — `<span onClick>`. Needs `role="button"` or convert to `<button>`.
6. `ListTabularItem` rows — `<SwipeContainer>` wrapping a `<div>`. Outer needs `role="presentation"`, inner needs `role="option"` + `aria-selected`.
7. `ButtonDropdown` secondary picker — `<div tabIndex={-1}>` with no semantics. Needs `aria-haspopup`, `aria-expanded`, `aria-label`.
8. `AccountSwitcher` — `<div onMouseDown>`. No label, no role.
9. `PreferencesTabItem` — `<div onClick>`. Needs `role="tab"` + `aria-selected`.

---

## Priority 1 — Critical: Named Interactive Controls

### 1.1 Thread List Toolbar Buttons

**File:** `app/internal_packages/thread-list/lib/thread-toolbar-buttons.tsx`

| Component | Element | Attribute | Value | Type |
|-----------|---------|-----------|-------|------|
| `ArchiveButton` | `<button>` | `aria-label` | `localized('Archive')` | Static |
| `TrashButton` | `<button>` | `aria-label` | `localized('Move to Trash')` | Static |
| `MarkAsSpamButton` (spam) | `<button>` | `aria-label` | `localized('Mark as Spam')` | Static |
| `MarkAsSpamButton` (not-spam) | `<button>` | `aria-label` | `localized('Not Spam')` | Static |
| `ToggleStarredButton` | `<button>` | `aria-label` | dynamic `title` (Star/Unstar) | Dynamic |
| `ToggleStarredButton` | `<button>` | `aria-pressed` | `!postClickStarredState` | Dynamic |
| `ToggleUnreadButton` | `<button>` | `aria-label` | `localized('Mark as %@', fragment)` | Dynamic |
| `ToggleUnreadButton` | `<button>` | `aria-pressed` | `!targetUnread` | Dynamic |
| `ThreadArrowButton` (Down) | `<div onClick>` | `role` | `"button"` | Static |
| `ThreadArrowButton` (Down) | `<div onClick>` | `aria-label` | `localized('Next thread')` | Static |
| `ThreadArrowButton` (Down) | `<div onClick>` | `aria-disabled` | `this.state.disabled` | Dynamic |
| `ThreadArrowButton` (Down) | `<div onClick>` | `tabIndex` | `disabled ? -1 : 0` | Dynamic |
| `ThreadArrowButton` (Up) | `<div onClick>` | same pattern | `localized('Previous thread')` | Static |

All `<RetinaImg>` inside these buttons: add `alt=""` to prevent double-announcement.

### 1.2 Window Control Buttons

**File:** `app/src/sheet-toolbar.tsx`

| Element | Attribute | Value | Type |
|---------|-----------|-------|------|
| `.close` `<button>` | `aria-label` | `localized('Close window')` | Static |
| `.minimize` `<button>` | `aria-label` | `localized('Minimize window')` | Static |
| `.maximize` `<button>` | `aria-label` | `localized('Maximize window')` (or full screen variant) | Dynamic |
| `ToolbarMenuControl` `<button>` | `aria-label` | `localized('Application menu')` | Static |
| `ToolbarMenuControl` `<RetinaImg>` | `alt` | `""` | Static |
| `ToolbarBack` `.item-back` div | `role` | `"button"` | Static |
| `ToolbarBack` `.item-back` div | `tabIndex` | `0` | Static |
| `ToolbarBack` `.item-back` div | `aria-label` | `localized('Return to %@', title)` | Dynamic |

### 1.3 Composer Action Bar Buttons

**File:** `app/internal_packages/composer/lib/composer-view.tsx`

| Component | Element | Attribute | Value | Type |
|-----------|---------|-----------|-------|------|
| `AttachFileButton` | `<button>` | `aria-label` | `localized('Attach File')` | Static |
| `DeleteButton` | `<button>` | `aria-label` | `localized('Delete Draft')` | Static |
| Both | `<RetinaImg>` | `alt` | `""` | Static |

### 1.4 Message Controls (Reply/Forward Dropdown)

**File:** `app/internal_packages/message-list/lib/message-controls.tsx`

| Element | Attribute | Value | Type |
|---------|-----------|-------|------|
| `ButtonDropdown` `.primary-item` | `aria-label` | `items[0].name` | Dynamic |
| `ButtonDropdown` `.secondary-picker` | `aria-label` | `localized('More reply options')` | Static |
| `ButtonDropdown` `.secondary-picker` | `aria-haspopup` | `"listbox"` | Static |
| `ButtonDropdown` `.secondary-picker` | `aria-expanded` | `this.state.open !== false` | Dynamic |
| `.message-actions-ellipsis` div | `role` | `"button"` | Static |
| `.message-actions-ellipsis` div | `tabIndex` | `0` | Static |
| `.message-actions-ellipsis` div | `aria-label` | `localized('More message actions')` | Static |
| `.message-actions-ellipsis` `<RetinaImg>` | `alt` | `""` | Static |

---

## Priority 2 — High: Selection State and Navigation

### 2.1 Thread List Items

**Files:** `app/src/components/list-tabular-item.tsx`, `app/src/components/multiselect-list.tsx`

Changes to `MultiselectList`:

| Location | Element | Attribute | Value |
|----------|---------|-----------|-------|
| `render()` container | div | `role` | `"listbox"` |
| `render()` container | div | `aria-multiselectable` | `"true"` |
| `render()` container | div | `aria-label` | `localized('Thread list')` |
| `_getItemPropsProvider()` props | — | `role` | `"option"` |
| `_getItemPropsProvider()` props | — | `aria-selected` | `selected` (boolean) |

### 2.2 Thread List Star Toggle

**File:** `app/internal_packages/thread-list/lib/thread-list-icon.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| `.thread-icon` div | `role` | `"button"` |
| `.thread-icon` div | `tabIndex` | `-1` (within list row) |
| `.thread-icon` div | `aria-label` | `starred ? localized('Unstar') : localized('Star')` |
| `.thread-icon` div | `aria-pressed` | `thread.starred` |

### 2.3 Thread List Quick Actions (Hover)

**File:** `app/internal_packages/thread-list/lib/thread-list-quick-actions.tsx`

| Component | Element | Attribute | Value |
|-----------|---------|-----------|-------|
| `ThreadArchiveQuickAction` | `.action-archive` div | `role` | `"button"` |
| `ThreadArchiveQuickAction` | `.action-archive` div | `aria-label` | `localized('Archive')` |
| `ThreadTrashQuickAction` | `.action-trash` div | `role` | `"button"` |
| `ThreadTrashQuickAction` | `.action-trash` div | `aria-label` | `localized('Trash')` |

### 2.4 Sidebar Folder Tree

**File:** `app/src/components/outline-view.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| `<section class="outline-view">` | `aria-label` | `this.props.title` |
| Collapse `<span>` in heading | `role` | `"button"` |
| Collapse `<span>` | `aria-expanded` | `!collapsed` |
| Collapse `<span>` | `aria-label` | `collapsed ? localized('Expand %@', title) : localized('Collapse %@', title)` |
| Add-item `<span>` | `role` | `"button"` |
| Add-item `<span>` | `aria-label` | `localized('Add item to %@', title)` |
| Items list container | — | `role` | `"list"` |

**File:** `app/src/components/outline-view-item.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| Root `<div>` | `role` | `"treeitem"` |
| `.item` div (DropZone) | `aria-selected` | `item.selected` |
| `.item` div | `aria-label` | `item.name` |
| `section.item-children` | `role` | `"group"` |

### 2.5 DisclosureTriangle

**File:** `app/src/components/disclosure-triangle.tsx`

Add new `label?: string` prop. Callers pass label from item name.

| Element | Attribute | Value |
|---------|-----------|-------|
| Outer `<div>` | `role` | `"button"` |
| Outer `<div>` | `tabIndex` | `0` (when `visible`) |
| Outer `<div>` | `aria-expanded` | `!this.props.collapsed` |
| Outer `<div>` | `aria-label` | `this.props.label` (new prop) |

### 2.6 Switch Component

**File:** `app/src/components/switch.tsx`

Add `aria-label` or `aria-labelledby` to `SwitchProps`.

| Element | Attribute | Value |
|---------|-----------|-------|
| Outer `<div>` | `role` | `"switch"` |
| Outer `<div>` | `aria-checked` | `props.checked` |
| Outer `<div>` | `tabIndex` | `0` |

---

## Priority 3 — Medium: Expandable Panels and Dropdowns

### 3.1 ButtonDropdown Component

**File:** `app/src/components/button-dropdown.tsx`

Split form:

| Element | Attribute | Value |
|---------|-----------|-------|
| `.primary-item` div | `role` | `"button"` |
| `.primary-item` div | `tabIndex` | `0` |
| `.primary-item` div | `aria-label` | `this.props.primaryTitle` |
| `.secondary-picker` div | `role` | `"button"` |
| `.secondary-picker` div | `tabIndex` | `0` |
| `.secondary-picker` div | `aria-label` | `localized('More options')` |
| `.secondary-picker` div | `aria-haspopup` | `"listbox"` |
| `.secondary-picker` div | `aria-expanded` | `this.state.open !== false` |
| `.secondary-items` div | `role` | `"listbox"` |

### 3.2 AccountSwitcher

**File:** `app/internal_packages/account-sidebar/lib/components/account-switcher.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| `.account-switcher` div | `role` | `"button"` |
| `.account-switcher` div | `tabIndex` | `0` |
| `.account-switcher` div | `aria-label` | `localized('Account switcher')` |
| `.account-switcher` div | `aria-haspopup` | `"menu"` |
| `<RetinaImg>` | `alt` | `""` |

Note: `onMouseDown` should also handle `onKeyDown` for Enter/Space.

### 3.3 Message Item Collapse/Expand

**File:** `app/internal_packages/message-list/lib/message-item.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| `<header>` | `aria-expanded` | `!this.props.collapsed` |
| `<header>` | `aria-label` | `localized('Message from %@', from[0]?.displayName(...))` |
| Header detail toggle (active) div | `role` | `"button"` |
| Header detail toggle (active) div | `tabIndex` | `0` |
| Header detail toggle (active) div | `aria-label` | `localized('Hide message details')` |
| Header detail toggle (inactive) div | same | `localized('Show message details')` |
| Collapsed message div | `role` | `"button"` |
| Collapsed message div | `aria-expanded` | `false` |
| Collapsed message div | `aria-label` | `localized('Expand message from %@', from[0]?.displayName(...))` |

### 3.4 Subject Line Icons

**File:** `app/internal_packages/message-list/lib/subject-line-icons.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| Expand/Collapse div | `role` | `"button"` |
| Expand/Collapse div | `aria-label` | `hasCollapsedItems ? localized('Expand All') : localized('Collapse All')` |
| Print div | `role` | `"button"` |
| Print div | `aria-label` | `localized('Print Thread')` |
| Pop-in div | `role` | `"button"` |
| Pop-in div | `aria-label` | `localized('Pop thread in')` |
| Pop-out div | `role` | `"button"` |
| Pop-out div | `aria-label` | `localized('Popout thread')` |

All inner `<RetinaImg>`: `alt=""`.

### 3.5 Minified Bundle Toggle

**File:** `app/internal_packages/message-list/lib/message-list.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| `.minified-bundle` div | `role` | `"button"` |
| `.minified-bundle` div | `tabIndex` | `0` |
| `.minified-bundle` div | `aria-label` | `` `${localized('Show %@ older messages', bundle.messages.length)}` `` |

---

## Priority 4 — Standard: Preferences and Tabs

### 4.1 Preferences Tab Bar

**File:** `app/internal_packages/preferences/lib/preferences-tabs-bar.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| `.preferences-tabs` div | `role` | `"tablist"` |
| `.preferences-tabs` div | `aria-label` | `localized('Preferences tabs')` |
| `.item` div (PreferencesTabItem) | `role` | `"tab"` |
| `.item` div | `aria-selected` | `tabId === selection.tabId` |
| `.item` div | `aria-label` | `displayName` |
| `.item` div | `tabIndex` | `tabId === selection.tabId ? 0 : -1` |

Content panels: add `role="tabpanel"` in `preferences-root.tsx`.

### 4.2 Search Bar

**File:** `app/internal_packages/thread-search/lib/thread-search-bar.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| `.thread-search-bar` div | `role` | `"combobox"` |
| `.thread-search-bar` div | `aria-expanded` | `focused && suggestions.length > 0` |
| `.thread-search-bar` div | `aria-haspopup` | `"listbox"` |
| Search input | `aria-label` | `this._placeholder()` |
| Search input | `aria-autocomplete` | `"list"` |
| `.suggestions` div | `role` | `"listbox"` |
| Each `.suggestion` div | `role` | `"option"` |
| Each `.suggestion` div | `aria-selected` | `selectedIdx === idx` |

### 4.3 Composer Header Show Buttons (Cc, Bcc, Subject)

**File:** `app/internal_packages/composer/lib/composer-header-actions.tsx`

| Element | Attribute | Value |
|---------|-----------|-------|
| `.action.show-cc` span | `role` | `"button"` |
| `.action.show-cc` span | `tabIndex` | `0` |
| `.action.show-bcc` span | same pattern | — |
| `.action.show-subject` span | same pattern | — |
| `.action.show-popout` span | same pattern | `aria-label={localized('Popout composer')}` |

---

## Established Patterns

### Pattern A: Icon-Only Button
```tsx
<button
  tabIndex={-1}
  className="btn btn-toolbar"
  title={localized('Archive')}
  aria-label={localized('Archive')}
  onClick={this._onArchive}
>
  <RetinaImg name="toolbar-archive.png" mode={RetinaImg.Mode.ContentIsMask} alt="" />
</button>
```

### Pattern B: Div-as-Button
```tsx
<div
  role="button"
  tabIndex={0}
  aria-label={localized('...')}
  onClick={this._onAction}
  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') this._onAction(e); }}
>
```

### Pattern C: Toggle Button
```tsx
<button
  aria-label={isActive ? localized('Unstar') : localized('Star')}
  aria-pressed={isActive}
  onClick={this._onToggle}
>
```

### Pattern D: Tree/List Region
```tsx
<section role="tree" aria-label={localized('Mailboxes')}>
  <div role="treeitem" aria-selected={item.selected} aria-expanded={!item.collapsed}>
    {item.name}
    <section role="group">...</section>
  </div>
</section>
```

---

## Priority Summary

| Priority | Category | Files | Impact |
|----------|----------|-------|--------|
| P1 | Thread toolbar, window controls, composer | `thread-toolbar-buttons.tsx`, `sheet-toolbar.tsx`, `composer-view.tsx` | Highest |
| P2 | Thread list selection, sidebar nav, star toggle | `multiselect-list.tsx`, `list-tabular-item.tsx`, `outline-view*.tsx`, `thread-list-icon.tsx` | High |
| P3 | Dropdowns, message expand/collapse, search | `button-dropdown.tsx`, `message-item.tsx`, `subject-line-icons.tsx`, `thread-search-bar.tsx` | Medium |
| P4 | Preferences tabs, form controls | `preferences-tabs-bar.tsx`, `composer-header-actions.tsx`, `switch.tsx` | Standard |

## Key Implementation Files
- `app/internal_packages/thread-list/lib/thread-toolbar-buttons.tsx`
- `app/src/components/outline-view-item.tsx`
- `app/src/components/multiselect-list.tsx`
- `app/src/components/button-dropdown.tsx`
- `app/src/components/disclosure-triangle.tsx`
