import { localized } from 'mailspring-exports';

module.exports = [
  {
    title: localized('Application'),
    items: [
      ['application:new-message', localized('New Message')],
      ['core:focus-search', localized('Search')],
    ],
  },
  {
    title: localized('Actions'),
    items: [
      ['core:reply', localized('Reply')],
      ['core:reply-all', localized('Reply All')],
      ['core:forward', localized('Forward')],
      ['core:archive-item', localized('Archive')],
      ['core:delete-item', localized('Trash')],
      ['core:remove-from-view', localized('Remove from view')],
      ['core:gmail-remove-from-view', localized('Gmail Remove from view')],
      ['core:star-item', localized('Star')],
      ['core:snooze-item', localized('Snooze')],
      ['core:change-labels', localized('Change Labels')],
      ['core:change-folders', localized('Change Folder')],
      ['core:mark-as-read', localized('Mark as %@', localized('Read'))],
      ['core:mark-as-unread', localized('Mark as %@', localized('Unread'))],
      ['core:mark-important', localized('Mark as %@', localized('Important')) + ' (Gmail)'],
      ['core:mark-unimportant', localized('Mark as %@', localized('Not Important')) + ' (Gmail)'],
      ['core:remove-and-previous', localized('Remove and show previous')],
      ['core:remove-and-next', localized('Remove and show next')],
    ],
  },
  {
    title: localized('Composer'),
    items: [
      ['composer:send-message', localized('Send message')],
      ['composer:focus-to', localized('Focus the %@ field', localized('To'))],
      ['composer:show-and-focus-cc', localized('Focus the %@ field', localized('Cc'))],
      ['composer:show-and-focus-bcc', localized('Focus the %@ field', localized('Bcc'))],

      ['contenteditable:insert-link', localized('Insert a link')],
      ['contenteditable:quote', localized('Insert a Quote Block')],
      ['contenteditable:numbered-list', localized('Insert Numbered List')],
      ['contenteditable:bulleted-list', localized('Insert a bulleted list')],
      ['contenteditable:indent', localized('Indent')],
      ['contenteditable:outdent', localized('Outdent')],
      ['contenteditable:underline', localized('Underline')],
      ['contenteditable:bold', localized('Toggle Bold')],
      ['contenteditable:italic', localized('Toggle Italic')],

      ['composer:select-attachment', localized('Select file attachment')],
    ],
  },
  {
    title: localized('Navigation'),
    items: [
      ['core:pop-sheet', localized('Return to conversation list')],
      ['core:focus-item', localized('Open selected conversation')],
      ['core:previous-item', localized('Move to newer conversation')],
      ['core:next-item', localized('Move to older conversation')],
    ],
  },
  {
    title: localized('Selection'),
    items: [
      ['core:select-item', localized('Select conversation')],
      ['multiselect-list:select-all', localized('Select all conversations')],
      ['multiselect-list:deselect-all', localized('Deselect all conversations')],
      ['thread-list:select-read', localized('Select all read conversations')],
      ['thread-list:select-unread', localized('Select all unread conversations')],
      ['thread-list:select-starred', localized('Select all starred conversations')],
      ['thread-list:select-unstarred', localized('Select all unstarred conversations')],
    ],
  },
  {
    title: localized('Jumping'),
    items: [
      ['navigation:go-to-inbox', localized('Go to %@', localized('Inbox'))],
      ['navigation:go-to-starred', localized('Go to %@', localized('Starred'))],
      ['navigation:go-to-sent', localized('Go to %@', localized('Sent Mail'))],
      ['navigation:go-to-drafts', localized('Go to %@', localized('Drafts'))],
      ['navigation:go-to-all', localized('Go to %@', localized('All Mail'))],
    ],
  },
];
