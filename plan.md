# Saved Search Feature — Implementation Plan

## Overview

Add a "Saved Searches" section to the left sidebar, appearing between the standard items (Inbox, Unread, Starred, etc.) and the user folders/labels section. Users save a search by clicking a "pin" button that appears in the search bar while viewing search results. The saved search captures the query string and account IDs at the moment it's saved, so the user doesn't need a complex authoring UI.

## Architecture Summary

The feature involves four pieces of work:

1. **A new `SavedSearchMailboxPerspective`** — a `MailboxPerspective` subclass that stores a name, query, and account IDs, and provides a `threads()` subscription using the existing `SearchQuerySubscription`.
2. **Persistence via `AppEnv.config`** — saved searches stored as a JSON array at the config key `core.savedSearches`. Using config (not savedState) ensures changes trigger observable events and the data survives window reloads.
3. **A new sidebar section** — built inside `SidebarSection` / `SidebarStore`, rendered as an `OutlineView` between the standard section and user sections in `AccountSidebar`.
4. **A "Save Search" button in the search bar** — visible when a search is active, allowing the user to pin the current search.

## Detailed Steps

### Step 1: Create `SavedSearchMailboxPerspective`

**File:** `app/internal_packages/thread-search/lib/saved-search-mailbox-perspective.tsx`

This is a new subclass of `MailboxPerspective`:

```typescript
class SavedSearchMailboxPerspective extends MailboxPerspective {
  searchQuery: string;
  savedSearchId: string;

  constructor(accountIds: string[], searchQuery: string, savedSearchName: string, savedSearchId: string) {
    super(accountIds);
    this.searchQuery = searchQuery;
    this.name = savedSearchName;
    this.iconName = 'search.png';
    this.savedSearchId = savedSearchId;
  }

  threads() {
    // Reuse SearchQuerySubscription with trash/spam exclusion logic
    let finalQuery = this.searchQuery.trim();
    if (!/in: ?['"]?(trash|spam)/gi.test(finalQuery)) {
      finalQuery = `(${finalQuery}) NOT (in:trash OR in:spam)`;
    }
    return new SearchQuerySubscription(finalQuery, this.accountIds);
  }

  isEqual(other) {
    return super.isEqual(other) && other.searchQuery === this.searchQuery;
  }

  canReceiveThreadsFromAccountIds() { return false; }

  emptyMessage() { return 'No messages match this saved search.'; }
}
```

Also add serialization support in `MailboxPerspective.fromJSON()` so this perspective can be restored from `AppEnv.savedState.perspective` if the user was viewing a saved search when the app closed.

### Step 2: Saved search data model and config persistence

**File:** `app/internal_packages/thread-search/lib/saved-search-store.ts`

Define a store that manages CRUD operations for saved searches, persisted via `AppEnv.config`:

```typescript
interface SavedSearch {
  id: string;       // UUID
  name: string;     // Display name (user can rename later)
  query: string;    // The full search query string captured at save time
  accountIds: string[];  // Account IDs in scope at save time
}
```

Config key: `core.savedSearches` — an array of `SavedSearch` objects.

Store API:
- `savedSearches(): SavedSearch[]` — returns current list
- `addSavedSearch(query: string, accountIds: string[]): void` — creates a new saved search, auto-naming it from the query
- `removeSavedSearch(id: string): void` — deletes by id
- `renameSavedSearch(id: string, newName: string): void` — renames
- `perspectiveForSearch(savedSearch: SavedSearch): SavedSearchMailboxPerspective`

The store listens to `AppEnv.config.onDidChange('core.savedSearches', ...)` so it triggers when data changes.

### Step 3: Add "Save Search" button to the search bar

**File:** `app/internal_packages/thread-search/lib/thread-search-bar.tsx`

When the current perspective is a `SearchMailboxPerspective` (i.e. the user has submitted a search and is viewing results), show a small bookmark/pin icon button next to the "X" clear button. Clicking it:

1. Reads the current `searchQuery` and `accountIds` from the active `SearchMailboxPerspective`
2. Calls `SavedSearchStore.addSavedSearch(query, accountIds)`
3. Shows brief feedback (the icon fills in / changes state)

If the current query is already saved, the button appears filled/active. Clicking it again removes the saved search.

### Step 4: New "Saved Searches" sidebar section

**Files:**
- `app/internal_packages/account-sidebar/lib/sidebar-section.ts` — add `SidebarSection.forSavedSearches()` factory method
- `app/internal_packages/account-sidebar/lib/sidebar-store.ts` — add `_sections.SavedSearches` and expose via `savedSearchesSection()`
- `app/internal_packages/account-sidebar/lib/components/account-sidebar.tsx` — render the new section between standard and user sections

`SidebarSection.forSavedSearches()` builds an `ISidebarSection` titled "Saved Searches":
- Each saved search becomes a `SidebarItem.forPerspective(...)` using `SavedSearchMailboxPerspective`
- Items are deletable (right-click → Remove) and editable (right-click → Rename)
- The section is collapsible
- The section only renders if there are saved searches (empty = hidden)
- `onDelete` removes the saved search from config
- `onEdited` renames the saved search in config

The `SidebarStore` needs to:
- Import `SavedSearchStore` and listen to it
- Rebuild the saved searches section in `_updateSections()`
- Filter saved searches by the current `sidebarAccountIds` (show only those whose accountIds intersect the visible accounts)

### Step 5: Wire up perspective serialization

**File:** `app/src/mailbox-perspective.ts`

Add a case in `MailboxPerspective.fromJSON()` for `SavedSearchMailboxPerspective` so the app can restore the perspective on relaunch if the user was viewing a saved search when they closed the app.

### Step 6: Add a search icon asset

**File:** `app/internal_packages/thread-search/assets/` or use an existing icon

We need a small search/pin icon for the sidebar items. We can reuse the existing `searchloupe.png` icon or provide a `saved-search.png`. The save button in the search bar can reuse existing bookmark-style icons or a small pin icon.

### Step 7: Styles

**Files:**
- `app/internal_packages/thread-search/styles/` — styles for the save button in the search bar
- `app/internal_packages/account-sidebar/styles/` — any adjustments for the saved searches section (likely none needed since it uses the standard OutlineView)

## Key Design Decisions

1. **Config vs. Database**: Using `AppEnv.config` (not the sync engine database) because saved searches are local UI state, not email data. Config provides `onDidChange` observability and JSON file persistence. `AppEnv.savedState` was considered but doesn't have change notification events.

2. **Capture at save time**: The `accountIds` and `query` are captured when the user clicks save. This means if accounts are later removed, the saved search still references them — we filter out invalid account IDs at render time.

3. **No authoring UI**: The user's flow is: perform a search → click the save/pin button → done. Renaming is available via right-click context menu in the sidebar. No modal or dialog needed.

4. **Reuse of SearchQuerySubscription**: The `SavedSearchMailboxPerspective.threads()` method uses the same `SearchQuerySubscription` class that powers live search, so query parsing, result ordering, and trash/spam exclusion all work identically.

5. **Sidebar placement**: The "Saved Searches" section sits between the standard section (Inbox, Starred, etc.) and the per-account folders/labels sections. It only appears if the user has at least one saved search.

## File Change Summary

| File | Change |
|------|--------|
| `app/internal_packages/thread-search/lib/saved-search-mailbox-perspective.tsx` | **New** — SavedSearchMailboxPerspective class |
| `app/internal_packages/thread-search/lib/saved-search-store.ts` | **New** — SavedSearchStore for CRUD + config persistence |
| `app/internal_packages/thread-search/lib/main.tsx` | Register SavedSearchStore activation |
| `app/internal_packages/thread-search/lib/thread-search-bar.tsx` | Add save/pin button when search is active |
| `app/src/mailbox-perspective.ts` | Add fromJSON case for SavedSearchMailboxPerspective |
| `app/internal_packages/account-sidebar/lib/sidebar-section.ts` | Add `forSavedSearches()` factory |
| `app/internal_packages/account-sidebar/lib/sidebar-store.ts` | Add saved searches section, listen to SavedSearchStore |
| `app/internal_packages/account-sidebar/lib/components/account-sidebar.tsx` | Render saved searches section |
| `app/internal_packages/account-sidebar/lib/types.ts` | Add savedSearchesSection to state interface (minor) |
| `app/internal_packages/thread-search/styles/thread-search-bar.less` | Styles for save button |
