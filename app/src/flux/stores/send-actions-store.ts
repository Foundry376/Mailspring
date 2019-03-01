import _str from 'underscore.string';
import MailspringStore from 'mailspring-store';
import Actions from '../actions';
import { Message } from '../models/message';
import { SendDraftTask } from '../tasks/send-draft-task';
import * as ExtensionRegistry from '../../registries/extension-registry';

interface ISendAction {
  title: string;
  iconUrl: string | null;
  configKey: string;
  isAvailableForDraft: ({ draft }: { draft: Message }) => boolean;
  performSendAction: ({ draft }: { draft: Message }) => void;
}

const ACTION_CONFIG_KEY = 'core.sending.defaultSendType';
const DefaultSendActionKey = 'send';
const DefaultSendAction: ISendAction = {
  title: 'Send',
  iconUrl: null,
  configKey: DefaultSendActionKey,
  isAvailableForDraft: () => true,
  performSendAction: ({ draft }) => Actions.queueTask(SendDraftTask.forSending(draft)),
};

function verifySendAction(sendAction: ISendAction, extension: { name?: string } = {}) {
  const { name } = extension;
  if (typeof sendAction.title !== 'string') {
    throw new Error(`${name}.sendActions must return objects containing a string "title"`);
  }
  if (!(sendAction.performSendAction instanceof Function)) {
    throw new Error(
      `${name}.sendActions must return objects containing an "performSendAction" function that will be called when the action is selected`
    );
  }
  return true;
}

class SendActionsStore extends MailspringStore {
  _sendActions: ISendAction[] = [];
  _unsubscribers = [];

  constructor() {
    super();
    this._unsubscribers = [ExtensionRegistry.Composer.listen(this._onComposerExtensionsChanged)];
    this._onComposerExtensionsChanged();
  }

  get DefaultSendActionKey() {
    return DefaultSendActionKey;
  }

  get DefaultSendAction() {
    return DefaultSendAction;
  }

  getSendActions() {
    return this._sendActions;
  }

  collectSendActions() {
    const all = [DefaultSendAction];
    for (const ext of ExtensionRegistry.Composer.extensions()) {
      const extActions = (ext.sendActions && ext.sendActions()) || [];
      for (const extAction of extActions) {
        try {
          verifySendAction(extAction, ext);
          extAction.configKey = _str.dasherize(extAction.title.toLowerCase());
          all.push(extAction);
        } catch (err) {
          AppEnv.reportError(err);
        }
      }
    }
    return all;
  }

  sendActionForKey(configKey) {
    return this._sendActions.find(a => a.configKey === configKey);
  }

  orderedSendActionsForDraft(draft) {
    const configKeys = this._sendActions.map(({ configKey }) => configKey);

    let preferredKey = AppEnv.config.get(ACTION_CONFIG_KEY);
    if (!preferredKey || !configKeys.includes(preferredKey)) {
      preferredKey = DefaultSendActionKey;
    }

    let preferred = this._sendActions.find(a => a.configKey === preferredKey);
    if (!preferred || !preferred.isAvailableForDraft({ draft })) {
      preferred = DefaultSendAction;
    }
    const rest = this._sendActions.filter(
      action => action !== preferred && action.isAvailableForDraft({ draft })
    );

    return [preferred, ...rest];
  }

  _onComposerExtensionsChanged = () => {
    this._sendActions = this.collectSendActions();
    this.trigger();
  };
}

export default new SendActionsStore();
