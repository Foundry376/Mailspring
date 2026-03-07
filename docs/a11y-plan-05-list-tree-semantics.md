# Accessibility Plan 05: List and Tree Semantics for Thread List and Account Sidebar

## 1. Current Component Structure

### Thread List DOM Structure

```
ThreadList (thread-list.tsx)
  FluxContainer
    FocusContainer
      MultiselectList (multiselect-list.tsx)
        KeyCommandsRegion → <div class="thread-list thread-list-{style}">
          ListTabular (list-tabular.tsx)
            <div class="list-container list-tabular">
              ScrollRegion
                <div tabIndex={-1}>
                  ListTabularRows
                    <div class="list-rows">
                      {rows.map(...)}
                        SwipeContainer
                          <div onWheel onTouch...>  ← outer swipe div (no role)
                            <div class="list-item list-tabular-item {selected,focused,...}">
                              <div class="list-column list-column-{name}">
```

Key observations:
- Every element is a plain `<div>` with no ARIA roles
- Selection tracked by `_getItemPropsProvider()` in `MultiselectList` — adds CSS class `selected` only
- Thread data available per item: `subject`, `unread`, `starred`, `attachmentCount`, `participants[]`, `lastMessageReceivedTimestamp`, `__messages[]`
- `SwipeContainer` wraps each row — outer div is presentational

### Account Sidebar DOM Structure

```
AccountSidebar
  ScrollRegion → <div class="account-sidebar">
    AccountSwitcher
    <div class="account-sidebar-sections">
      OutlineView (outline-view.tsx) × N
        <section class="outline-view nylas-outline-view">
          <div class="heading">
            <span class="text">Title</span>
            [add-item-button] [collapse-button]
          </div>
          <div>   ← outline body
            OutlineViewItem (outline-view-item.tsx) × N
              <div>                              ← outermost (no role, no label)
                <span class="item-container">
                  DisclosureTriangle
                    <div class="disclosure-triangle visible? collapsed?">
                  DropZone → <div class="item selected? editing?">
                <section class="item-children">
                  OutlineViewItem × N (recursive)
```

Key observations:
- No ARIA roles anywhere
- `OutlineView` renders `<section>` — semantic but not a tree
- `DisclosureTriangle` is a non-button `<div onClick>` — keyboard inaccessible
- Selection tracked by `item.selected` (from `FocusedPerspectiveStore`) → CSS class only
- Expansion tracked by `item.collapsed` → CSS only
- Depth: 1-2 levels (account sections → folders → sub-folders)
- Edit input in `OutlineViewItem` uses `tabIndex={1}` — positive, should be 0

---

## 2. Recommended ARIA Patterns

### Thread List: `role="listbox"` + `role="option"`

**Rationale:** The thread list supports single and multi-selection. `listbox` is designed for exactly this — it supports `aria-multiselectable="true"`, `aria-selected` on options, and is well-supported in screen readers for email-client-style lists. `role="list"` + `role="listitem"` does not convey selectability. `role="grid"` would require per-cell focus management that's too complex for this virtualized list.

Container attributes:
- `role="listbox"`
- `aria-label` or `aria-labelledby` (e.g., folder name + count: "Inbox — 47 threads")
- `aria-multiselectable="true"` (list mode) or `"false"` (split mode)

Per-row attributes:
- `role="option"`
- `aria-selected="true|false"`
- `aria-label` — computed accessible name string (see Section 4)

### Sidebar: `role="tree"` + `role="treeitem"` + `role="group"`

**Rationale:** The sidebar is hierarchical with expand/collapse and selection. The ARIA tree pattern is the correct semantic for a collapsible hierarchical navigation.

One `role="tree"` per `OutlineView` section, labelled by the section heading:
- Container: `role="tree"`, `aria-label` from `props.title`
- Items: `role="treeitem"`, `aria-level`, `aria-selected`, `aria-expanded` (if has children)
- Child groups: `role="group"` on the element currently rendered as `<section class="item-children">`

---

## 3. File-by-File Change List

### `app/src/components/list-tabular.tsx`

Add props to `ListTabularProps`:
```typescript
role?: string;
ariaLabel?: string;
ariaMultiselectable?: boolean;
```

Pass through to `ListTabularRows` and onto the `.list-rows` div.

### `app/src/components/list-tabular-item.tsx`

Add props to `ListTabularItemProps`:
```typescript
role?: string;
ariaSelected?: boolean;
ariaLabel?: string;
```

In `render()`:
```tsx
// SwipeContainer outer div — presentational
<SwipeContainer role="presentation" ...>
  // inner item div — semantic
  <div
    className={className}
    role={role}           // "option"
    aria-selected={ariaSelected}
    aria-label={ariaLabel}
    style={{ height: this.props.metrics.height }}
  >
    {this._columnCache}
  </div>
</SwipeContainer>
```

`SwipeContainer` uses `Utils.fastOmit(this.props, ...)` and spreads remaining props — passing `role="presentation"` via props will work.

### `app/src/components/multiselect-list.tsx`

Add to `MultiselectListProps`:
```typescript
ariaLabel?: string;                           // container label
ariaLabelForItem?: (item: any) => string;     // per-item label function
```

In `_getItemPropsProvider()`, add:
```typescript
if (this.props.ariaLabelForItem) {
  props['ariaLabel'] = this.props.ariaLabelForItem(item);
}
props['ariaSelected'] = selected;
props['role'] = 'option';
```

In `render()`, pass to `ListTabular`:
```typescript
role="listbox"
ariaLabel={this.props.ariaLabel}
ariaMultiselectable={this.state.layoutMode === 'list'}
```

The `KeyCommandsRegion` wrapper div: add `role="presentation"` or ensure `role="listbox"` lands on the `ListTabularRows` div (preferred — it's the actual container of options).

### `app/internal_packages/thread-list/lib/thread-list.tsx`

Add `ariaLabelForItem` and `ariaLabel` props to `MultiselectList`:

```typescript
ariaLabel={FocusedPerspectiveStore.current().name || localized('Threads')}
ariaLabelForItem={(thread) => threadAriaLabel(thread)}
```

Implement the `threadAriaLabel` function (see Section 4).

### `app/src/components/outline-view.tsx`

**Changes to `_renderOutline()`:** Add `role="tree"` and `aria-label={this.props.title}` to the container div.

**Changes to heading:** The collapse `<span>` → `<button>` with `aria-expanded={!collapsed}` and `aria-label`.

**Changes to `_renderOutline()` items container:** Add `role="tree"`.

### `app/src/components/outline-view-item.tsx`

Add `level` prop (number, default 1). Pass `level + 1` to child `OutlineViewItem`s.

```tsx
<div
  role="treeitem"
  aria-level={this.props.level}
  aria-selected={item.selected}
  aria-expanded={hasChildren ? !item.collapsed : undefined}
  aria-label={accessibleName}
  tabIndex={item.selected ? 0 : -1}
>
  <span class="item-container">
    <DisclosureTriangle ... />
    <DropZone class="item ...">
  </span>
  <div role="group" class="item-children">   {/* was <section> */}
    {children with level + 1}
  </div>
</div>
```

Change `<section class="item-children">` → `<div role="group" class="item-children">`.

Edit input: `tabIndex={1}` → `tabIndex={0}`.

### `app/src/components/disclosure-triangle.tsx`

Change outer `<div class="disclosure-triangle">` to add:
```tsx
role="button"
tabIndex={-1}   // treeitem manages focus, not the triangle
aria-expanded={!this.props.collapsed}
aria-label={collapsed ? 'Expand' : 'Collapse'}
onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') this.props.onToggleCollapsed(); }}
```

If converting `<div>` to `<button>`, add CSS reset:
```less
.disclosure-triangle {
  border: none;
  background: none;
  padding: 0;
}
```

---

## 4. Computing the Accessible Name for Each Thread Item

```typescript
function threadAriaLabel(thread: Thread): string {
  const parts: string[] = [];

  // 1. Unread prefix
  if (thread.unread) parts.push(localized('Unread'));

  // 2. Participants (non-self, up to 3)
  const names = thread.participants
    ?.filter(c => !c.isMe())
    .slice(0, 3)
    .map(c => c.displayName({ compact: false }))
    .join(', ');
  if (names) parts.push(names);

  // 3. Subject
  const subj = (thread.subject || '').trim() || localized('No Subject');
  parts.push(subj);

  // 4. Timestamp
  const rawTs = FocusedPerspectiveStore.current().isSent()
    ? thread.lastMessageSentTimestamp
    : thread.lastMessageReceivedTimestamp;
  if (rawTs) parts.push(DateUtils.shortTimeString(rawTs));

  // 5. Message count
  const msgCount = thread.__messages?.length || 0;
  if (msgCount > 1) parts.push(localized('%1$@ messages', msgCount));

  // 6. Attachment
  if (thread.attachmentCount > 0) parts.push(localized('has attachment'));

  // 7. Starred
  if (thread.starred) parts.push(localized('starred'));

  return parts.join(', ');
}
```

**Example output:** `"Unread, Alice Smith, Project Update, 3:45 PM, 3 messages, has attachment"`

Place this function in a new file `thread-list-aria-utils.ts` and import it in `thread-list.tsx`.

---

## 5. Arrow Key Navigation for the Sidebar Tree

WAI-ARIA tree pattern keyboard requirements (none currently implemented):

| Key | Behavior |
|---|---|
| Down Arrow | Move focus to next visible treeitem |
| Up Arrow | Move focus to previous visible treeitem |
| Right Arrow | If collapsed + has children: expand. If expanded: move to first child. If leaf: do nothing |
| Left Arrow | If expanded: collapse. If collapsed/leaf: move focus to parent |
| Home | Focus first treeitem |
| End | Focus last visible treeitem |
| Enter / Space | Select/activate focused treeitem |

**Implementation strategy:**

Add keyboard handler to `OutlineView` (the `role="tree"` container). Maintain `focusedItemId` state with **roving tabindex** — focused item gets `tabIndex={0}`, all others `tabIndex={-1}`.

```typescript
_onTreeKeyDown = (event: React.KeyboardEvent) => {
  const visibleItems = this._getVisibleItemsInOrder(); // pre-order traversal, skip collapsed children
  const focusedIdx = visibleItems.findIndex(i => i.id === this.state.focusedItemId);

  switch (event.key) {
    case 'ArrowDown': { /* move to focusedIdx + 1 */ break; }
    case 'ArrowUp':   { /* move to focusedIdx - 1 */ break; }
    case 'ArrowRight': {
      const item = visibleItems[focusedIdx];
      if (item.children.length > 0 && item.collapsed) item.onCollapseToggled(item);
      else if (item.children.length > 0) { /* focus first child */ }
      break;
    }
    case 'ArrowLeft': {
      const item = visibleItems[focusedIdx];
      if (item.children.length > 0 && !item.collapsed) item.onCollapseToggled(item);
      else { /* focus parent */ }
      break;
    }
    case 'Enter':
    case ' ': { visibleItems[focusedIdx]?.onSelect(visibleItems[focusedIdx]); break; }
    case 'Home': { /* focus first item */ break; }
    case 'End':  { /* focus last visible item */ break; }
  }
  event.preventDefault();
};
```

To focus items, use `document.querySelector(`[data-item-id="${id}"]`)?.focus()` — consistent with the existing `data-item-id` pattern in the thread list.

---

## 6. CSS Implications

### `app/static/style/components/outline-view.less`

```less
// BEFORE:
section.item-children { ... }

// AFTER (when <section> becomes <div role="group">):
div.item-children { ... }
// Or more robustly: just use class selector
.item-children { ... }
```

The selector `.outline-view section` (if present) would now only hit the `OutlineView` root `<section>` — which is correct. The `section.item-children` selector must change to `div.item-children` or `.item-children`.

### If `DisclosureTriangle` changes `<div>` → `<button>`

```less
.disclosure-triangle {
  border: none;
  background: none;
  padding: 0;
  cursor: default;
  // existing positioning styles remain
}
```

### Thread list (`list-tabular.less`)

The selector `.list-rows > div` (line 96) targets immediate div children. `SwipeContainer` remains `<div role="presentation">` — selector still matches. No change needed.

All `.list-tabular-item` class selectors are class-based — unaffected by adding `role="option"`.

---

## 7. Core Component Interface Changes (Summary)

### `ListTabularRows` — add to props
```typescript
role?: string;
ariaLabel?: string;
ariaMultiselectable?: boolean;
```

### `ListTabularItem` — add to props
```typescript
role?: string;       // "option"
ariaSelected?: boolean;
ariaLabel?: string;
```

### `MultiselectList` — add to props
```typescript
ariaLabel?: string;
ariaLabelForItem?: (item: any) => string;
```

---

## 8. Implementation Sequencing

1. **`list-tabular-item.tsx`** — Add role/aria props; `role="presentation"` on SwipeContainer, `role="option"` on inner div. No-op when props absent — safe.
2. **`list-tabular.tsx`** — Thread role/aria props through to `.list-rows` div.
3. **`multiselect-list.tsx`** — Compute `aria-selected` per item; pass `role="listbox"` to ListTabular.
4. **`thread-list.tsx`** — Add `ariaLabel` and `ariaLabelForItem`; implement `threadAriaLabel()`.
5. **`disclosure-triangle.tsx`** — Upgrade to `role="button"` with keyboard handlers and `aria-expanded`.
6. **`outline-view-item.tsx`** — Add `level` prop, `role="treeitem"`, all aria attributes, roving tabIndex. Change `<section class="item-children">` → `<div role="group">`. Fix `tabIndex={1}` → `tabIndex={0}`.
7. **`outline-view.less`** — Update `section.item-children` → `div.item-children` (or `.item-children`).
8. **`outline-view.tsx`** — Add `role="tree"`, `aria-label`, roving tabindex state, arrow key handler.

---

## Critical Files

- `app/src/components/list-tabular-item.tsx` — Add `role="option"`, `aria-selected`, `aria-label`; mark SwipeContainer as `role="presentation"`
- `app/src/components/outline-view-item.tsx` — `role="treeitem"`, `aria-level`, `aria-expanded`, `aria-selected`, roving tabIndex, `<section>` → `<div role="group">`
- `app/src/components/multiselect-list.tsx` — Coordination layer; computes `aria-selected` and passes `role="listbox"` to container
- `app/src/components/outline-view.tsx` — `role="tree"`, `aria-label`, arrow-key navigation handler
- `app/internal_packages/thread-list/lib/thread-list.tsx` — Provides `ariaLabelForItem` function computing human-readable name per thread
