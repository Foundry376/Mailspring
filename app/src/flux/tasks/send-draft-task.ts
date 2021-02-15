/* eslint global-require: 0 */
import { AccountStore } from '../stores/account-store';
import { Task } from './task';
import * as Actions from '../actions';
import * as Attributes from '../attributes';
import { Message } from '../models/message';
import SoundRegistry from '../../registries/sound-registry';
import { Composer as ComposerExtensionRegistry } from '../../registries/extension-registry';
import { LocalizedErrorStrings } from '../../mailsync-process';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';
import { Contact } from '../models/contact';
import { ZERO_WIDTH_SPACE } from '../../components/composer-editor/plaintext';

function applyExtensionTransforms(draft: Message, recipient: Contact) {
  // Note / todo: This code assumes that:
  // - any changes made to the draft (eg: metadata) should be saved.
  // - any changes made to a HTML body will be made to draftBodyRootNode NOT to the draft.body
  // - any changes made to a plaintext body will be made to draft.body.

  const before = draft.body;
  const extensions = ComposerExtensionRegistry.extensions().filter(
    ext => !!ext.applyTransformsForSending
  );

  if (draft.plaintext) {
    for (const ext of extensions) {
      ext.applyTransformsForSending({ draft, recipient });
    }
    const after = draft.body;
    draft.body = before;
    return after;
  } else {
    const fragment = document.createDocumentFragment();
    const draftBodyRootNode = document.createElement('root');
    fragment.appendChild(draftBodyRootNode);
    draftBodyRootNode.innerHTML = draft.body;

    for (const ext of extensions) {
      ext.applyTransformsForSending({ draft, draftBodyRootNode, recipient });
      if (draft.body !== before) {
        throw new Error(
          'applyTransformsForSending should modify the HTML body DOM (draftBodyRootNode) not the draft.body.'
        );
      }
    }
    return draftBodyRootNode.innerHTML;
  }
}

export class SendDraftTask extends Task {
  static forSending(d: Message, { silent }: { silent?: boolean } = {}) {
    const task = new SendDraftTask({});
    task.draft = d.clone();
    task.headerMessageId = task.draft.headerMessageId;
    task.silent = silent;

    const separateBodies = ComposerExtensionRegistry.extensions().some(
      ext => ext.needsPerRecipientBodies && ext.needsPerRecipientBodies(task.draft)
    );

    if (task.draft.plaintext) {
      // Our editor uses zero-width spaces to differentiate between soft and hard newlines
      // when you're editing, and we don't want to send these characters.
      task.draft.body = task.draft.body.replace(new RegExp(ZERO_WIDTH_SPACE, 'g'), '');
    }

    if (separateBodies) {
      task.perRecipientBodies = {
        self: task.draft.body,
      };
      task.draft.participants({ includeFrom: false, includeBcc: true }).forEach(recipient => {
        task.perRecipientBodies[recipient.email] = applyExtensionTransforms(task.draft, recipient);
      });
    } else {
      task.draft.body = applyExtensionTransforms(task.draft, null);
    }

    return task;
  }

  static attributes = {
    ...Task.attributes,

    draft: Attributes.Obj({
      modelKey: 'draft',
      itemClass: Message,
    }),
    headerMessageId: Attributes.String({
      modelKey: 'headerMessageId',
    }),
    perRecipientBodies: Attributes.Obj({
      modelKey: 'perRecipientBodies',
    }),

    silent: Attributes.Boolean({
      modelKey: 'silent',
    }),
  };

  draft: Message;
  perRecipientBodies: { [email: string]: string };
  silent: boolean;

  constructor(data: AttributeValues<typeof SendDraftTask.attributes> = {}) {
    super(data);
  }

  get accountId() {
    return this.draft.accountId;
  }

  set accountId(a) {
    // no-op
  }

  get headerMessageId() {
    return this.draft.headerMessageId;
  }

  set headerMessageId(h) {
    // no-op
  }

  label() {
    return this.silent ? null : localized('Sending message');
  }

  willBeQueued() {
    const account = AccountStore.accountForEmail(this.draft.from[0].email);

    if (!this.draft.from[0]) {
      throw new Error('SendDraftTask - you must populate `from` before sending.');
    }
    if (!account) {
      throw new Error('SendDraftTask - you can only send drafts from a configured account.');
    }
    if (this.draft.accountId !== account.id) {
      throw new Error(
        localized(
          "The from address has changed since you started sending this draft. Double-check the draft and click 'Send' again."
        )
      );
    }
  }

  onSuccess() {
    Actions.draftDeliverySucceeded({
      headerMessageId: this.draft.headerMessageId,
      accountId: this.draft.accountId,
    });

    // Play the sending sound
    if (AppEnv.config.get('core.sending.sounds') && !this.silent) {
      SoundRegistry.playSound('send');
    }

    // Fire off events to record the usage of open and link tracking
    const extensions = ComposerExtensionRegistry.extensions();
    for (const ext of extensions) {
      if (ext.onSendSuccess) {
        ext.onSendSuccess(this.draft);
      }
    }
  }

  onError({ key, debuginfo }) {
    let errorMessage = null;
    let errorDetail = null;

    if (key === 'no-sent-folder') {
      errorMessage = localized(
        'Your `Sent Mail` folder could not be automatically detected. Visit Preferences > Folders to choose a Sent folder and then try again.'
      );
      errorDetail = localized(
        'In order to send mail through Mailspring, your email account must have a Sent Mail folder. You can specify a Sent folder manually by visiting Preferences > Folders and choosing a folder name from the dropdown menu.'
      );
    } else if (key === 'no-trash-folder') {
      errorMessage = localized(
        'Your `Trash` folder could not be automatically detected. Visit Preferences > Folders to choose a Trash folder and then try again.'
      );
      errorDetail = localized(
        'In order to send mail through Mailspring, your email account must have a Trash folder. You can specify a Trash folder manually by visiting Preferences > Folders and choosing a folder name from the dropdown menu.'
      );
    } else if (key === 'send-partially-failed') {
      const [smtpError, emails] = debuginfo.split(':::');
      errorMessage = localized(
        "We were unable to deliver this message to some recipients. Click 'See Details' for more information."
      );
      errorDetail = localized(
        `We encountered an SMTP Gateway error that prevented this message from being delivered to all recipients. The message was only sent successfully to these recipients:\n%@\n\nError: %@`,
        emails,
        LocalizedErrorStrings[smtpError]
      );
    } else if (key === 'send-failed') {
      errorMessage = localized(
        `Sorry, Mailspring was unable to deliver this message: %@`,
        LocalizedErrorStrings[debuginfo] || debuginfo
      );
    } else {
      errorMessage = localized('We were unable to deliver this message.');
      errorDetail = `${localized(`An unknown error has occurred`)}: ${JSON.stringify({
        key,
        debuginfo,
      })}`;
    }

    Actions.draftDeliveryFailed({
      threadId: this.draft.threadId,
      headerMessageId: this.draft.headerMessageId,
      errorMessage,
      errorDetail,
    });
  }
}
