# Issue Report: Keyboard Navigation Broken in 1.17.0

## Summary

The up/down arrow keys for navigating between emails in the thread list are broken in version 1.17.0. This is a regression from 1.16.0 where keyboard navigation worked correctly.

## Severity

**Critical** - This affects core functionality used by many users for efficient email navigation.

## Affected Platforms

- Windows 11
- macOS 26.2
- Likely all platforms (multiple confirmations across different OS)

## Affected Version

- Mailspring 1.17.0-5e478521
- Regression from 1.16.0

## Discourse References

- Topic 14081: "Move to newer/older conversation hotkey not working"
- Topic 14084: "New in 1.17.0, uparrow moves to most recent email"
- Also mentioned in Topic 14075

## Symptoms

### Primary Behavior
1. **Up arrow** jumps to the most recent/first email in the list instead of moving to the next newer email
2. **Down arrow** either does nothing, or jumps to a seemingly random message
3. Arrow keys only switch between 1-2 specific messages regardless of which message is currently selected
4. Selecting a different message with the mouse and then using arrow keys causes it to jump back to the previously "stuck" messages

### Secondary Behavior
- Scrolling down the message list to load more messages changes which two messages the arrows switch between
- Sometimes arrow keys cause selection to jump to a blank/empty message area
- The issue persists across all folders (Inbox, Unread, Sent, etc.)

## User Reports

### Report 1 (seark - Windows 11)
> "The 'move to newer/older conversation' hotkey don't work as expected. They only switch between two or one messages. If I select another message using one of the keys jumps back to the message(s) it switched between previously. Scrolling down the message list to load more messages, changes the two messages it switches between or makes it switch to a blank message."

**Environment:**
- Windows 11 Version 10.0.26200 Build 26200
- Two IMAP accounts (one with ~56k emails, one with ~100 emails)
- Issue occurs in both accounts and all folders tested

### Report 2 (Oral-B - Windows 11)
> "Down and up keys either do nothing, go to the previously selected message, or go to the first message in the list."

### Report 3 (aerabi - macOS)
> "Same issue on Mac, v1.17.0. The issue was introduced after the last update."

### Report 4 (josefsachs)
> "I just upgraded to 1.17.0, and uparrow now moves to most recent email. It used to move to next email."

### Report 5 (001alessandro1964)
> "same bug after the update I can no longer move between messages with the arrows"

### Report 6 (Buruko)
> "Up arrow goes to the top of the mail list, and no other arrow works unless you scroll down then it works in some sections of the vertical list but not others. Only for the Up arrow to eventually kick you back to the top of the mail list. Also selections using the keyboard with Shift or CTRL also do not function properly."

### Report 7 (ddonaldson130)
> "up and down arrow keys both jump the selection to the top item in the feed"

### Report 8 (alain-sarti)
> "the up and down arrow keys are not working for me; they only move to the first mail in the list"

## Expected Behavior

- **Up arrow**: Move selection to the next newer email (one position up in the list)
- **Down arrow**: Move selection to the next older email (one position down in the list)
- Arrow keys should work consistently regardless of current selection
- This was the working behavior in version 1.16.0

## Likely Affected Code Areas

Based on the symptoms, investigate:

1. **Thread list keyboard event handling**
   - `app/internal_packages/thread-list/` - Thread list component
   - Look for `onKeyDown` handlers or keyboard navigation logic

2. **MultiselectList component**
   - `app/src/components/multiselect-list.tsx` - Base list component with selection
   - Check `_onKeyDown` or similar keyboard handlers

3. **List data source / selection management**
   - `app/src/flux/stores/observable-list-data-source.ts`
   - Selection index calculation may be broken

4. **Potential Electron 39 changes**
   - Check if Electron upgrade changed keyboard event behavior
   - Look for changes in how key events are dispatched or handled

## Reproduction Steps

1. Open Mailspring 1.17.0
2. Go to Inbox or any folder with multiple emails
3. Click on any email in the middle of the list
4. Press the down arrow key
5. **Observe**: Selection jumps to first email or does nothing (instead of moving to next email)
6. Press the up arrow key
7. **Observe**: Selection jumps to first email (instead of moving to previous email)

## Workaround

None known. Users must use mouse to navigate between emails.

## Related Issues

This issue is related to the multi-select bug (see `002-multi-select-broken.md`) as both involve selection/navigation in the thread list. They may share a common root cause.
