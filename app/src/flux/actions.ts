import Reflux from 'reflux';

const ActionScopeWindow = 'window';
const ActionScopeGlobal = 'global';
const ActionScopeMainWindow = 'main';

/*
Public: In the Flux {Architecture.md}, almost every user action
is translated into an Action object and fired globally. Stores in the app observe
these actions and perform business logic. This loose coupling means that your
packages can observe actions and perform additional logic, or fire actions which
the rest of the app will handle.

In Reflux, each {Action} is an independent object that acts as an event emitter.
You can listen to an Action, or invoke it as a function to fire it.

## Action Scopes

Mailspring is a multi-window application. The `scope` of an Action dictates
how it propogates between windows.

- **Global**: These actions can be listened to from any window and fired from any
  window. The action is sent from the originating window to all other windows via
  IPC, so they should be used with care. Firing this action from anywhere will
  cause all listeners in all windows to fire.

- **Main Window**: You can fire these actions in any window. They'll be sent
  to the main window and triggered there.

- **Window**: These actions only trigger listeners in the window they're fired in.

## Firing Actions

```javascript
Actions.queueTask(new ChangeStarredTask(threads: [this._thread], starred: true))
```

## Listening for Actions

If you're using Reflux to create your own Store, you can use the `listenTo`
convenience method to listen for an Action. If you're creating your own class
that is not a Store, you can still use the `listen` method provided by Reflux:

```javascript
setup() {
  this.unlisten = Actions.queueTask.listen(this.onTaskWasQueued, this)
}
onNewMailReceived = (data) => {
  console.log("You've got mail!", data)
}
teardown() {
  this.unlisten();
}
```

Section: General
*/

type ActionFn = (...args: any[]) => void;
interface Action extends ActionFn {
  actionName: string;
  scope: 'window' | 'global' | 'main';
  sync: boolean;
  listen: (callback: (...args: any[]) => any, thisObj?: object) => () => void;
}

const scopes: {
  window: Action[];
  global: Action[];
  main: Action[];
} = {
  window: [],
  global: [],
  main: [],
};

const create = (name, scope: 'window' | 'global' | 'main') => {
  const obj = Reflux.createAction(name) as Action;
  obj.scope = scope;
  obj.sync = true;
  obj.actionName = name;
  scopes[scope].push(obj);
  return obj as Action;
};

export const windowActions = scopes.window;
export const mainWindowActions = scopes.main;
export const globalActions = scopes.global;

/*
  Public: Fired when the Nylas API Connector receives new data from the API.

  *Scope: Global*

  Receives an {Object} of {Array}s of {Model}s, for example:

  ```json
  {
    'thread': [<Thread>, <Thread>]
    'contact': [<Contact>]
  }
  ```
  */
export const downloadStateChanged = create('downloadStateChanged', ActionScopeGlobal);

/*
  Public: Queue a {Task} object to the {TaskQueue}.

  *Scope: Main Window*
  */
export const queueTask = create('queueTask', ActionScopeMainWindow);

/*
  Public: Queue multiple {Task} objects to the {TaskQueue}, which should be
  undone as a single user action.

  *Scope: Main Window*
  */
export const queueTasks = create('queueTasks', ActionScopeMainWindow);
/*
  Public: Cancel a specific {Task} in the {TaskQueue}.

  *Scope: Main Window*
  */
export const cancelTask = create('cancelTask', ActionScopeMainWindow);

/*
  Public: Queue a task that does not require processing, placing it on the undo stack only.
  *Scope: Main Window*
  */
export const queueUndoOnlyTask = create('queueUndoOnlyTask', ActionScopeMainWindow);

/*
  Public: Dequeue a {Task} matching the description provided.

  *Scope: Main Window*
  */
export const checkOnlineStatus = create('checkOnlineStatus', ActionScopeWindow);

/*
  Public: Open the preferences view.

  *Scope: Global*
  */
export const openPreferences = create('openPreferences', ActionScopeGlobal);

/*
  Public: Switch to the preferences tab with the specific name

  *Scope: Global*
  */
export const switchPreferencesTab = create('switchPreferencesTab', ActionScopeGlobal);

/*
  Public: Manage the Nylas identity
  */
export const logoutNylasIdentity = create('logoutNylasIdentity', ActionScopeWindow);

/*
  Public: Remove the selected account

  *Scope: Window*
  */
export const removeAccount = create('removeAccount', ActionScopeWindow);

/*
  Public: Update the provided account

  *Scope: Window*

  ```
  Actions.updateAccount(account.id, {accountName: 'new'})
  ```
  */
export const updateAccount = create('updateAccount', ActionScopeWindow);

/*
  Public: Re-order the provided account in the account list.

  *Scope: Window*

  ```
  Actions.reorderAccount(account.id, newIndex)
  ```
  */
export const reorderAccount = create('reorderAccount', ActionScopeWindow);

/*
  Public: Select the provided sheet in the current window. This action changes
  the top level sheet.

  *Scope: Window*

  ```
  Actions.selectRootSheet(WorkspaceStore.Sheet.Threads)
  ```
  */
export const selectRootSheet = create('selectRootSheet', ActionScopeWindow);

/*
  Public: Toggle whether a particular column is visible. Call this action
  with one of the Sheet location constants:

  ```
  Actions.toggleWorkspaceLocationHidden(WorkspaceStore.Location.MessageListSidebar)
  ```
  */
export const toggleWorkspaceLocationHidden = create(
  'toggleWorkspaceLocationHidden',
  ActionScopeWindow
);

/*
  Public: Focus the keyboard on an item in a collection. This action moves the
  `keyboard focus` element in lists and other components,  but does not change
  the focused DOM element.

  *Scope: Window*

  ```
  Actions.setCursorPosition(collection: 'thread', item: <Thread>)
  ```
  */
export const setCursorPosition = create('setCursorPosition', ActionScopeWindow);

/*
  Public: Focus on an item in a collection. This action changes the selection
  in lists and other components, but does not change the focused DOM element.

  *Scope: Window*

  ```
  Actions.setFocus(collection: 'thread', item: <Thread>)
  ```
  */
export const setFocus = create('setFocus', ActionScopeWindow);

/*
  Public: Focus the interface on a specific {MailboxPerspective}.

  *Scope: Window*

  ```
  Actions.focusMailboxPerspective(<Category>)
  ```
  */
export const focusMailboxPerspective = create('focusMailboxPerspective', ActionScopeWindow);

/*
  Public: Focus the interface on the default mailbox perspective for the provided
  account id.

  *Scope: Window*
  */
export const focusDefaultMailboxPerspectiveForAccounts = create(
  'focusDefaultMailboxPerspectiveForAccounts',
  ActionScopeWindow
);

/*
  Public: Focus the mailbox perspective for the given account id and category names

  *Scope: Window*

  ```
  Actions.ensureCategoryIsFocused(accountIds, categoryName)
  ```
  */
export const ensureCategoryIsFocused = create('ensureCategoryIsFocused', ActionScopeWindow);

/*
  Public: If the message with the provided id is currently beign displayed in the
  thread view, this action toggles whether it's full content or snippet is shown.

  *Scope: Window*

  ```
  message = <Message>
  Actions.toggleMessageIdExpanded(message.id)
  ```
  */
export const toggleMessageIdExpanded = create('toggleMessageIdExpanded', ActionScopeWindow);

/*
  Public: Toggle whether messages from trash and spam are shown in the current
  message view.
  */
export const toggleHiddenMessages = create('toggleHiddenMessages', ActionScopeWindow);

/*
  Public: This action toggles wether to collapse or expand all messages in a
  thread depending on if there are currently collapsed messages.

  *Scope: Window*

  ```
  Actions.toggleAllMessagesExpanded()
  ```
  */
export const toggleAllMessagesExpanded = create('toggleAllMessagesExpanded', ActionScopeWindow);

/*
  Public: Print the currently selected thread.

  *Scope: Window*

  ```
  thread = <Thread>
  Actions.printThread(thread)
  ```
  */
export const printThread = create('printThread', ActionScopeWindow);

/*
  Public: Display the thread in a new popout window

  *Scope: Window*

  ```
  thread = <Thread>
  Actions.popoutThread(thread)
  ```
  */
export const popoutThread = create('popoutThread', ActionScopeWindow);

/*
  Public: Display the thread in the main window

  *Scope: Global*

  ```
  thread = <Thread>
  Actions.focusThreadMainWindow(thread)
  ```
  */
export const focusThreadMainWindow = create('focusThreadMainWindow', ActionScopeGlobal);

/*
  Public: Create a new reply to the provided threadId and messageId and populate
  it with the body provided.

  *Scope: Window*

  ```
  message = <Message>
  Actions.sendQuickReply({threadId: '123', messageId: '234'}, "Thanks Ben!")
  ```
  */
export const sendQuickReply = create('sendQuickReply', ActionScopeWindow);

/*
  Public: Create a new reply to the provided threadId and messageId. Note that
  this action does not focus on the thread, so you may not be able to see the new draft
  unless you also call {::setFocus}.

  *Scope: Window*

  ```
  * Compose a reply to the last message in the thread
  Actions.composeReply({threadId: '123'})

  * Compose a reply to a specific message in the thread
  Actions.composeReply({threadId: '123', messageId: '123'})
  ```
  */
export const composeReply = create('composeReply', ActionScopeWindow);

/*
  Public: Create a new draft for forwarding the provided threadId and messageId. See
  {::composeReply} for parameters and behavior.

  *Scope: Window*
  */
export const composeForward = create('composeForward', ActionScopeWindow);

/*
  Public: Pop out the draft with the provided ID so the user can edit it in another
  window.

  *Scope: Window*

  ```
  messageId = '123'
  Actions.composePopoutDraft(messageId)
  ```
  */
export const composePopoutDraft = create('composePopoutDraft', ActionScopeWindow);

/*
  Public: Open a new composer window for creating a new draft from scratch.

  *Scope: Window*

  ```
  Actions.composeNewBlankDraft()
  ```
  */
export const composeNewBlankDraft = create('composeNewBlankDraft', ActionScopeWindow);

/*
  Public: Open a new composer window for a new draft addressed to the given recipient

  *Scope: Window*

  ```
  Actions.composeNewDraftToRecipient(contact)
  ```
  */
export const composeNewDraftToRecipient = create('composeNewDraftToRecipient', ActionScopeWindow);

/*
  Public: Send the draft with the given ID. This Action is handled by the {DraftStore},
  which finalizes the {DraftChangeSet} and allows {ComposerExtension}s to display
  warnings and do post-processing. To change send behavior, you should consider using
  one of these objects rather than listening for the {sendDraft} action.

  *Scope: Window*

  ```
  Actions.sendDraft('123', {actionKey})
  ```
  */
export const sendDraft = create('sendDraft', ActionScopeWindow);
/*
  Public: Fired when a draft is successfully sent
  *Scope: Global*

  Recieves the id of the message that was sent
  */
export const draftDeliverySucceeded = create('draftDeliverySucceeded', ActionScopeMainWindow);
export const draftDeliveryFailed = create('draftDeliveryFailed', ActionScopeMainWindow);

/*
  Public: Destroys the draft with the given ID. This Action is handled by the {DraftStore},
  and does not display any confirmation UI.

  *Scope: Window*
  */
export const destroyDraft = create('destroyDraft', ActionScopeWindow);

/*
  Public: Submits the user's response to an RSVP event.

  *Scope: Window*
  */
export const RSVPEvent = create('RSVPEvent', ActionScopeWindow);

// FullContact Sidebar
export const getFullContactDetails = create('getFullContactDetails', ActionScopeWindow);
export const focusContact = create('focusContact', ActionScopeWindow);

// Account Sidebar
export const setCollapsedSidebarItem = create('setCollapsedSidebarItem', ActionScopeWindow);

// File Actions
// Some file actions only need to be processed in their current window
export const addAttachment = create('addAttachment', ActionScopeWindow);
export const selectAttachment = create('selectAttachment', ActionScopeWindow);
export const removeAttachment = create('removeAttachment', ActionScopeWindow);

export const fetchBodies = create('fetchBodies', ActionScopeMainWindow);
export const fetchAndOpenFile = create('fetchAndOpenFile', ActionScopeWindow);
export const fetchAndSaveFile = create('fetchAndSaveFile', ActionScopeWindow);
export const fetchAndSaveAllFiles = create('fetchAndSaveAllFiles', ActionScopeWindow);
export const fetchFile = create('fetchFile', ActionScopeWindow);
export const abortFetchFile = create('abortFetchFile', ActionScopeWindow);
export const quickPreviewFile = create('quickPreviewFile', ActionScopeWindow);

/*
  Public: Pop the current sheet off the Sheet stack maintained by the {WorkspaceStore}.
  This action has no effect if the window is currently showing a root sheet.

  *Scope: Window*
  */
export const popSheet = create('popSheet', ActionScopeWindow);

/*
  Public: Pop the to the root sheet currently selected.

  *Scope: Window*
  */
export const popToRootSheet = create('popToRootSheet', ActionScopeWindow);

/*
  Public: Push a sheet of a specific type onto the Sheet stack maintained by the
  {WorkspaceStore}. Note that sheets have no state. To show a *specific* thread,
  you should push a Thread sheet and call `setFocus` to select the thread.

  *Scope: Window*

  ```javascript
  WorkspaceStore.defineSheet('Thread', {}, {
    list: ['MessageList', 'MessageListSidebar'],
  }));

  ...

  this.pushSheet(WorkspaceStore.Sheet.Thread)
  ```
  */
export const pushSheet = create('pushSheet', ActionScopeWindow);

export const addMailRule = create('addMailRule', ActionScopeWindow);
export const reorderMailRule = create('reorderMailRule', ActionScopeWindow);
export const updateMailRule = create('updateMailRule', ActionScopeWindow);
export const deleteMailRule = create('deleteMailRule', ActionScopeWindow);
export const disableMailRule = create('disableMailRule', ActionScopeWindow);
export const startReprocessingMailRules = create('startReprocessingMailRules', ActionScopeWindow);
export const stopReprocessingMailRules = create('stopReprocessingMailRules', ActionScopeWindow);

export const openPopover = create('openPopover', ActionScopeWindow);
export const closePopover = create('closePopover', ActionScopeWindow);

export const openModal = create('openModal', ActionScopeWindow);
export const closeModal = create('closeModal', ActionScopeWindow);

export const draftParticipantsChanged = create('draftParticipantsChanged', ActionScopeWindow);

export const findInThread = create('findInThread', ActionScopeWindow);
export const nextSearchResult = create('nextSearchResult', ActionScopeWindow);
export const previousSearchResult = create('previousSearchResult', ActionScopeWindow);

// Actions for the signature preferences and shared with the composer
export const upsertSignature = create('upsertSignature', ActionScopeWindow);
export const removeSignature = create('removeSignature', ActionScopeWindow);
export const selectSignature = create('selectSignature', ActionScopeWindow);
export const toggleAccount = create('toggleAccount', ActionScopeWindow);

export const expandSyncState = create('expandSyncState', ActionScopeWindow);

export const searchQuerySubmitted = create('searchQuerySubmitted', ActionScopeWindow);
export const searchQueryChanged = create('searchQueryChanged', ActionScopeWindow);
export const searchCompleted = create('searchCompleted', ActionScopeWindow);

// Templates
export const insertTemplateId = create('insertTemplateId', ActionScopeWindow);
export const createTemplate = create('createTemplate', ActionScopeWindow);
export const showTemplates = create('showTemplates', ActionScopeWindow);
export const deleteTemplate = create('deleteTemplate', ActionScopeWindow);
export const renameTemplate = create('renameTemplate', ActionScopeWindow);
