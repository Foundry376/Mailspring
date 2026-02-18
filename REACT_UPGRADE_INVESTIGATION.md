# React Upgrade Investigation: 16.9 → 17/18

## Current Setup

- **React version**: 16.9.0
- **React DOM version**: 16.9.0
- **Test library**: enzyme with enzyme-adapter-react-16
- **TypeScript types**: @types/react@^16.8.5, @types/react-dom@^16.8.2

---

## Summary

Upgrading from React 16.9 to React 17 or 18 is **possible but requires significant refactoring**. The codebase heavily uses patterns that are deprecated or removed in newer React versions.

| Effort Level | React 17 | React 18 |
|--------------|----------|----------|
| **Estimated** | Medium | High |
| **Breaking Changes** | Mostly warnings | Hard blockers |

---

## React 17 Breaking Changes Analysis

### 1. Event Delegation Changes (Low Risk)
React 17 attaches event handlers to the root DOM container instead of `document`.

**Impact on Mailspring:**
- ~30 usages of `document.addEventListener` found
- Most are for global events (keydown, mouseup, mousemove) that should continue to work
- **Potential issue**: Code using `e.stopPropagation()` in React handlers may behave differently with `document`-level listeners

**Files to review:**
- `app/src/components/resizable-region.tsx`
- `app/src/components/composer-editor/patch-chrome-ime.ts`
- `app/src/window-event-handler.ts`

### 2. Effect Cleanup Timing (Medium Risk)
Effect cleanup now runs asynchronously in React 17.

**Impact on Mailspring:**
- Components using refs in cleanup functions need review
- Any code assuming synchronous cleanup may break

### 3. onScroll No Longer Bubbles (Low Risk)
The `onScroll` event no longer bubbles to parent elements.

**Impact on Mailspring:**
- ~40 scroll handler usages found
- Most appear to be direct handlers, not relying on bubbling
- Review `app/src/components/scroll-region.tsx` for any bubbling assumptions

### 4. Returning `undefined` Throws (Low Risk)
Components wrapped in `forwardRef` or `memo` that return `undefined` now throw.

**No instances found** - components return `null` appropriately.

### 5. Event Pooling Removed (No Impact)
`e.persist()` is no longer needed.

**No usages of `e.persist()` found** - no changes needed.

---

## React 18 Breaking Changes Analysis

### 1. New Root API (REQUIRED) 🔴

`ReactDOM.render()` is deprecated; must use `createRoot()`.

**Files requiring changes (11 usages):**

| File | Line | Usage |
|------|------|-------|
| `app/src/app-env.ts` | 786 | Main app render |
| `app/src/flux/stores/popover-store.tsx` | 22, 31, 59 | Popover rendering |
| `app/src/flux/stores/modal-store.tsx` | 23, 36, 59 | Modal rendering |
| `app/internal_packages/onboarding/lib/decorators/create-page-for-form.tsx` | 195 | Form page render |
| `app/spec/spec-runner/gui-reporter.tsx` | 298 | Test reporter |
| `app/spec/spec-runner/react-test-utils-extensions.ts` | 26 | Test utils |

**Migration pattern:**
```typescript
// Before (React 16/17)
ReactDOM.render(<App />, container);

// After (React 18)
import { createRoot } from 'react-dom/client';
const root = createRoot(container);
root.render(<App />);
```

### 2. ReactDOM.findDOMNode Deprecation (HIGH IMPACT) 🔴

`findDOMNode` is deprecated and doesn't work in Strict Mode.

**~140 usages across the codebase!**

**Most affected files:**
- `app/src/components/evented-iframe.tsx` (12 usages)
- `app/src/components/scroll-region.tsx` (5 usages)
- `app/src/components/tokenizing-text-field.tsx` (4 usages)
- `app/src/components/editable-table.tsx` (4 usages)
- `app/src/components/key-commands-region.tsx` (4 usages)
- `app/src/components/attachment-items.tsx` (4 usages)
- `app/src/components/decorators/has-tutorial-tip.tsx` (5 usages)

**Migration pattern:**
```typescript
// Before
ReactDOM.findDOMNode(this)

// After - use refs
class MyComponent extends React.Component {
  private myRef = React.createRef<HTMLDivElement>();

  render() {
    return <div ref={this.myRef}>...</div>;
  }
}
```

### 3. String Refs Deprecation (HIGH IMPACT) 🔴

String refs (`ref="myRef"` / `this.refs.myRef`) are deprecated.

**42 usages across 13 files:**
- `app/src/components/tokenizing-text-field.tsx` (7 usages)
- `app/src/components/editable-table.tsx` (7 usages)
- `app/internal_packages/thread-list/lib/thread-list.tsx` (5 usages)
- `app/src/components/scroll-region.tsx` (4 usages)
- `app/src/components/injected-component.tsx` (4 usages)

**Migration pattern:**
```typescript
// Before
<input ref="myInput" />
this.refs.myInput.focus();

// After
private inputRef = React.createRef<HTMLInputElement>();
<input ref={this.inputRef} />
this.inputRef.current?.focus();
```

### 4. Legacy Context API (MEDIUM IMPACT) 🟡

`childContextTypes` and `getChildContext` are deprecated.

**3 files affected:**
- `app/src/components/tab-group-region.tsx`
- `app/src/sheet-toolbar.tsx`
- `app/src/sheet.tsx`

**Migration pattern:**
```typescript
// Before
static childContextTypes = { theme: PropTypes.object };
getChildContext() { return { theme: this.state.theme }; }

// After
const ThemeContext = React.createContext(defaultValue);
<ThemeContext.Provider value={this.state.theme}>
  {children}
</ThemeContext.Provider>
```

### 5. Deprecated Lifecycle Methods (MEDIUM IMPACT) 🟡

`componentWillMount`, `componentWillReceiveProps`, `componentWillUpdate` are removed.

**5 files still using deprecated methods:**
- `app/internal_packages/message-list/lib/message-item-body.tsx` - `componentWillMount`
- `app/internal_packages/main-calendar/lib/core/mailspring-calendar.tsx`
- `app/src/components/billing-modal.tsx` - `componentWillMount`
- `app/src/components/bind-global-commands.ts`
- `app/src/components/metadata-composer-toggle-button.tsx`

**Note:** Previous PR #2546 addressed many of these, but 5 remain.

### 6. Strict Mode Double-Invocation (TESTING IMPACT) 🟡

React 18 Strict Mode unmounts/remounts components to test resilience.

**Impact:** May expose bugs in components with side effects in lifecycle methods.

### 7. TypeScript: Children Prop Must Be Explicit 🟡

In React 18 types, `children` must be explicitly declared.

**Impact:** ~72 class components may need type updates.

### 8. Test Infrastructure Overhaul Required 🔴

**Current setup:**
- `enzyme` with `enzyme-adapter-react-16`
- Custom test utils using `ReactDOM.render` and `unmountComponentAtNode`

**Problems:**
- No official enzyme adapter for React 17/18
- Community adapter (`@wojtekmaj/enzyme-adapter-react-17`) exists but is unmaintained
- `react-dom/test-utils` removed `renderIntoDocument` in React 18

**Recommended migration:** Switch to React Testing Library

---

## Dependency Updates Required

### For React 17:
```json
{
  "react": "^17.0.2",
  "react-dom": "^17.0.2",
  "react-test-renderer": "^17.0.2",
  "@types/react": "^17.0.0",
  "@types/react-dom": "^17.0.0"
}
```

### For React 18:
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-test-renderer": "^18.2.0",
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0"
}
```

### Related packages needing updates:
- `enzyme-adapter-react-16` → Remove or find alternative
- `react-transition-group` → Update to latest (compatible)
- `slate-react` (custom fork) → May need updates
- `react-color` → Check compatibility

---

## Recommended Upgrade Path

### Phase 1: Preparation (Can be done now on React 16.9)
1. ✅ Replace `componentWillReceiveProps` (PR #2546 done, 5 remaining)
2. Replace `componentWillMount` with `componentDidMount`
3. Replace string refs with `createRef`
4. Replace `findDOMNode` with explicit refs
5. Replace legacy context with Context API

### Phase 2: React 17 Upgrade
1. Update React packages to 17.x
2. Run full test suite, fix any event-related issues
3. Address any effect cleanup timing issues
4. Update or replace enzyme adapter

### Phase 3: React 18 Upgrade
1. Migrate `ReactDOM.render` to `createRoot`
2. Migrate `unmountComponentAtNode` to `root.unmount()`
3. Update TypeScript types for explicit children
4. Test with Strict Mode enabled
5. Consider migrating tests to React Testing Library

---

## Effort Estimates

| Task | Files | Complexity |
|------|-------|------------|
| Replace `ReactDOM.render` | 6 | Low |
| Replace `findDOMNode` | ~50 | High |
| Replace string refs | 13 | Medium |
| Replace legacy context | 3 | Medium |
| Fix deprecated lifecycles | 5 | Low |
| Update test infrastructure | ~30 spec files | High |

**Total estimated scope:**
- React 17: ~20 files, mostly mechanical changes
- React 18: ~80+ files, significant refactoring of refs pattern

---

## Recommendation

**Short-term:** Upgrade to **React 17** first. This provides:
- Better error handling
- Gradual upgrade path to 18
- Most deprecated APIs still work (with warnings)
- Lower risk

**Long-term:** Plan for **React 18** upgrade but address the ~140 `findDOMNode` usages first, as this is the largest blocker.

---

## References

- [React 17 Release Notes](https://legacy.reactjs.org/blog/2020/10/20/react-v17.html)
- [React 18 Upgrade Guide](https://react.dev/blog/2022/03/08/react-18-upgrade-guide)
- [Migrating from findDOMNode](https://react.dev/reference/react-dom/findDOMNode#alternatives)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
