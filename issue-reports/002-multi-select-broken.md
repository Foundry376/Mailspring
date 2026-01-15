# Issue Report: Multi-Select (Shift/Cmd+Click) Broken in 1.17.0

## Summary

Selecting multiple emails using Shift+click or Cmd/Ctrl+click is not working correctly in version 1.17.0. The selection behavior is erratic and unpredictable, making bulk email operations impossible.

## Severity

**Critical** - This affects core functionality for managing multiple emails at once.

## Affected Platforms

- macOS 26.2 (primary reports)
- Windows 11 (confirmed)
- Likely all platforms

## Affected Version

- Mailspring 1.17.0-5e478521
- Regression from 1.16.0

## Discourse Reference

- Topic 14075: "Selecting multiple emails behaves erratically"

## Symptoms

### Shift+Click Selection
1. Sometimes only the last clicked email gets highlighted
2. Sometimes selects all emails from the clicked one up to the topmost email (instead of range between two clicks)
3. Sometimes does nothing at all
4. In some folders (like Unread), Shift selection doesn't work at all

### Cmd/Ctrl+Click Selection
1. Sometimes works as expected
2. Sometimes additionally selects the topmost email regardless of what was clicked
3. Selection can be randomly deselected
4. Behavior varies by folder

### Visual Feedback Issues
1. Multiple emails may be selected but only one is highlighted
2. Wrong emails are highlighted compared to what was clicked
3. Entire selection gets deselected unexpectedly

### Folder-Dependent Behavior
- The buggy behavior seems to change for each folder (Inbox, All Mail, Sent, Unread, etc.)
- May be related to different data sources or caching per folder

## User Reports

### Report 1 (Sassmouth - macOS 26.2)
> "In the newest 1.17.0 release for macOS, using the shift or cmd keys and clicking to select multiple email threads is not working correctly. Sometimes only the last clicked email gets highlighted, sometimes multiple are selected but only one is highlighted, sometimes multiple are selected and highlighted but not the ones you actually clicked on, and sometimes the entire selection is deselected. The behavior seems to change for each folder (Inbox, All Mail, Sent, etc), but it might just be changing randomly."

**Environment:**
- macOS 26.2
- Updated through Mailspring GUI

### Report 2 (spikenheimer - macOS 26.2)
> "shift selection seems only to work once a message has been command-selected"

This suggests the selection state machine may be broken - shift selection requires an anchor point that may not be set correctly.

### Report 3 (seark - Windows 11)
> "In the Inbox trying to select holding Shift either does nothing or selects all mails from the selected one up to the top most one. Holding Ctrl sometimes works as expected, but sometimes it always selects the top most mail additionally. In Unread both won't work at all."

### Report 4 (Buruko)
> "Also selections using the keyboard with Shift or CTRL also do not function properly."

This confirms the issue extends to keyboard-based selection (Shift+Arrow), not just mouse clicks.

## Expected Behavior

- **Shift+Click**: Select all emails in the range between the anchor (last single-clicked email) and the clicked email
- **Cmd/Ctrl+Click**: Toggle selection of the clicked email without affecting other selections
- **Shift+Arrow**: Extend selection from current position in arrow direction
- Visual highlighting should accurately reflect the actual selection state
- Behavior should be consistent across all folders

## Likely Affected Code Areas

Based on the symptoms, investigate:

1. **MultiselectList component**
   - `app/src/components/multiselect-list.tsx`
   - Look for `_onMouseDown`, `_onClick` handlers
   - Check shift/meta key detection logic
   - Verify anchor point management for range selection

2. **ListSelection or selection state management**
   - Check how selection anchor is stored and updated
   - Verify range calculation logic

3. **ListDataSource interaction**
   - `app/src/flux/stores/observable-list-data-source.ts`
   - Index-to-item mapping may be incorrect
   - Items at specific indices may not match visual positions

4. **Thread list specific handling**
   - `app/internal_packages/thread-list/`
   - May have custom selection logic

5. **Potential Electron 39 changes**
   - Check if `event.shiftKey`, `event.metaKey`, `event.ctrlKey` detection changed
   - Verify mouse event coordinates are correct

## Reproduction Steps

1. Open Mailspring 1.17.0
2. Go to Inbox with multiple emails
3. Click on an email in the middle of the list (single click)
4. Hold Shift and click on an email several rows below
5. **Observe**: Selection may only include the last clicked email, or may select from the top of the list, or may select wrong emails

Alternative reproduction:
1. Hold Cmd/Ctrl and click on 3-4 different emails
2. **Observe**: Selection may include the topmost email even though it wasn't clicked, or some clicks may be ignored

## Workaround

None known. Users cannot perform bulk operations on emails effectively.

## Technical Notes

The fact that behavior varies by folder suggests the issue may be related to:
- Different query subscriptions per folder returning data differently
- Index synchronization between the data source and the UI
- Virtualized list rendering causing position mismatches

The symptom "selects from clicked email to topmost" suggests the anchor point may be defaulting to index 0 instead of the previously selected item.

## Related Issues

This issue is related to the keyboard navigation bug (see `001-keyboard-navigation-broken.md`) as both involve selection/navigation in the thread list. They likely share a common root cause in the selection or list data management code.
