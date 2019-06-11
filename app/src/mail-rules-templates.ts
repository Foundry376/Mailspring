import { Categories } from 'mailspring-observables';
import { Template } from './components/scenario-editor-models';
import { localized } from './intl';

export const ConditionTemplates = [
  new Template('from', Template.Type.String, {
    name: localized('From'),
    valueForMessage: message =>
      [].concat(message.from.map(c => c.email), message.from.map(c => c.name)),
  }),

  new Template('to', Template.Type.String, {
    name: localized('To'),
    valueForMessage: message =>
      [].concat(message.to.map(c => c.email), message.to.map(c => c.name)),
  }),

  new Template('cc', Template.Type.String, {
    name: localized('Cc'),
    valueForMessage: message =>
      [].concat(message.cc.map(c => c.email), message.cc.map(c => c.name)),
  }),

  new Template('bcc', Template.Type.String, {
    name: localized('Bcc'),
    valueForMessage: message =>
      [].concat(message.bcc.map(c => c.email), message.bcc.map(c => c.name)),
  }),

  new Template('anyRecipient', Template.Type.String, {
    name: localized('Recipient'),
    valueForMessage: message => {
      const recipients = [].concat(message.to, message.cc, message.bcc, message.from);
      return [].concat(recipients.map(c => c.email), recipients.map(c => c.name));
    },
  }),

  new Template('anyAttachmentName', Template.Type.String, {
    name: localized('Attachment name'),
    valueForMessage: message => message.files.map(f => f.filename),
  }),

  new Template('starred', Template.Type.Enum, {
    name: localized('Starred'),
    values: [
      { name: localized('True'), value: 'true' },
      { name: localized('False'), value: 'false' },
    ],
    valueLabel: 'is:',
    valueForMessage: message => {
      return message.starred ? 'true' : 'false';
    },
  }),

  new Template('subject', Template.Type.String, {
    name: localized('Subject'),
    valueForMessage: message => {
      return message.subject;
    },
  }),

  new Template('body', Template.Type.String, {
    name: localized('Body'),
    valueForMessage: message => {
      return message.body;
    },
  }),
];

export const ActionTemplates = [
  new Template('markAsRead', Template.Type.None, { name: localized('Mark as Read') }),
  new Template('moveToTrash', Template.Type.None, { name: localized('Move to Trash') }),
  new Template('star', Template.Type.None, { name: localized('Star') }),
];

export const ConditionMode = {
  Any: 'any',
  All: 'all',
};

export function ConditionTemplatesForAccount(account): Template[] {
  return account ? ConditionTemplates : [];
}

export function ActionTemplatesForAccount(account): Template[] {
  if (!account) {
    return [];
  }

  const templates = [...ActionTemplates];

  const CategoryNamesObservable = Categories.forAccount(account)
    .sort()
    .map(cats => cats.filter(cat => !cat.isLockedCategory()))
    .map(cats =>
      cats.map(cat => {
        return {
          name: cat.displayName || cat.name,
          value: cat.id,
        };
      })
    );

  if (account.usesLabels()) {
    templates.unshift(
      new Template('markAsImportant', Template.Type.None, {
        name: localized('Mark as Important'),
      })
    );
    templates.unshift(
      new Template('archive', Template.Type.None, {
        name: localized('Archive'),
      })
    );
    templates.unshift(
      new Template('applyLabel', Template.Type.Enum, {
        name: localized('Apply Label'),
        values: CategoryNamesObservable,
      })
    );
    templates.unshift(
      new Template('moveToLabel', Template.Type.Enum, {
        name: localized('Move to Label'),
        values: CategoryNamesObservable,
      })
    );
  } else {
    templates.push(
      new Template('changeFolder', Template.Type.Enum, {
        name: localized('Move Message'),
        valueLabel: 'to folder:',
        values: CategoryNamesObservable,
      })
    );
  }

  return templates;
}
