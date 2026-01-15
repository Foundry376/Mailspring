# React 17 Migration Checklist

This document contains the detailed list of all callsites that need to be addressed for the React 16.9 → 17 upgrade.

---

## Priority 1: Deprecated Lifecycle Methods (Must Fix)

These methods are deprecated and will log warnings in React 17. They should be migrated to avoid console noise and prepare for React 18 where they may be removed.

### 1.1 `componentWillMount` → `componentDidMount`

| File | Line | Current Code | Migration Strategy |
|------|------|--------------|-------------------|
| `app/internal_packages/message-list/lib/message-item-body.tsx` | 84 | Subscribes to `MessageBodyProcessor` | Move subscription to `componentDidMount`. The subscription already handles initial callback via `needInitialCallback` flag. |
| `app/src/components/billing-modal.tsx` | 29 | Fetches SSO URL if not provided | Move to `componentDidMount`. Add loading state if needed. |
| `app/internal_packages/main-calendar/lib/core/mailspring-calendar.tsx` | 98 | Subscribes to calendars and actions | Move to `componentDidMount`. Subscriptions should work the same. |
| `app/src/components/metadata-composer-toggle-button.tsx` | 57 | Checks feature usage and enables plugin | Move to `componentDidMount`. May need to handle the enabled state differently. |

#### Migration Pattern

```typescript
// BEFORE
componentWillMount() {
  this._subscription = SomeStore.subscribe(this._onUpdate);
}

// AFTER
componentDidMount() {
  this._subscription = SomeStore.subscribe(this._onUpdate);
}
```

**Note:** If the subscription needs data before first render, initialize state in constructor using synchronous methods, or show a loading state.

---

## Priority 2: Legacy Context API (Should Fix)

The legacy context API (`childContextTypes`, `getChildContext`, `contextTypes`) is deprecated. While it still works in React 17, migrating to the new Context API is recommended.

### 2.1 `TabGroupRegion` - Tab Focus Management

**File:** `app/src/components/tab-group-region.tsx`

**Lines:**
- Line 21: `static childContextTypes = { parentTabGroup: PropTypes.object };`
- Line 70-72: `getChildContext() { return { parentTabGroup: this }; }`

**Purpose:** Provides tab group reference to child components for focus management.

**Migration:**

```typescript
// Create context file: app/src/components/tab-group-context.ts
import React from 'react';
import type { TabGroupRegion } from './tab-group-region';

export const TabGroupContext = React.createContext<TabGroupRegion | null>(null);

// In tab-group-region.tsx
import { TabGroupContext } from './tab-group-context';

export class TabGroupRegion extends React.Component<...> {
  render() {
    return (
      <TabGroupContext.Provider value={this}>
        <div {...this.props} onKeyDown={this._onKeyDown}>
          {this.props.children}
        </div>
      </TabGroupContext.Provider>
    );
  }
}

// Consumers use:
// - Class components: static contextType = TabGroupContext;
// - Function components: useContext(TabGroupContext)
```

### 2.2 `SheetToolbar` - Sheet Depth Context

**File:** `app/src/sheet-toolbar.tsx`

**Lines:**
- Line 225-227: `static childContextTypes = { sheetDepth: PropTypes.number };`
- Line 237-241: `getChildContext() { return { sheetDepth: this.props.depth }; }`

**Purpose:** Provides sheet depth to toolbar children.

### 2.3 `Sheet` - Sheet Depth Context

**File:** `app/src/sheet.tsx`

**Lines:**
- Line 42-44: `static childContextTypes = { sheetDepth: PropTypes.number };`
- Line 53-57: `getChildContext() { return { sheetDepth: this.props.depth }; }`

**Purpose:** Provides sheet depth to sheet children.

**Migration for 2.2 & 2.3:**

Since both `Sheet` and `SheetToolbar` provide the same context (`sheetDepth`), create a shared context:

```typescript
// Create: app/src/sheet-context.ts
import React from 'react';

export const SheetDepthContext = React.createContext<number>(0);

// In sheet.tsx and sheet-toolbar.tsx
import { SheetDepthContext } from './sheet-context';

// Replace getChildContext with:
render() {
  return (
    <SheetDepthContext.Provider value={this.props.depth}>
      {/* existing render content */}
    </SheetDepthContext.Provider>
  );
}
```

---

## Priority 3: Package Updates (Required)

### 3.1 Core React Packages

**File:** `app/package.json`

| Package | Current | Target |
|---------|---------|--------|
| `react` | 16.9.0 | ^17.0.2 |
| `react-dom` | 16.9.0 | ^17.0.2 |
| `react-test-renderer` | 16.9.0 | ^17.0.2 |

### 3.2 TypeScript Type Definitions

**File:** `package.json` (root)

| Package | Current | Target |
|---------|---------|--------|
| `@types/react` | ^16.8.5 | ^17.0.0 |
| `@types/react-dom` | ^16.8.2 | ^17.0.0 |
| `@types/react-test-renderer` | ^16.8.1 | ^17.0.0 |

### 3.3 Test Adapter

**File:** `app/package.json`

| Package | Current | Target |
|---------|---------|--------|
| `enzyme-adapter-react-16` | ^1.15.8 | Remove |
| `@wojtekmaj/enzyme-adapter-react-17` | - | ^0.8.0 (Add) |

**Note:** The community adapter `@wojtekmaj/enzyme-adapter-react-17` is not officially maintained but is widely used. Consider planning migration to React Testing Library for long-term stability.

### 3.4 Related Packages to Verify

These packages should be checked for React 17 compatibility:

| Package | Current | Notes |
|---------|---------|-------|
| `react-transition-group` | 1.2.1 | Very old, update to ^4.4.5 |
| `react-color` | ^2.19.3 | Should be compatible |
| `slate-react` | custom fork | May need testing |

---

## Priority 4: Test Infrastructure Updates

### 4.1 Enzyme Adapter Setup

**File:** Update test setup to use new adapter

```typescript
// In test setup file
import Enzyme from 'enzyme';
import Adapter from '@wojtekmaj/enzyme-adapter-react-17';

Enzyme.configure({ adapter: new Adapter() });
```

### 4.2 Type Definition Update

**File:** `package.json` (root)

```diff
- "@types/enzyme-adapter-react-16": "^1.0.5",
+ "@types/enzyme-adapter-react-17": "^0.6.0",
```

---

## Priority 5: Potential Runtime Issues (Review)

These patterns may need review but likely won't break:

### 5.1 Document-Level Event Listeners

React 17 attaches events to the root container instead of `document`. Code that uses `document.addEventListener` with `e.stopPropagation()` in React handlers may behave differently.

**Files to review:**

| File | Line | Pattern |
|------|------|---------|
| `app/src/components/resizable-region.tsx` | 188-189 | `document.addEventListener('mousemove/mouseup')` |
| `app/src/window-event-handler.ts` | 158+ | Various document listeners |
| `app/src/components/composer-editor/patch-chrome-ime.ts` | 30-99 | Document-level input handling |

**Mitigation:** If issues occur, use capture phase: `addEventListener('click', handler, { capture: true })`

### 5.2 Effect Cleanup Timing

React 17 runs effect cleanup asynchronously. Code relying on synchronous cleanup may have timing issues.

**Pattern to watch:**
```typescript
componentWillUnmount() {
  // If this expects immediate cleanup before unmount completes
  this.subscription.dispose();
}
```

---

## Migration Order

Recommended order of changes:

1. **Update deprecated lifecycles** (4 files) - Low risk, prevents warnings
2. **Update packages** - Required for React 17
3. **Update test adapter** - Required for tests to pass
4. **Run full test suite** - Identify any breakages
5. **Replace legacy context** (3 files) - Optional but recommended
6. **Verify runtime behavior** - Manual testing

---

## Verification Checklist

After migration, verify:

- [ ] `npm install` completes without errors
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm start` launches app without React warnings
- [ ] No deprecation warnings in console
- [ ] Tab navigation works (TabGroupRegion context)
- [ ] Sheet/toolbar rendering works (SheetDepth context)
- [ ] Calendar loads and displays events
- [ ] Message bodies render correctly
- [ ] Billing modal opens and functions
- [ ] Composer toggle buttons work

---

## Files Changed Summary

| Category | Files | Changes |
|----------|-------|---------|
| Deprecated Lifecycles | 4 | Rename `componentWillMount` → `componentDidMount` |
| Legacy Context | 3 | Replace with Context API |
| Package Updates | 2 | Update versions in package.json |
| Test Setup | 1-2 | Update enzyme adapter |
| **Total** | **~10** | |
