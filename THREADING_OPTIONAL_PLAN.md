# Making Threading/Conversation View Optional - Implementation Plan

## Executive Summary

This document outlines a plan to make Mailspring's threading/conversation view optional, allowing users to view individual messages in a flat list instead of grouped by conversation/thread. This feature has been highly requested (10,170 views) and can be implemented entirely in the frontend without requiring changes to the mailsync backend.

## Problem Analysis

### Current Behavior
- Mailspring groups messages by thread (conversation) by default
- All UI displays are thread-centric (thread list, thread view)
- The `Thread` model aggregates multiple `Message` models
- Users cannot view or interact with individual messages independently
- This is problematic for:
  - Users who prefer Gmail-style "conversation view off" mode
  - Email workflows that need per-message operations
  - Users coming from traditional email clients (Thunderbird, Outlook)

### User Requirements
Based on the feature request, users want:
1. **Option to disable conversation threading** - View messages as individual items
2. **Per-message operations** - Archive, delete, move single messages without affecting the thread
3. **Configuration setting** - Easy toggle in preferences
4. **Maintain both modes** - Don't break existing threading for users who like it

## Technical Architecture Analysis

### Current Data Flow

```
mailsync (C++) -> SQLite DB -> DatabaseStore -> QuerySubscription<Thread>
                                                          ↓
                                               ThreadListDataSource
                                                          ↓
                                                   ThreadList (UI)
                                                          ↓
                                               MultiselectList Component
```

### Key Components

1. **Thread Model** (`/app/src/flux/models/thread.ts`)
   - Represents grouped messages
   - Has `messages()` method to fetch related messages
   - Properties: subject, snippet, participants, unread, starred, etc.

2. **Message Model** (`/app/src/flux/models/message.ts`)
   - Individual email messages
   - Properties: threadId, subject, from, to, body, date, etc.
   - Already queryable independently from threads

3. **ThreadListDataSource** (`/app/internal_packages/thread-list/lib/thread-list-data-source.ts`)
   - Observes thread query subscription
   - Joins messages to threads via `_flatMapJoiningMessages`
   - Attaches `__messages` array to each thread for display

4. **ThreadList Component** (`/app/internal_packages/thread-list/lib/thread-list.tsx`)
   - Main list display component
   - Uses `MultiselectList` for rendering
   - Switches between "wide" and "narrow" column layouts
   - Handles selection, drag-drop, keyboard shortcuts

5. **ThreadListStore** (`/app/internal_packages/thread-list/lib/thread-list-store.ts`)
   - Manages thread list state
   - Creates data sources from perspective queries
   - Handles focus and selection management

6. **MailboxPerspective** (`/app/src/mailbox-perspective.ts`)
   - Defines queries for different views (inbox, sent, labels, etc.)
   - Has `threads()` method that returns `QuerySubscription<Thread>`
   - **Key insight**: Could add `messages()` method for non-threaded view

## Implementation Strategy

### Phase 1: Configuration & Settings (Low Risk)

#### 1.1 Add Configuration Schema
**File**: `/app/src/config-schema.ts`

Add new setting under `core.reading.properties`:
```typescript
disableThreading: {
  type: 'boolean',
  default: false,
  title: localized('Disable conversation threading (show individual messages)'),
  note: localized(
    'When enabled, messages will be displayed individually instead of grouped by conversation. ' +
    'This is similar to Gmail\'s "Conversation view off" setting.'
  ),
}
```

#### 1.2 Add UI Control
**File**: `/app/internal_packages/preferences/lib/tabs/preferences-general.tsx`

The setting will automatically appear in Reading preferences via `ConfigSchemaItem`.

### Phase 2: Message-Based Data Source (Medium Risk)

#### 2.1 Create MessageListDataSource
**New File**: `/app/internal_packages/thread-list/lib/message-list-data-source.ts`

Create a parallel data source that works with messages instead of threads:
```typescript
import {
  Rx,
  ObservableListDataSource,
  DatabaseStore,
  Message,
  QueryResultSet,
  QuerySubscription,
} from 'mailspring-exports';

class MessageListDataSource extends ObservableListDataSource {
  constructor(subscription: QuerySubscription<Message>) {
    const $resultSetObservable = Rx.Observable.fromNamedQuerySubscription(
      'message-list',
      subscription
    );
    super($resultSetObservable, subscription.replaceRange.bind(subscription));
  }
}

export default MessageListDataSource;
```

#### 2.2 Extend MailboxPerspective
**File**: `/app/src/mailbox-perspective.ts`

Add `messages()` method to return messages instead of threads:
```typescript
messages(): QuerySubscription<Message> {
  const query = DatabaseStore.findAll<Message>(Message)
    .where([Message.attributes.categories.containsAny(this.categories().map(c => c.id))])
    .limit(0)
    .include(Message.attributes.body)
    .order(Message.attributes.date.descending());

  if (!['spam', 'trash'].includes(this.categoriesSharedRole())) {
    query.where({ isHidden: false });
  }

  return query.subscribe();
}
```

### Phase 3: Unified Item Model (High Risk)

To minimize code duplication, create a unified interface that works with both threads and messages.

#### 3.1 Create ThreadOrMessage Type
**New File**: `/app/internal_packages/thread-list/lib/thread-or-message.ts`

```typescript
import { Thread, Message } from 'mailspring-exports';

// Discriminated union type
export type ThreadOrMessage = 
  | { type: 'thread'; item: Thread; __messages?: Message[] }
  | { type: 'message'; item: Message };

export function isThread(item: ThreadOrMessage): item is { type: 'thread'; item: Thread } {
  return item.type === 'thread';
}

export function isMessage(item: ThreadOrMessage): item is { type: 'message'; item: Message } {
  return item.type === 'message';
}

// Adapter functions to provide unified interface
export class ItemAdapter {
  static getSubject(item: ThreadOrMessage): string {
    return isThread(item) ? item.item.subject : item.item.subject;
  }

  static getSnippet(item: ThreadOrMessage): string {
    return isThread(item) ? item.item.snippet : item.item.snippet;
  }

  static isUnread(item: ThreadOrMessage): boolean {
    return isThread(item) ? item.item.unread : item.item.unread;
  }

  static isStarred(item: ThreadOrMessage): boolean {
    return isThread(item) ? item.item.starred : item.item.starred;
  }

  static getDate(item: ThreadOrMessage): Date {
    return isThread(item) 
      ? item.item.lastMessageReceivedTimestamp 
      : item.item.date;
  }

  static getParticipants(item: ThreadOrMessage): Contact[] {
    return isThread(item) ? item.item.participants : [item.item.from[0]];
  }

  static getCategories(item: ThreadOrMessage): Category[] {
    return isThread(item) ? item.item.categories : item.item.folder ? [item.item.folder] : [];
  }

  static getId(item: ThreadOrMessage): string {
    return item.item.id;
  }

  static getAccountId(item: ThreadOrMessage): string {
    return item.item.accountId;
  }
}
```

### Phase 4: Update UI Components (High Risk)

#### 4.1 Modify ThreadListStore
**File**: `/app/internal_packages/thread-list/lib/thread-list-store.ts`

Update to create appropriate data source based on configuration:
```typescript
createListDataSource = () => {
  if (typeof this._dataSourceUnlisten === 'function') {
    this._dataSourceUnlisten();
  }

  if (this._dataSource) {
    this._dataSource.cleanup();
    this._dataSource = null;
  }

  const disableThreading = AppEnv.config.get('core.reading.disableThreading');
  const perspective = FocusedPerspectiveStore.current();

  if (disableThreading) {
    // Use message-based data source
    const messagesSubscription = perspective.messages();
    if (messagesSubscription) {
      this._dataSource = new MessageListDataSource(messagesSubscription);
      this._dataSourceUnlisten = this._dataSource.listen(this._onDataChanged, this);
    } else {
      this._dataSource = new ListTabular.DataSource.Empty();
    }
  } else {
    // Use existing thread-based data source
    const threadsSubscription = perspective.threads();
    if (threadsSubscription) {
      this._dataSource = new ThreadListDataSource(threadsSubscription);
      this._dataSourceUnlisten = this._dataSource.listen(this._onDataChanged, this);
    } else {
      this._dataSource = new ListTabular.DataSource.Empty();
    }
  }

  this.trigger(this);
  Actions.setFocus({ collection: 'thread', item: null });
};
```

#### 4.2 Update ThreadList Component Columns
**File**: `/app/internal_packages/thread-list/lib/thread-list-columns.tsx`

Modify columns to work with both threads and messages:
```typescript
// Add type guards and adapters
const getItemSubject = (item: Thread | Message): string => {
  return item.subject;
};

const getItemSnippet = (item: Thread | Message): string => {
  if (item instanceof Thread) {
    const messages = item.__messages || [];
    if (messages.length === 0) return item.snippet;
    for (let ii = messages.length - 1; ii >= 0; ii--) {
      if (messages[ii].snippet) return messages[ii].snippet;
    }
    return item.snippet;
  } else {
    return item.snippet;
  }
};

// Update column resolvers
const c3 = new ListTabular.Column({
  name: 'Message',
  flex: 4,
  resolver: item => {
    const subject = getItemSubject(item);
    const snippet = getItemSnippet(item);
    // ... rest of rendering logic
  },
});
```

#### 4.3 Update ThreadListParticipants
**File**: `/app/internal_packages/thread-list/lib/thread-list-participants.tsx`

Modify to handle both threads and individual messages:
```typescript
getTokensFromMessages = () => {
  const item = this.props.thread; // Rename to this.props.item
  
  if (item instanceof Message) {
    // For individual message, just show from/to
    const field = item.isFromMe() ? 'to' : 'from';
    return item[field].map(contact => ({ contact, unread: item.unread }));
  }
  
  // Existing thread logic
  const messages = item.__messages;
  // ... existing code
};
```

### Phase 5: Message-Level Actions (Medium Risk)

#### 5.1 Update TaskFactory
Tasks already support operating on individual messages via `messageIds` parameter. Ensure UI actions pass correct IDs:

**File**: `/app/internal_packages/thread-list/lib/thread-list.tsx`

Update action handlers to work with selected items:
```typescript
_onArchive = () => {
  const items = this._threadsForKeyboardAction();
  if (!items) return;

  const disableThreading = AppEnv.config.get('core.reading.disableThreading');
  
  if (disableThreading) {
    const messages = items.filter(i => i instanceof Message);
    TaskFactory.tasksForArchiving({
      messages: messages,
      source: 'Keyboard Shortcut',
    });
  } else {
    const threads = items;
    TaskFactory.tasksForArchiving({
      threads: threads,
      source: 'Keyboard Shortcut',
    });
  }
};
```

### Phase 6: Configuration Listener & Reload (Low Risk)

#### 6.1 Listen for Configuration Changes
**File**: `/app/internal_packages/thread-list/lib/thread-list-store.ts`

Add configuration listener to recreate data source when setting changes:
```typescript
constructor() {
  super();

  this.listenTo(FocusedPerspectiveStore, this._onPerspectiveChanged);
  
  // Listen for threading setting changes
  AppEnv.config.onDidChange('core.reading.disableThreading', () => {
    this.createListDataSource();
  });
}
```

## Testing Strategy

### Unit Tests
1. **MessageListDataSource Tests**
   - Verify message subscription works correctly
   - Test sorting and filtering

2. **ItemAdapter Tests**
   - Verify all adapter methods work for both threads and messages
   - Test edge cases (empty participants, missing data)

3. **Column Resolver Tests**
   - Test rendering with thread data
   - Test rendering with message data

### Integration Tests
1. **Switching Modes**
   - Toggle setting and verify list recreates
   - Verify selected items clear appropriately
   - Test with different perspectives (inbox, sent, labels)

2. **Actions**
   - Archive individual message
   - Delete individual message
   - Star/unstar message
   - Mark read/unread
   - Move to folder
   - Apply labels

3. **Edge Cases**
   - Empty mailbox
   - Single message threads
   - Large threads (100+ messages)
   - Draft messages
   - Search results

### Manual Testing Checklist
- [ ] Enable/disable setting in preferences
- [ ] Switch between threaded and non-threaded view
- [ ] Verify list displays correctly in both modes
- [ ] Test all keyboard shortcuts in both modes
- [ ] Test drag-and-drop in both modes
- [ ] Test context menu actions in both modes
- [ ] Test quick actions (archive, trash) in both modes
- [ ] Verify message body view works in both modes
- [ ] Test with multiple accounts
- [ ] Test with Gmail (labels) vs IMAP (folders)

## Implementation Phases & Timeline

### Phase 1: Foundation (Week 1)
- Add configuration schema ✓
- Add preferences UI ✓
- Create MessageListDataSource ✓
- Add messages() method to MailboxPerspective ✓
- **Deliverable**: Setting exists, no visual change yet

### Phase 2: Core Data Flow (Week 2)
- Create ThreadOrMessage types and adapters ✓
- Update ThreadListStore to switch data sources ✓
- Basic rendering with message data ✓
- **Deliverable**: Can view individual messages (basic)

### Phase 3: UI Refinement (Week 3)
- Update all column renderers ✓
- Update participants display ✓
- Update icons and indicators ✓
- Fix layout issues ✓
- **Deliverable**: Message list looks professional

### Phase 4: Actions & Interactions (Week 4)
- Update keyboard shortcuts ✓
- Update context menu ✓
- Update quick actions ✓
- Update drag-and-drop ✓
- **Deliverable**: All interactions work

### Phase 5: Polish & Testing (Week 5)
- Write unit tests ✓
- Integration testing ✓
- Bug fixes ✓
- Performance optimization ✓
- **Deliverable**: Production-ready feature

## Risks & Mitigations

### Risk 1: Performance Degradation
**Risk**: Showing individual messages instead of threads could result in much longer lists, causing performance issues.

**Mitigation**:
- Use same virtualization (MultiselectList already handles this)
- Limit query results same as threads (default 1000)
- Monitor performance metrics
- Add pagination if needed

### Risk 2: Code Duplication
**Risk**: Maintaining two parallel code paths (threaded vs non-threaded) could lead to bugs and maintenance burden.

**Mitigation**:
- Use adapter pattern to unify interfaces
- Share as much code as possible
- Comprehensive test coverage
- Document which components are mode-aware

### Risk 3: Breaking Existing Features
**Risk**: Changes to core components could break existing threading behavior.

**Mitigation**:
- Make non-threaded mode opt-in (default off)
- Extensive testing of threaded mode after changes
- Feature flag for gradual rollout
- Easy rollback plan

### Risk 4: Incomplete Message Data
**Risk**: Message model might not have all data that Thread model aggregates (e.g., participant list from multiple messages).

**Mitigation**:
- Audit Message model completeness
- Add computed properties if needed
- Include message body in queries for snippet
- Test with real email data

## Future Enhancements

### Phase 6 (Optional): Enhanced Message View
- Show thread count indicator on messages
- "Expand thread" action to temporarily group related messages
- Better subject line handling (Re:, Fwd: indicators)

### Phase 7 (Optional): Message View Optimizations
- Show "part of thread" indicator with quick navigation
- Collapse duplicate recipients in message lists
- Smart grouping (same subject, recent timing)

## Success Criteria

1. **Functional**: Users can toggle threading on/off
2. **Performant**: No noticeable slowdown with 1000+ messages
3. **Complete**: All actions work in both modes
4. **Stable**: No regressions in existing threading mode
5. **Tested**: >90% code coverage for new components
6. **Documented**: Clear user documentation of feature

## Rollout Plan

### Beta Release
1. Implement feature behind config flag
2. Release to beta users
3. Gather feedback
4. Fix bugs

### Stable Release
1. Enable by default for new users (optional)
2. Keep off by default for existing users
3. Add discovery UI (tip/tutorial)
4. Monitor crash reports and performance

## Conclusion

Making threading optional is entirely feasible within the frontend without touching mailsync. The key is to:
1. Create parallel message-based data sources
2. Use adapters to unify thread/message interfaces
3. Update UI components to handle both models
4. Ensure all actions work with message IDs

The implementation is moderately complex but well-contained, with clear boundaries and minimal risk to existing functionality.
