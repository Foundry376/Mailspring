import { Message } from 'mailspring-exports';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

export class ComposerExtension {
  /*
  Public: Allows the addition of new types of send actions such as "Send
  Later"

  - `draft`: A fully populated {Message} object that is about to be sent.

  Return an array of objects that adhere to the following spec. If the draft data
  indicates that your action should not be available, then return null.

    - `title`: A short, single string that is displayed to users when
    describing your component. It is used in the hover title text of your
    option in the dropdown menu. It is also used in the "Default Send
    Behavior" dropdown setting. If your string is selected, then the
    `core.sending.defaultSendType` will be set to your string and your
    option will appear as the default.

    - `performSendAction`: Callback for when your option is clicked as the primary
    action. The function will be passed `{draft}` as its only argument.
    It does not need to return anything. It may be asynchronous and likely
    queue Tasks.

    - `isEnabled`: Callback to determine if this send action should be rendered
    for the given draft. Takes a draft: A fully populated {Message} object that
    is about to be sent.

    - `iconUrl`: A custom icon to be placed in the Send button. SendAction
    extensions have the form "Send + {ICON}"
  */
  static sendActions() {
    return [];
  }

  /*
  Public: Inspect the draft, and return any warnings that need to be
  displayed before the draft is sent. Warnings should be string phrases,
  such as "without an attachment" that fit into a message of the form:
  "Send ${phase1} and ${phase2}?"

  - `draft`: A fully populated {Message} object that is about to be sent.

  Returns a list of warning strings, or an empty array if no warnings need
  to be displayed.
  */
  static warningsForSending(args: { draft: Message }) {
    return [];
  }

  // ###
  // Public: declare an icon to be displayed in the composer's toolbar (where
  // bold, italic, underline, etc are).
  //
  // You must return an object that contains the following properties:
  //
  // - `mutator`: A function that's called when your toolbar button is
  // clicked. The mutator will be passed: `(contenteditableDOM, selection,
  // event)`.  It will be executed in a wrapped transaction block where it is
  // safe to mutate the DOM and the selection object.
  //
  // - `className`: The button will already have the `btn` and `toolbar-btn`
  // classes.
  //
  // - `tooltip`: A one or two word description of what your icon does
  //
  // - `iconUrl`: The url of your icon. It should be in the `mailspring://`
  // scheme.  For example: `mailspring://your-package-name/assets/my-icon@2x.png`.
  // Note, we will downsample your image by 2x (for Retina screens), so make
  // sure it's twice the resolution. The icon should be black and white. We
  // will directly pass the `url` prop of a {RetinaImg}
  // ###
  // @composerToolbar: ->
  //   return

  /*
  Public: Override prepareNewDraft to modify a brand new draft before it
  is displayed in a composer. This is one of the only places in the
  application where it's safe to modify the draft object you're given
  directly to add participants to the draft, add a signature, etc.

  By default, new drafts are considered `pristine`. If the user leaves the
  composer without making any changes, the draft is discarded. If your
  extension populates the draft in a way that makes it "populated" in a
  valuable way, you should set `draft.pristine = false` so the draft
  saves, even if no further changes are made.
  */
  static prepareNewDraft(args: { draft: Message }) {}

  /*
  Public: applyTransformsToDraft is called when a draft the user is editing
  is saved to the server and/or sent. This method gives you an opportunity to
  remove any annotations you've inserted into the draft body, apply final changes
  to the body, etc.

  Note that your extension /must/ be able to reverse the changes it applies to
  the draft in `applyTransformsToDraft`. If the user re-opens the draft,
  `unapplyTransformsToDraft` will be called and must restore the draft to it's
  previous edit-ready state.

  Examples:
  - `applyTransformsToDraft`: Add tracking pixel to the email body.
  - `unapplyTransformsToDraft`: Remove the tracking pixel from the email body.

  - `applyTransformsToDraft`: Encrypt the message body.
  - `unapplyTransformsToDraft`: Decrypt the message body.

  This method should return a modified {Message} object, or a {Promise} which resolves
  to a modified Message object.

  - `draft`: A {Message} the user is about to finish editing.
  */
  static applyTransformsForSending(args: {
    draft: Message;
    draftBodyRootNode: HTMLElement;
    recipient?: string;
  }) {}
}
