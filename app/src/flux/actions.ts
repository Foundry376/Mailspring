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

const scopes = {
  window: [],
  global: [],
  main: [],
};

type ActionFn = (...args: any[]) => void;
interface Action extends ActionFn {
  listen: (callback: (...args: any[]) => any, thisObj?: object) => () => void;
}

const create = (name, scope: 'window' | 'global' | 'main') => {
  const obj = Reflux.createAction(name);
  obj.scope = scope;
  obj.sync = true;
  scopes[scope].push(obj);
  return obj as Action;
};

export default class Actions {
  static windowActions = scopes.window;
  static mainWindowActions = scopes.main;
  static globalActions = scopes.global;

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
  static downloadStateChanged = create('downloadStateChanged', ActionScopeGlobal);

  /*
  Public: Queue a {Task} object to the {TaskQueue}.

  *Scope: Main Window*
  */
  static queueTask = create('queueTask', ActionScopeMainWindow);

  /*
  Public: Queue multiple {Task} objects to the {TaskQueue}, which should be
  undone as a single user action.

  *Scope: Main Window*
  */
  static queueTasks = create('queueTasks', ActionScopeMainWindow);
  /*
  Public: Cancel a specific {Task} in the {TaskQueue}.

  *Scope: Main Window*
  */
  static cancelTask = create('cancelTask', ActionScopeMainWindow);

  /*
  Public: Queue a task that does not require processing, placing it on the undo stack only.
  *Scope: Main Window*
  */
  static queueUndoOnlyTask = create('queueUndoOnlyTask', ActionScopeMainWindow);

  /*
  Public: Dequeue a {Task} matching the description provided.

  *Scope: Main Window*
  */
  static checkOnlineStatus = create('checkOnlineStatus', ActionScopeWindow);

  /*
  Public: Open the preferences view.

  *Scope: Global*
  */
  static openPreferences = create('openPreferences', ActionScopeGlobal);

  /*
  Public: Switch to the preferences tab with the specific name

  *Scope: Global*
  */
  static switchPreferencesTab = create('switchPreferencesTab', ActionScopeGlobal);

  /*
  Public: Manage the Nylas identity
  */
  static logoutNylasIdentity = create('logoutNylasIdentity', ActionScopeWindow);

  /*
  Public: Remove the selected account

  *Scope: Window*
  */
  static removeAccount = create('removeAccount', ActionScopeWindow);

  /*
  Public: Update the provided account

  *Scope: Window*

  ```
  Actions.updateAccount(account.id, {accountName: 'new'})
  ```
  */
  static updateAccount = create('updateAccount', ActionScopeWindow);

  /*
  Public: Re-order the provided account in the account list.

  *Scope: Window*

  ```
  Actions.reorderAccount(account.id, newIndex)
  ```
  */
  static reorderAccount = create('reorderAccount', ActionScopeWindow);

  /*
  Public: Select the provided sheet in the current window. This action changes
  the top level sheet.

  *Scope: Window*

  ```
  Actions.selectRootSheet(WorkspaceStore.Sheet.Threads)
  ```
  */
  static selectRootSheet = create('selectRootSheet', ActionScopeWindow);

  /*
  Public: Toggle whether a particular column is visible. Call this action
  with one of the Sheet location constants:

  ```
  Actions.toggleWorkspaceLocationHidden(WorkspaceStore.Location.MessageListSidebar)
  ```
  */
  static toggleWorkspaceLocationHidden = create('toggleWorkspaceLocationHidden', ActionScopeWindow);

  /*
  Public: Focus the keyboard on an item in a collection. This action moves the
  `keyboard focus` element in lists and other components,  but does not change
  the focused DOM element.

  *Scope: Window*

  ```
  Actions.setCursorPosition(collection: 'thread', item: <Thread>)
  ```
  */
  static setCursorPosition = create('setCursorPosition', ActionScopeWindow);

  /*
  Public: Focus on an item in a collection. This action changes the selection
  in lists and other components, but does not change the focused DOM element.

  *Scope: Window*

  ```
  Actions.setFocus(collection: 'thread', item: <Thread>)
  ```
  */
  static setFocus = create('setFocus', ActionScopeWindow);

  /*
  Public: Focus the interface on a specific {MailboxPerspective}.

  *Scope: Window*

  ```
  Actions.focusMailboxPerspective(<Category>)
  ```
  */
  static focusMailboxPerspective = create('focusMailboxPerspective', ActionScopeWindow);

  /*
  Public: Focus the interface on the default mailbox perspective for the provided
  account id.

  *Scope: Window*
  */
  static focusDefaultMailboxPerspectiveForAccounts = create(
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
  static ensureCategoryIsFocused = create('ensureCategoryIsFocused', ActionScopeWindow);

  /*
  Public: If the message with the provided id is currently beign displayed in the
  thread view, this action toggles whether it's full content or snippet is shown.

  *Scope: Window*

  ```
  message = <Message>
  Actions.toggleMessageIdExpanded(message.id)
  ```
  */
  static toggleMessageIdExpanded = create('toggleMessageIdExpanded', ActionScopeWindow);

  /*
  Public: Toggle whether messages from trash and spam are shown in the current
  message view.
  */
  static toggleHiddenMessages = create('toggleHiddenMessages', ActionScopeWindow);

  /*
  Public: This action toggles wether to collapse or expand all messages in a
  thread depending on if there are currently collapsed messages.

  *Scope: Window*

  ```
  Actions.toggleAllMessagesExpanded()
  ```
  */
  static toggleAllMessagesExpanded = create('toggleAllMessagesExpanded', ActionScopeWindow);

  /*
  Public: Print the currently selected thread.

  *Scope: Window*

  ```
  thread = <Thread>
  Actions.printThread(thread)
  ```
  */
  static printThread = create('printThread', ActionScopeWindow);

  /*
  Public: Display the thread in a new popout window

  *Scope: Window*

  ```
  thread = <Thread>
  Actions.popoutThread(thread)
  ```
  */
  static popoutThread = create('popoutThread', ActionScopeWindow);

  /*
  Public: Display the thread in the main window

  *Scope: Global*

  ```
  thread = <Thread>
  Actions.focusThreadMainWindow(thread)
  ```
  */
  static focusThreadMainWindow = create('focusThreadMainWindow', ActionScopeGlobal);

  /*
  Public: Create a new reply to the provided threadId and messageId and populate
  it with the body provided.

  *Scope: Window*

  ```
  message = <Message>
  Actions.sendQuickReply({threadId: '123', messageId: '234'}, "Thanks Ben!")
  ```
  */
  static sendQuickReply = create('sendQuickReply', ActionScopeWindow);

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
  static composeReply = create('composeReply', ActionScopeWindow);

  /*
  Public: Create a new draft for forwarding the provided threadId and messageId. See
  {::composeReply} for parameters and behavior.

  *Scope: Window*
  */
  static composeForward = create('composeForward', ActionScopeWindow);

  /*
  Public: Pop out the draft with the provided ID so the user can edit it in another
  window.

  *Scope: Window*

  ```
  messageId = '123'
  Actions.composePopoutDraft(messageId)
  ```
  */
  static composePopoutDraft = create('composePopoutDraft', ActionScopeWindow);

  /*
  Public: Open a new composer window for creating a new draft from scratch.

  *Scope: Window*

  ```
  Actions.composeNewBlankDraft()
  ```
  */
  static composeNewBlankDraft = create('composeNewBlankDraft', ActionScopeWindow);

  /*
  Public: Open a new composer window for a new draft addressed to the given recipient

  *Scope: Window*

  ```
  Actions.composeNewDraftToRecipient(contact)
  ```
  */
  static composeNewDraftToRecipient = create('composeNewDraftToRecipient', ActionScopeWindow);

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
  static sendDraft = create('sendDraft', ActionScopeWindow);
  /*
  Public: Fired when a draft is successfully sent
  *Scope: Global*

  Recieves the id of the message that was sent
  */
  static draftDeliverySucceeded = create('draftDeliverySucceeded', ActionScopeMainWindow);
  static draftDeliveryFailed = create('draftDeliveryFailed', ActionScopeMainWindow);

  /*
  Public: Destroys the draft with the given ID. This Action is handled by the {DraftStore},
  and does not display any confirmation UI.

  *Scope: Window*
  */
  static destroyDraft = create('destroyDraft', ActionScopeWindow);

  /*
  Public: Submits the user's response to an RSVP event.

  *Scope: Window*
  */
  static RSVPEvent = create('RSVPEvent', ActionScopeWindow);

  // FullContact Sidebar
  static getFullContactDetails = create('getFullContactDetails', ActionScopeWindow);
  static focusContact = create('focusContact', ActionScopeWindow);

  // Account Sidebar
  static setCollapsedSidebarItem = create('setCollapsedSidebarItem', ActionScopeWindow);

  // File Actions
  // Some file actions only need to be processed in their current window
  static addAttachment = create('addAttachment', ActionScopeWindow);
  static selectAttachment = create('selectAttachment', ActionScopeWindow);
  static removeAttachment = create('removeAttachment', ActionScopeWindow);

  static fetchBodies = create('fetchBodies', ActionScopeMainWindow);
  static fetchAndOpenFile = create('fetchAndOpenFile', ActionScopeWindow);
  static fetchAndSaveFile = create('fetchAndSaveFile', ActionScopeWindow);
  static fetchAndSaveAllFiles = create('fetchAndSaveAllFiles', ActionScopeWindow);
  static fetchFile = create('fetchFile', ActionScopeWindow);
  static abortFetchFile = create('abortFetchFile', ActionScopeWindow);
  static quickPreviewFile = create('quickPreviewFile', ActionScopeWindow);

  /*
  Public: Pop the current sheet off the Sheet stack maintained by the {WorkspaceStore}.
  This action has no effect if the window is currently showing a root sheet.

  *Scope: Window*
  */
  static popSheet = create('popSheet', ActionScopeWindow);

  /*
  Public: Pop the to the root sheet currently selected.

  *Scope: Window*
  */
  static popToRootSheet = create('popToRootSheet', ActionScopeWindow);

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
  static pushSheet = create('pushSheet', ActionScopeWindow);

  static addMailRule = create('addMailRule', ActionScopeWindow);
  static reorderMailRule = create('reorderMailRule', ActionScopeWindow);
  static updateMailRule = create('updateMailRule', ActionScopeWindow);
  static deleteMailRule = create('deleteMailRule', ActionScopeWindow);
  static disableMailRule = create('disableMailRule', ActionScopeWindow);
  static startReprocessingMailRules = create('startReprocessingMailRules', ActionScopeWindow);
  static stopReprocessingMailRules = create('stopReprocessingMailRules', ActionScopeWindow);

  static openPopover = create('openPopover', ActionScopeWindow);
  static closePopover = create('closePopover', ActionScopeWindow);

  static openModal = create('openModal', ActionScopeWindow);
  static closeModal = create('closeModal', ActionScopeWindow);

  static draftParticipantsChanged = create('draftParticipantsChanged', ActionScopeWindow);

  static findInThread = create('findInThread', ActionScopeWindow);
  static nextSearchResult = create('nextSearchResult', ActionScopeWindow);
  static previousSearchResult = create('previousSearchResult', ActionScopeWindow);

  // Actions for the signature preferences and shared with the composer
  static upsertSignature = create('upsertSignature', ActionScopeWindow);
  static removeSignature = create('removeSignature', ActionScopeWindow);
  static selectSignature = create('selectSignature', ActionScopeWindow);
  static toggleAccount = create('toggleAccount', ActionScopeWindow);

  static expandSyncState = create('expandSyncState', ActionScopeWindow);

  static searchQuerySubmitted = create('searchQuerySubmitted', ActionScopeWindow);
  static searchQueryChanged = create('searchQueryChanged', ActionScopeWindow);
  static searchCompleted = create('searchCompleted', ActionScopeWindow);

  // Templates
  static insertTemplateId = create('insertTemplateId', ActionScopeWindow);
  static createTemplate = create('createTemplate', ActionScopeWindow);
  static showTemplates = create('showTemplates', ActionScopeWindow);
  static deleteTemplate = create('deleteTemplate', ActionScopeWindow);
  static renameTemplate = create('renameTemplate', ActionScopeWindow);
}
