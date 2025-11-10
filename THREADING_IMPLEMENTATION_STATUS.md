# Threading Optional Feature - Implementation Status

## Completed Work

### Phase 1: Configuration & Settings ✅ COMPLETE

1. **Added Configuration Schema** (`/app/src/config-schema.ts`)
   - Added `core.reading.disableThreading` boolean setting
   - Default: `false` (threading enabled by default)
   - Includes user-friendly title and explanatory note
   - Will automatically appear in Preferences → Reading section

2. **UI Control** ✅ AUTO-GENERATED
   - Setting will automatically render via existing `ConfigSchemaItem` component
   - No additional UI code needed

### Phase 2: Message-Based Data Source ✅ COMPLETE

1. **Extended MailboxPerspective** (`/app/src/mailbox-perspective.ts`)
   - Added `Message` import at top of file
   - Added `messages()` method to `CategoryMailboxPerspective` class
   - Returns `QuerySubscription<Message>` for non-threaded view
   - Queries messages directly from database by folder
   - Handles spam/trash filtering
   - Orders by date descending
   - **Note**: Current implementation has limitations:
     - Only handles single folder (IMAP)
     - Gmail labels need OR query support for multiple labels
     - Falls back to empty result set for complex cases

2. **Created MessageListDataSource** (`/app/internal_packages/thread-list/lib/message-list-data-source.ts`)
   - New file created
   - Extends `ObservableListDataSource`
   - Much simpler than ThreadListDataSource (no message joining needed)
   - Uses `MutableQuerySubscription<Message>`
   - Ready to be integrated into ThreadListStore

## Remaining Work

### Phase 3: Unified Item Model ✅ COMPLETE

**Critical for proper implementation**

Created:
- `/app/internal_packages/thread-list/lib/thread-or-message.ts` ✅
  - Discriminated union type `ThreadOrMessage`
  - Type guards: `isThread()`, `isMessage()`, `isThreadItem()`, `isMessageItem()`
  - `ItemAdapter` class with 20+ static methods:
    - `getSubject()`, `getSnippet()`, `isUnread()`, `isStarred()`
    - `getDate()`, `getSentDate()`, `getParticipants()`, `getFrom()`, `getTo()`
    - `getCategories()`, `getId()`, `getAccountId()`, `getThreadId()`
    - `isDraft()`, `getAttachmentCount()`, `getFiles()`
    - `getMessages()`, `getMessageCount()`, `isFromMe()`
    - `wrap()`, `unwrap()`

**Why this is critical**: Thread and Message models have slightly different properties. Creating a unified adapter layer allows all UI components to work with both types without massive code duplication.

### Phase 4: Update UI Components ✅ COMPLETE

**High complexity, high risk**

#### 4.1 ThreadListStore ✅ COMPLETE (`/app/internal_packages/thread-list/lib/thread-list-store.ts`)
- ✅ Added `Message` import
- ✅ Added `MessageListDataSource` import
- ✅ Added `MutableQuerySubscription` import
- ✅ Added config listener: `AppEnv.config.onDidChange('core.reading.disableThreading')`
- ✅ Modified `createListDataSource()` to check config setting
- ✅ Creates `MessageListDataSource` when threading disabled
- ✅ Creates `ThreadListDataSource` when threading enabled (current behavior)
- ✅ Handles fallback when perspective doesn't support messages
- ✅ Data source switching on config change works automatically

#### 4.2 Thread List Columns ✅ COMPLETE (`/app/internal_packages/thread-list/lib/thread-list-columns.tsx`)
- ✅ Updated all column resolvers to accept `Thread | Message`
- ✅ Using ItemAdapter for unified property access (getSubject, getSnippet, isStarred, etc.)
- ✅ Updated attachment detection logic
- ✅ Updated draft detection logic
- ✅ Updated both wide and narrow column layouts

#### 4.3 ThreadListParticipants ✅ COMPLETE (`/app/internal_packages/thread-list/lib/thread-list-participants.tsx`)
- ✅ Updated to accept `Thread | Message`
- ✅ Using ItemAdapter.getMessages() and ItemAdapter.getParticipants()
- ✅ Handles both single messages and threads with multiple messages
- ✅ Properly renders participants for both types

#### 4.4 ThreadListIcon ✅ COMPLETE (`/app/internal_packages/thread-list/lib/thread-list-icon.tsx`)
- ✅ Updated to accept `Thread | Message`
- ✅ Using ItemAdapter for property access
- ✅ Handles starring for both threads and messages (using ChangeStarredTask directly)
- ✅ Shows appropriate icons based on message/thread state

#### 4.5 Quick Actions ✅ COMPLETE (`/app/internal_packages/thread-list/lib/thread-list-quick-actions.tsx`)
- ✅ ThreadArchiveQuickAction updated for `Thread | Message`
- ✅ ThreadTrashQuickAction updated for `Thread | Message`
- ✅ Using task classes directly (ChangeFolderTask, ChangeLabelsTask) for message support
- ✅ Proper category checking for both types

#### 4.6 Supporting Components ✅ COMPLETE
- ✅ MailLabelSet (`/app/src/components/mail-label-set.tsx`) - Updated to accept Thread | Message
- ✅ MailImportantIcon (`/app/src/components/mail-important-icon.tsx`) - Updated to accept Thread | Message

### Phase 5: Message-Level Actions ⏳ NOT STARTED
- Update all column resolvers to accept `Thread | Message`
- Use `ItemAdapter` for unified property access
- Special handling for:
  - Participants (messages have from/to, threads have aggregated participants)
  - Snippet (messages have direct snippet, threads may need message lookup)
  - Attachment indicators
  - Draft indicators
  - Message count (N/A for individual messages)

#### 4.3 ThreadListParticipants (`/app/internal_packages/thread-list/lib/thread-list-participants.tsx`)
- Rename prop from `thread` to `item`
- Add type checking for Thread vs Message
- For Message: show from (if received) or to (if sent)
- For Thread: use existing logic with `__messages`
- Handle edge cases (no participants, drafts, etc.)

#### 4.4 ThreadListIcon (`/app/internal_packages/thread-list/lib/thread-list-icon.tsx`)
- Accept both Thread and Message
- For Message: simpler logic (no __messages to check)
- For Thread: existing logic

#### 4.5 ThreadList Component (`/app/internal_packages/thread-list/lib/thread-list.tsx`)
- Update `_threadsForKeyboardAction()` to return generic items
- Update all action handlers to detect Thread vs Message
- Pass correct IDs to tasks

### Phase 5: Message-Level Actions (NOT STARTED)

All existing tasks already support `messageIds`:
- `ChangeFolderTask`
- `ChangeLabelsTask`
- `ChangeUnreadTask`
- `ChangeStarredTask`
- `ArchiveTask`
- `TrashTask`

**What needs updating:**
- Action handlers in ThreadList component
- Context menu generation
- Drag & drop handlers
- Quick action buttons

**Pattern:**
```typescript
const disableThreading = AppEnv.config.get('core.reading.disableThreading');

if (disableThreading) {
  const messages = selectedItems.filter(i => i instanceof Message);
  TaskFactory.tasksForArchiving({
    messages: messages,
    source: 'Keyboard Shortcut',
  });
} else {
  const threads = selectedItems;
  TaskFactory.tasksForArchiving({
    threads: threads,
    source: 'Keyboard Shortcut',
  });
}
```

### Phase 6: Configuration Listener & Reload (NOT STARTED)

Simple addition to ThreadListStore constructor - already specified in Phase 4.1.

## Technical Challenges Identified

### 1. Message Query Complexity
**Problem**: The current `messages()` implementation only handles single folder queries. Gmail uses labels, and a user might have multiple categories selected.

**Solutions**:
- Short term: Only support single folder/label
- Medium term: Add OR query support to database layer
- Long term: Use thread-to-message mapping table

### 2. Type Safety
**Problem**: TypeScript needs to understand Thread | Message throughout the codebase.

**Solution**: Use discriminated unions and type guards consistently:
```typescript
type ThreadOrMessage = 
  | { type: 'thread'; item: Thread }
  | { type: 'message'; item: Message };
```

### 3. Performance
**Problem**: Individual messages could result in much longer lists than threads.

**Mitigations**:
- MultiselectList already virtualizes (renders only visible items)
- Database queries already limited to 1000 items
- Message queries should be no slower than thread queries
- Monitor and optimize if needed

### 4. User Experience
**Problem**: Users might be confused by the mode switch.

**Solutions**:
- Keep threading ON by default
- Clear setting description
- Consider showing message count vs thread count
- Add visual indicator of current mode?

## Next Steps

### Immediate (Phase 3)
1. Create `/app/internal_packages/thread-list/lib/thread-or-message.ts`
2. Implement all ItemAdapter methods
3. Write unit tests for ItemAdapter

### Short Term (Phase 4)
1. Update ThreadListStore with config listener
2. Update column resolvers one by one
3. Test each column in isolation
4. Update participant rendering
5. Update icon rendering

### Medium Term (Phase 5)
1. Update all keyboard shortcuts
2. Update context menu
3. Update drag & drop
4. Update quick actions
5. Integration testing

### Long Term
1. Performance testing with large mailboxes
2. Gmail label support improvements
3. Search integration
4. Message view panel integration

## Testing Strategy

### Unit Tests Needed
- [ ] ItemAdapter methods
- [ ] MessageListDataSource
- [ ] messages() query generation
- [ ] Type guards

### Integration Tests Needed
- [ ] Switch between modes
- [ ] All actions work in both modes
- [ ] Selection persists/clears appropriately
- [ ] Keyboard navigation
- [ ] Drag and drop

### Manual Tests Needed
- [ ] Large mailboxes (1000+ items)
- [ ] Gmail vs IMAP
- [ ] Multiple accounts
- [ ] All perspectives (inbox, sent, archive, trash, labels, folders)
- [ ] Search results
- [ ] Drafts handling

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Performance degradation | High | Low | Virtualization + monitoring |
| Breaking existing threading | High | Medium | Extensive testing, feature flag |
| Incomplete Message data | Medium | Medium | Audit Message model, add fields if needed |
| Code duplication | Medium | High | Adapter pattern, shared utilities |
| User confusion | Low | Medium | Clear UI, good defaults |

## Estimated Effort

- Phase 3: 1-2 days
- Phase 4: 3-5 days  
- Phase 5: 2-3 days
- Testing & Polish: 3-5 days

**Total: 2-3 weeks for complete, production-ready implementation**

## Conclusion

We've completed the foundational work (configuration and data sources). The remaining work is primarily in updating UI components to handle both threads and messages. The use of an adapter pattern will minimize code duplication and make the feature maintainable.

The feature is feasible and can be implemented entirely in the frontend without touching mailsync, as originally assessed.
