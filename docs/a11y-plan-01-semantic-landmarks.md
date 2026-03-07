# Accessibility Plan 01: Semantic HTML Landmark Elements

## Architecture Summary

The layout hierarchy:

```
<mailspring-workspace>
  SheetContainer (sheet-container.tsx)
    <Flexbox direction="column">           (renders as <div>)
      "sheet-toolbar" <div>               → toolbar bar across the top
        Toolbar (sheet-toolbar.tsx)
          per-column <div>s with data-column
      "header injection" <div>
      "sheet area" <div>
        Sheet (sheet.tsx)
          <Flexbox direction="row">
            [column-RootSidebar]           → account sidebar column
            [column-ThreadList]            → thread list column
            [column-MessageList]           → message panel column
      "footer injection" <div>
```

---

## File-by-File Change Plan

### 1. `app/src/sheet-container.tsx`

**Current render (lines 122-175):**
```tsx
<Flexbox direction="column">
  <div className="sheet-toolbar">       // toolbar
  <div>                                  // header injection
  <div style={{ order: 2, flex: 1 }}>   // sheet area
  <div style={{ order: 3 }}>            // footer injection
</Flexbox>
```

**Changes:**

| Location | Current | Proposed | Rationale |
|----------|---------|----------|-----------|
| `_toolbarContainerElement()` | `<div className="sheet-toolbar">` | `<header role="banner" className="sheet-toolbar">` | App toolbar is the global banner landmark |
| `render()` sheet area | `<div style={{ order: 2... }}>` | `<main style={{ order: 2... }}>` | Primary content of the window |
| `render()` footer | `<div style={{ order: 3... }}>` | `<footer style={{ order: 3... }}>` | Application footer content |

**ARIA attributes:**
- `<header>`: `aria-label="Application toolbar"`
- `<main>`: `aria-label="Email workspace"`

**Code:**
```tsx
// _toolbarContainerElement():
return (
  <header
    className="sheet-toolbar"
    role="banner"
    aria-label="Application toolbar"
    style={{ order: 0, zIndex: 3 }}
    onClick={this._onToolbarDoubleClick}
  >
    ...
  </header>
);

// render() main area:
<main
  style={{ order: 2, flex: 1, position: 'relative', zIndex: 1 }}
  aria-label="Email workspace"
>
  {sheetComponents}
</main>
```

---

### 2. `app/src/sheet-toolbar.tsx`

**Changes:**

Per-column toolbar divs get `role="toolbar"` and `aria-label`:

```tsx
const COLUMN_ARIA_LABELS: Record<string, string> = {
  RootSidebar: 'Sidebar toolbar',
  ThreadList: 'Thread list toolbar',
  MessageList: 'Message toolbar',
  MessageListSidebar: 'Contact panel toolbar',
};

// Per-column div:
<div
  role="toolbar"
  aria-label={COLUMN_ARIA_LABELS[columnName] || 'Toolbar'}
  className={`toolbar-${columnName}`}
  data-column={idx}
>
```

---

### 3. `app/internal_packages/account-sidebar/lib/components/account-sidebar.tsx`

**Current render (lines 65-79):**
```tsx
<Flexbox direction="column">
  <ScrollRegion className="account-sidebar">
    <AccountSwitcher ... />
    <div className="account-sidebar-sections">   // ← change this
      <OutlineView ... />
    </div>
  </ScrollRegion>
</Flexbox>
```

**Change:** `<div className="account-sidebar-sections">` → `<nav aria-label="Mailboxes">`

This is the single most important landmark in the entire app — the primary navigation that screen reader users need to jump to.

---

### 4. `app/src/sheet.tsx`

**Changes:** Add `role` and `aria-label` to column containers by passing props through `ResizableRegion` and `InjectedComponentSet`.

```tsx
const columnMeta = {
  RootSidebar:        { role: 'complementary', 'aria-label': 'Account sidebar' },
  ThreadList:         { role: 'region',         'aria-label': 'Thread list' },
  MessageList:        { role: 'region',         'aria-label': 'Messages' },
  MessageListSidebar: { role: 'complementary',  'aria-label': 'Contact panel' },
};

// In _columnFlexboxElements():
const meta = columnMeta[location.id] || {};
return (
  <ResizableRegion
    key={idx}
    role={meta.role}
    aria-label={meta['aria-label']}
    ...
  >
```

`InjectedComponentSet` passes props through `Flexbox` → `<div>` automatically via `{...otherProps}`. `ResizableRegion` must be verified to pass-through `role` and `aria-label` to its container element.

---

### 5. `app/internal_packages/message-list/lib/message-list.tsx`

**Changes:**

| Location | Current | Proposed | Notes |
|----------|---------|----------|-------|
| `<div id="message-list">` (line 422) | `<div>` | `<section>` | Keep `id="message-list"` for CSS |
| `_renderSubject()` outer div | `<div className="message-subject-wrap">` | `<header>` | Section header |

**Section ARIA:** The `<section>` must have `aria-label` to become a landmark:
```tsx
<section
  id="message-list"
  aria-label={this.state.currentThread?.subject || localized('Messages')}
  className={...}
>
```

**Important:** A `<section>` without `aria-label` is NOT a landmark — the label is mandatory here.

---

### 6. `app/internal_packages/message-list/lib/message-item.tsx`

MessageItem already uses `<header className="message-header">` (line 187) — correct, no change needed.

**Change:** The outer wrapper in `_renderFull()` changes from `<div>` to `<article>`:
```tsx
<article className={this.props.className} aria-label={`Message from ${displayName}`}>
```

Each email message is a self-contained piece of content — the canonical use of `<article>`. Users can navigate message-by-message with screen reader object navigation.

**CSS impact:** The class `.message-item-wrap` is targeted by class name in LESS, not by `div` tag — safe to change.

---

### 7. `app/internal_packages/message-list/lib/sidebar-plugin-container.tsx`

**Change:** `<div className="sidebar-section">` → `<aside className="sidebar-section" aria-label="Contact information">`

The `.sidebar-section` CSS selector is class-based — safe to change.

---

### 8. `app/internal_packages/composer/lib/composer-view.tsx`

**Change:** `<div className="composer-action-bar-wrap">` → `<footer className="composer-action-bar-wrap">`

**Change:** In `composer-header.tsx`, `<div className="composer-header">` → `<header className="composer-header" aria-label="Message addressing">`

Both `.composer-action-bar-wrap` and `.composer-header` are class-based CSS selectors — safe to change.

---

## CSS Changes Required

**No existing LESS selectors will break.** All selectors for affected elements use class or ID names, not element tag names:
- `.account-sidebar` — class only
- `#message-list` — ID selector (preserved on `<section>`)
- `.message-item-wrap` — class only
- `.column-RootSidebar` etc. — class only
- `.sheet-toolbar` — class only
- `.composer-action-bar-wrap` — class only
- `.composer-header` — class only
- `.sidebar-section` — class only

**New CSS required** — add to `app/static/style/normalize.less` (or `workspace.less`):
```less
// Reset semantic elements to prevent browser UA default margins
main, section, article, aside, nav, header, footer {
  display: block;
  margin: 0;
  padding: 0;
}
```

This is a defensive reset; Chromium's UA stylesheet already applies `display: block` to these elements, but explicit reset prevents any theme interference.

---

## ARIA Landmark Summary

| Component | Element | Role | `aria-label` |
|-----------|---------|------|--------------|
| `SheetContainer` toolbar | `<header>` | `banner` (implicit) | `"Application toolbar"` |
| `SheetContainer` main area | `<main>` | `main` (implicit) | `"Email workspace"` |
| `SheetContainer` footer | `<footer>` | `contentinfo` (implicit) | _(none needed)_ |
| `Sheet` RootSidebar column | `<div role="complementary">` | `complementary` | `"Account sidebar"` |
| `Sheet` ThreadList column | `<div role="region">` | `region` | `"Thread list"` |
| `Sheet` MessageList column | `<div role="region">` | `region` | `"Messages"` |
| `Sheet` MessageListSidebar | `<div role="complementary">` | `complementary` | `"Contact panel"` |
| `AccountSidebar` sections | `<nav>` | `navigation` (implicit) | `"Mailboxes"` |
| Toolbar per-column divs | `<div role="toolbar">` | `toolbar` | `"Sidebar toolbar"` etc. |
| `MessageList` outer div | `<section>` | `region` | current thread subject |
| `MessageList` subject wrap | `<header>` | _(section header)_ | _(none)_ |
| `MessageItem` full wrap | `<article>` | `article` | message sender name |
| Sidebar plugin container | `<aside>` | `complementary` | `"Contact information"` |
| `ComposerView` action bar | `<footer>` | _(composer footer)_ | _(none)_ |
| `ComposerHeader` header | `<header>` | _(section header)_ | `"Message addressing"` |

---

## Screen Reader Improvements After Changes

1. **Jump-to-navigation** (`R` in JAWS, `D` in NVDA) — lands on `<nav aria-label="Mailboxes">`
2. **Jump-to-main** (`Q` in JAWS/NVDA) — lands on `<main aria-label="Email workspace">`
3. **Landmarks list** (JAWS: `INS+F3`, NVDA: `NVDA+F7`, VoiceOver: `VO+U`) — structured list of all regions
4. **Message-by-message navigation** — `<article>` enables `A`/`O` navigation keys in JAWS/NVDA
5. **Thread subject announcement** — `<section aria-label={subject}>` announces on focus entry
6. **Reply area discoverability** — already tracked in ARIA plan

---

## Implementation Sequence

1. **CSS reset first** — add normalize rules in `normalize.less` or `workspace.less`
2. **`sheet-container.tsx`** — `<header>`, `<main>`, `<footer>` (highest impact, lowest risk)
3. **`sheet.tsx`** — ARIA column roles/labels (no visual change)
4. **`account-sidebar.tsx`** — `<nav>` change (most critical for screen reader navigation)
5. **`sheet-toolbar.tsx`** — `role="toolbar"` on column toolbar divs
6. **`message-list.tsx`** — `<section id="message-list">` + `<header>` for subject
7. **`message-item.tsx`** — `<article>` wrapper
8. **`composer-view.tsx`** + **`composer-header.tsx`** — `<footer>` + `<header>`
9. **`sidebar-plugin-container.tsx`** — `<aside>`

---

## Potential Challenges

1. **`ResizableRegion` prop propagation:** Verify it forwards `role`/`aria-label` to its container. If not, wrap in `<div role="..." aria-label="...">` around `ResizableRegion`.
2. **Multiple `<header>` elements:** Valid per HTML5 — each sectioning element (`<section>`, `<article>`, `<main>`) may have its own `<header>`. Only the top-level `<header>` not inside a sectioning element becomes the `banner` landmark.
3. **`<section>` requires a label:** A `<section>` without `aria-label` or `aria-labelledby` is NOT a landmark. The `aria-label={subject}` on `<section id="message-list">` is mandatory.
4. **Dynamic subject:** Label changes when user selects a different thread. Screen readers don't re-announce unless focus re-enters — this is acceptable.

## Critical Files

- `app/src/sheet-container.tsx` — `<header>`, `<main>`, `<footer>` landmarks; highest impact
- `app/src/sheet.tsx` — column container role/label wiring
- `app/internal_packages/account-sidebar/lib/components/account-sidebar.tsx` — `<nav>` landmark; most critical for navigation users
- `app/internal_packages/message-list/lib/message-list.tsx` — `<section>` + dynamic `aria-label`
- `app/static/style/normalize.less` — CSS reset prerequisite
