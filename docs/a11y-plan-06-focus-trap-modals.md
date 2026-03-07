# Accessibility Plan 06: Focus Trap and Modal/Dialog Accessibility

## Complete Inventory of Modals, Popovers, and Overlay UI

### Tier 1 — Full Modals (via `ModalStore` → `Modal` wrapper)

All flow through `Actions.openModal()` → `ModalStore.openModal()` → `Modal` component rendered by `ReactDOM.render()` into `<mailspring-modal-container>` prepended to `document.body`.

| Component | Opened by | Description |
|---|---|---|
| `BillingModal` | Feature upsell, preferences identity | Payment/subscription webview |
| `FeatureUsedUpModal` | `feature-usage-store.tsx` | Pro upsell with upgrade button |
| `ThemePicker` | `theme-picker/lib/main.tsx` | Theme selection list |
| `CodeSnippet` | `app-env.ts:showErrorDialog` | Error details display |

### Tier 2 — Popovers (via `PopoverStore` → `FixedPopover` wrapper)

All flow through `Actions.openPopover()` → `PopoverStore.openPopover()` → `FixedPopover` rendered by `ReactDOM.render()` into `<mailspring-popover-container>`.

| Component | Trigger | Description |
|---|---|---|
| `SendLaterPopover` → `DatePickerPopover` | Send Later button | Date/time picker |
| `SnoozePopover` | SnoozeButton | Snooze date picker |
| `SendRemindersPopover` | SendRemindersPopoverButton | Reminder date picker |
| `TemplatePopover` → `Menu` | Template picker button | Template list search |
| `EmojiToolbarPopover` | Emoji button | Emoji canvas picker |
| `CalendarEventPopover` | Calendar event click | Event view/edit form |
| `QuickEventPopover` | Quick event button | Natural-language event creator |
| `ActivityList` | ActivityListButton | Activity event list |
| `MovePickerPopover` | Category picker | Folder picker |
| `LabelPickerPopover` | Category picker | Label picker |
| `OpenTrackingMessagePopover` | Open-tracking icons | Open receipt list |
| `LinkTrackingMessagePopover` | Link tracking icons | Link click list |
| `ThreadSharingPopover` | ThreadSharingButton | Thread sharing/permalink |
| `TipPopoverContents` | HasTutorialTip decorator | Tutorial tip |
| Translate language `Menu` | Translate button | Language selector |

### Tier 3 — Inline Dropdowns (rendered in normal React tree)

| Component | Notes |
|---|---|
| `DropdownMenu` | Uses `onBlur` to close; `Menu` inside |
| `ButtonDropdown` | Uses `onBlur` to close |
| `MultiselectDropdown` | Wraps `ButtonDropdown` + `Menu` |
| `TimePicker` time-options div | Shows time list on focus |
| `BuildMarkButtonWithValuePicker` | URL input in composer toolbar |
| `BuildColorPicker` | `react-color` in composer toolbar |

### Tier 4 — Separate Electron Windows (not overlays)

Onboarding, Calendar, Contacts, and Composer popout windows each have their own full document. Focus trap is not needed at the window level. **Note:** Preferences is NOT a separate OS window — it appears in the main window as a sheet.

---

## Current Accessibility State

### `Modal` component (`app/src/components/modal.tsx`)

| Requirement | Status |
|---|---|
| `role="dialog"` | **Missing** |
| `aria-modal="true"` | **Missing** |
| `aria-labelledby` | **Missing** |
| Focus moves in on open | **Partial** — `_focusImportantElement()` works but no fallback |
| Focus trapped inside | **Missing** — Tab can freely exit |
| Escape closes | **Present** — `_onKeyDown` → `Actions.closeModal()` |
| Focus returns to trigger on close | **Missing** — `closeModal` just calls `ReactDOM.render(<span/>...)` |

### `FixedPopover` component (`app/src/components/fixed-popover.tsx`)

| Requirement | Status |
|---|---|
| `role="dialog"` | **Missing** |
| `aria-modal="true"` | **Missing** |
| `aria-labelledby` | **Missing** |
| Focus moves in on open | **Partial** — `AutoFocuses` decorator on `componentDidMount` |
| Focus trapped inside | **Missing** — `onBlur` closes on blur-out but Tab can escape momentarily |
| Escape closes | **Present** — `onKeyDown` → `Actions.closePopover()` |
| Focus returns to trigger on close | **Missing** |

### Inline Dropdowns

| Requirement | Status |
|---|---|
| `role` attribute | **Missing** — should be `role="listbox"` or `role="combobox"` |
| Focus trapped | **Partial** — `onBlur` closes when focus leaves container |
| Escape closes | **Present** in `DropdownMenu`, **Missing** in `ButtonDropdown` and `TimePicker` |
| Focus returns to trigger | **Partial** |

---

## Package Availability

`focus-trap-react` is **NOT** in `package.json`. The codebase prefers in-house focus management (see `TabGroupRegion`, `AutoFocuses` decorator). **Recommended approach: implement at the base component level using a custom `useFocusTrap` hook.**

---

## Recommended Approach: Base Component Level with `useFocusTrap` Hook

**Rationale:** `FixedPopover` and `Modal` are the two rendering wrappers for all 15+ modals and popovers. Fixing these two components gives every consumer free focus management — no need to touch each call site. Consistent with how `AutoFocuses`, `onKeyDown`, and `onBlur` are already implemented at the wrapper level.

---

## Implementation Plan

### Step 1 — Create `useFocusTrap` Hook

**New file:** `app/src/components/use-focus-trap.ts`

```typescript
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(', ');

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean,
  options: { initialFocusSelector?: string } = {}
) {
  const triggerRef = useRef<HTMLElement | null>(null);

  const getFocusable = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(el => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
  }, [containerRef]);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;
    // Save trigger before focus moves
    triggerRef.current = document.activeElement as HTMLElement;
    // Focus first element inside trap (deferred to avoid fighting CSS animations)
    const initialTarget = options.initialFocusSelector
      ? containerRef.current.querySelector<HTMLElement>(options.initialFocusSelector)
      : getFocusable()[0];
    if (initialTarget) {
      const frame = requestAnimationFrame(() => initialTarget.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) { event.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const container = containerRef.current;
    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [isActive, getFocusable]);

  const restoreFocus = useCallback(() => {
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, []);

  return { restoreFocus };
}
```

### Step 2 — Create `FocusTrap` Wrapper Component

**New file:** `app/src/components/focus-trap.tsx`

A thin functional wrapper component that class components (`FixedPopover`, `Modal`) can render inside their `render()`. The class component holds a `ref` to call `restoreFocus()` on unmount.

```typescript
export interface FocusTrapHandle {
  restoreFocus(): void;
}

const FocusTrap = forwardRef<FocusTrapHandle, FocusTrapProps>(
  ({ active, children, initialFocusSelector, className, style, role, onKeyDown, onBlur, tabIndex, ...ariaProps }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { restoreFocus } = useFocusTrap(containerRef, active, { initialFocusSelector });
    useImperativeHandle(ref, () => ({ restoreFocus }), [restoreFocus]);

    return (
      <div ref={containerRef} className={className} style={style}
        role={role} tabIndex={tabIndex} onKeyDown={onKeyDown} onBlur={onBlur} {...ariaProps}>
        {children}
      </div>
    );
  }
);
```

### Step 3 — Modify `Modal` Component

**File:** `app/src/components/modal.tsx`

1. Import `FocusTrap`.
2. Add `focusTrapRef = React.createRef<FocusTrapHandle>()` to class.
3. Add optional `title` prop to `Modal` — accept from callers for `aria-labelledby`.
4. Replace outer `<div className="modal-container">` with:
   ```tsx
   <FocusTrap
     ref={this.focusTrapRef}
     role="dialog"
     aria-modal={true}
     aria-labelledby={this._labelId}
     active={true}
     className="modal-container"
     onKeyDown={this._onKeyDown}
   >
     {this.props.title && (
       <span id={this._labelId} className="sr-only">{this.props.title}</span>
     )}
     {children}
   </FocusTrap>
   ```
5. Remove `_focusImportantElement()` — `FocusTrap` handles initial focus.
6. In `componentWillUnmount`: call `this.focusTrapRef.current?.restoreFocus()`.

**Update callers to pass `title`:**
- `BillingModal`: pass `title={localized('Billing and payment')}`
- `FeatureUsedUpModal`: pass `title={localized('Feature limit reached')}`
- `ThemePicker`: pass `title={localized('Choose theme')}`
- `showErrorDialog` in `app-env.ts`: pass `title={localized('Error')}`

**Update `ModalStore`** to thread `title` through action payload to `Modal` prop.

### Step 4 — Modify `FixedPopover` Component

**File:** `app/src/components/fixed-popover.tsx`

1. Import `FocusTrap`.
2. Add `focusTrapRef` to class.
3. Replace the popover content wrapper div with `FocusTrap`:
   ```tsx
   <FocusTrap
     ref={this.focusTrapRef}
     role="dialog"
     aria-modal={true}
     active={true}
     onBlur={this.props.onBlur}
   >
     {children}
   </FocusTrap>
   ```
4. In `componentWillUnmount`: call `this.focusTrapRef.current?.restoreFocus()`.
5. **Remove `AutoFocuses` decorator** from the `compose()` call on `FixedPopover` — `FocusTrap`/`useFocusTrap` handles initial focus and runs only once on mount, avoiding the re-focus-on-every-update problem `AutoFocuses` creates.

**`document.activeElement` at mount time:** Since `openPopover` → `ReactDOM.render()` → `componentDidMount` is synchronous, `document.activeElement` at FocusTrap activation time is still the trigger button. No API changes needed for focus restoration.

### Step 5 — Add ARIA Roles to Inline Dropdown Components

**`DropdownMenu` (`dropdown-menu.tsx`):**
- `role="combobox"` on trigger; `role="listbox"` on expanded `Menu` container
- Each `MenuItem` → `role="option"`

**`ButtonDropdown` (`button-dropdown.tsx`):**
- Add Escape key handler to close dropdown
- Add `aria-expanded` attribute

**`TimePicker` (`time-picker.tsx`):**
- `role="listbox"` on time options div
- `role="option"` on each time option
- Add Escape key handler

**`BuildColorPicker` (`toolbar-component-factories.tsx`):**
- `role="dialog"` and `aria-label={localized('Color picker')}` on expanded dropdown
- Add Escape key handler

**`BuildMarkButtonWithValuePicker`:**
- `role="dialog"` and `aria-label={localized('Insert link')}`

### Step 6 — Export from `mailspring-component-kit`

Update `app/src/global/mailspring-component-kit.d.ts`:
```typescript
export const FocusTrap: typeof import('../components/focus-trap').default;
export const useFocusTrap: typeof import('../components/use-focus-trap').useFocusTrap;
```

### Step 7 — Handle `AutoFocuses` Decorator Interaction

`AutoFocuses` is composed onto `FixedPopover` and calls `focusElementWithTabIndex()` on every `componentDidMount` and `componentDidUpdate`. With `FocusTrap` handling initial focus, these systems conflict — `AutoFocuses` would re-focus the first element on every update, disrupting user navigation within the popover.

**Resolution:** Remove `AutoFocuses` from `compose(FixedPopover, AutoFocuses)`. The `FocusTrap`'s `useFocusTrap` hook provides better controlled initial-focus that runs only once on mount.

### Step 8 — Verify `TabGroupRegion` Compatibility

`TabGroupRegion` intercepts Tab with `stopPropagation()`. When nested inside a `FocusTrap`:
- `TabGroupRegion._onKeyDown` calls `event.stopPropagation()` — prevents Tab event from reaching `FocusTrap`'s container-level listener
- `FocusTrap`'s keydown listener (bubble phase) acts as catch-all for elements outside any `TabGroupRegion`
- Both systems can coexist without changes to either

### Step 9 — `inert` Attribute (Future Enhancement)

`aria-modal="true"` signals AT to ignore background content, but some AT implementations (NVDA browse mode) don't fully honor it. The `inert` attribute on background siblings is more reliable. Implement in `ModalStore.openModal()` / `closeModal()` as a follow-up after core focus trap is in place.

---

## File-by-File Change List

### New Files
- `app/src/components/use-focus-trap.ts` — Core `useFocusTrap` hook
- `app/src/components/focus-trap.tsx` — `FocusTrap` wrapper component

### Modified Files
| File | Change |
|---|---|
| `app/src/components/modal.tsx` | `FocusTrap` wrap, `role="dialog"`, `aria-modal`, `aria-labelledby`, `restoreFocus` on unmount, remove `_focusImportantElement` |
| `app/src/components/fixed-popover.tsx` | `FocusTrap` wrap, `role="dialog"`, `aria-modal`, `restoreFocus` on unmount, remove `AutoFocuses` from compose |
| `app/src/flux/stores/modal-store.tsx` | Thread optional `title` through to `Modal` prop |
| `app/src/components/dropdown-menu.tsx` | `role="combobox"`, `role="listbox"`, `role="option"` |
| `app/src/components/button-dropdown.tsx` | Escape key handler, `aria-expanded` |
| `app/src/components/time-picker.tsx` | `role="listbox"`, `role="option"`, Escape key handler |
| `app/src/components/composer-editor/toolbar-component-factories.tsx` | `role="dialog"`, `aria-label`, Escape handlers |
| `app/src/components/decorators/auto-focuses.tsx` | Remove from `FixedPopover` compose chain |
| `app/src/global/mailspring-component-kit.d.ts` | Export `FocusTrap`, `useFocusTrap` |
| `app/src/components/feature-used-up-modal.tsx` | Add `id` to `<h2>` for `aria-labelledby` |
| `app/internal_packages/main-calendar/lib/core/calendar-event-popover.tsx` | `aria-label` or `aria-labelledby` |
| `app/internal_packages/theme-picker/lib/main.tsx` | Pass `title` to `Actions.openModal` |
| `app/src/app-env.ts` | Pass `title` to `Actions.openModal` in `showErrorDialog` |
| `app/src/flux/stores/feature-usage-store.tsx` | Pass `title` to `Actions.openModal` |

---

## Testing Checklist

### Keyboard Navigation
- [ ] Open every modal/popover via keyboard (Enter/Space on trigger)
- [ ] Focus moves inside immediately on open
- [ ] Tab cycles only within modal/popover (never escapes to page behind)
- [ ] Shift+Tab reverses cycle within modal/popover
- [ ] Escape closes modal/popover
- [ ] Focus returns to trigger button after closing

### Per-Component Scenarios
| Component | Test |
|---|---|
| `BillingModal` | Open, Tab within, Escape to close, focus returns |
| `FeatureUsedUpModal` | Same |
| `ThemePicker` | Open, Tab through theme list, Escape, focus returns |
| `SendLaterPopover` | Open, Tab through date options, Escape, focus returns to "Send Later" |
| `SnoozePopover` | Open, Tab through snooze options, Escape |
| `TemplatePopover` | Open, Tab through search and list, Escape |
| `CalendarEventPopover` | Open, Tab through fields, Escape |
| `DropdownMenu` | Open, Tab options, Escape, focus returns |
| `TimePicker` | Focus input, options appear, Tab selects, Escape closes |

### Screen Reader Testing
- [ ] VoiceOver (macOS) announces "dialog" role and dialog name on open
- [ ] NVDA (Windows) equivalent
- [ ] `aria-modal="true"` prevents virtual cursor from reading background (VoiceOver), or browse mode suspends (NVDA)
- [ ] Escape closes and focus returns to trigger

### Regression Testing
- [ ] Click outside modal (backdrop) still closes
- [ ] Window resize still closes popovers
- [ ] `onBlur` on `FixedPopover` doesn't fire falsely when Tab-cycling within
- [ ] `AutoFocuses` removal doesn't break: template search autofocus, emoji search autofocus, calendar invitees autofocus
- [ ] `TabGroupRegion` inside `CalendarEventPopover` still cycles correctly

---

## Critical Files

- `app/src/components/modal.tsx` — Core modal wrapper; all 4 dialogs benefit from `role="dialog"` and focus trap here
- `app/src/components/fixed-popover.tsx` — Core popover wrapper; all 15+ popovers benefit; `AutoFocuses` must be decoupled
- `app/src/flux/stores/modal-store.tsx` — Lifecycle point for opening/closing; coordinates `title` prop threading
- `app/src/flux/stores/popover-store.tsx` — Opening/closing lifecycle for popovers
- `app/src/components/decorators/auto-focuses.tsx` — Must be removed from `FixedPopover` compose chain to avoid conflicting with `useFocusTrap`
