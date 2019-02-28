import Task from './task';
import Attributes from '../attributes';
import Message from '../models/message';
import { localized } from '../../intl';

export default class SyncbackDraftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    headerMessageId: Attributes.String({
      modelKey: 'headerMessageId',
    }),
    draft: Attributes.Object({
      modelKey: 'draft',
      itemClass: Message,
    }),
  });

  draft: Message;
  accountId: string;
  headerMessageId: string;

  constructor({ draft, ...rest }: { draft?: Message; headerMessageId?: string } = {}) {
    super(rest);
    this.draft = draft;
    this.accountId = draft ? draft.accountId : undefined;
    this.headerMessageId = draft ? draft.headerMessageId : undefined;
  }

  onError({ key, debuginfo }) {
    if (key === 'no-drafts-folder') {
      AppEnv.showErrorDialog({
        title: localized('Drafts folder not found'),
        message: localized(
          "Mailspring can't find your Drafts folder. To create and send mail, visit Preferences > Folders and choose a Drafts folder."
        ),
      });
    }
  }
}
