import MailspringStore from 'mailspring-store';
import _ from 'underscore';
import * as Utils from '../models/utils';
import * as Actions from '../actions';
import { Thread } from '../models/thread';
import { Message } from '../models/message';
import DatabaseStore from '../stores/database-store';
import CategoryStore from '../stores/category-store';
import MailRulesProcessor from '../../mail-rules-processor';
import { localized } from '../../intl';

import { Template } from '../../components/scenario-editor-models';
import { ConditionMode, ConditionTemplates, ActionTemplates } from '../../mail-rules-templates';

const RulesJSONKey = 'MailRules-V2';
const AutoSinceJSONKey = 'MailRules-Auto-Since';

export interface MailRule extends Template {
  id: string;
  accountId: string;
  disabled?: boolean;
  disabledReason?: string;
  name: string;
  conditions: [
    {
      templateKey: string;
      comparatorKey: string;
      value: string;
    }
  ];
  conditionMode: 'any' | 'all';
  actions: [
    {
      value: string;
      templateKey: string;
    }
  ];
}

class MailRulesStore extends MailspringStore {
  _autoSince = Number(window.localStorage.getItem(AutoSinceJSONKey) || 0);
  _reprocessing: {
    [accountId: string]: {
      count: number;
      lastTimestamp: number;
      inboxCategoryId: string;
    };
  } = {};

  _rules: MailRule[] = [];

  constructor() {
    super();

    /* This is a bit strange - if the user has mail rules enabled, they only
    expect rules to be applied to "new" mail. Not "new" mail as in just created,
    since that includes old mail we're syncing for the first time. Just "new"
    mail that has arrived since they last ran Mailspring. So, we keep a date. */
    if (this._autoSince === 0) {
      window.localStorage.setItem(AutoSinceJSONKey, `${Date.now()}`);
      this._autoSince = Date.now();
    }

    try {
      const txt = window.localStorage.getItem(RulesJSONKey);
      if (txt) {
        this._rules = JSON.parse(txt);
      }
    } catch (err) {
      console.warn('Could not load saved mail rules', err);
    }

    this.listenTo(Actions.addMailRule, this._onAddMailRule);
    this.listenTo(Actions.deleteMailRule, this._onDeleteMailRule);
    this.listenTo(Actions.reorderMailRule, this._onReorderMailRule);
    this.listenTo(Actions.updateMailRule, this._onUpdateMailRule);
    this.listenTo(Actions.disableMailRule, this._onDisableMailRule);
    this.listenTo(Actions.startReprocessingMailRules, this._onStartReprocessing);
    this.listenTo(Actions.stopReprocessingMailRules, this._onStopReprocessing);

    this.listenTo(DatabaseStore, this._onDatabaseChanged);
  }

  rules() {
    return this._rules;
  }

  rulesForAccountId(accountId: string) {
    return this._rules.filter(f => f.accountId === accountId);
  }

  disabledRules(accountId?: string) {
    return this._rules.filter(f => (!accountId || f.accountId === accountId) && f.disabled);
  }

  reprocessState() {
    return this._reprocessing;
  }

  _onDatabaseChanged = record => {
    // If the record contains new emails, process mail rules immediately.
    // This is necessary to avoid emails from bouncing through the inbox.
    if (record.type === 'persist' && record.objectClass === Message.name) {
      const newMessages = record.objects.filter(msg => {
        if (msg.version !== 1) return false;
        if (msg.draft) return false;
        if (!msg.date || msg.date.valueOf() < this._autoSince) return false;
        return true;
      });
      if (newMessages.length > 0) {
        MailRulesProcessor.processMessages(newMessages);
      }
    }
  };

  _onDeleteMailRule = id => {
    this._rules = this._rules.filter(f => f.id !== id);
    this._saveMailRules();
    this.trigger();
  };

  _onReorderMailRule = (id, newIdx) => {
    const currentIdx = this._rules.findIndex(r => r.id === id);
    if (currentIdx === -1) {
      return;
    }
    const rule = this._rules[currentIdx];
    this._rules.splice(currentIdx, 1);
    this._rules.splice(newIdx, 0, rule);
    this._saveMailRules();
    this.trigger();
  };

  _onAddMailRule = properties => {
    const defaults = {
      id: Utils.generateTempId(),
      name: localized('Untitled Rule'),
      conditionMode: ConditionMode.All,
      conditions: [ConditionTemplates[0].createDefaultInstance()],
      actions: [ActionTemplates[0].createDefaultInstance()],
      disabled: false,
    };

    if (!properties.accountId) {
      throw new Error('AddMailRule: you must provide an account id.');
    }

    this._rules.push(Object.assign(defaults, properties));
    this._saveMailRules();
    this.trigger();
  };

  _onUpdateMailRule = (id, properties) => {
    const existing = this._rules.find(f => id === f.id);
    Object.assign(existing, properties);
    this._saveMailRules();
    this.trigger();
  };

  _onDisableMailRule = (id, reason) => {
    const existing = this._rules.find(f => id === f.id);
    if (!existing || existing.disabled === true) {
      return;
    }

    // Disable the task
    existing.disabled = true;
    existing.disabledReason = reason;
    this._saveMailRules();

    // Cancel all bulk processing jobs
    this._reprocessing = {};

    this.trigger();
  };

  _saveMailRulesDebounced?: () => void;
  _saveMailRules() {
    this._saveMailRulesDebounced =
      this._saveMailRulesDebounced ||
      _.debounce(() => {
        window.localStorage.setItem(RulesJSONKey, JSON.stringify(this._rules));
      }, 1000);
    this._saveMailRulesDebounced();
  }

  // Reprocessing Existing Mail

  _onStartReprocessing = aid => {
    const inboxCategory = CategoryStore.getCategoryByRole(aid, 'inbox');
    if (!inboxCategory) {
      AppEnv.showErrorDialog(
        localized(
          `Sorry, this account does not appear to have an inbox folder so this feature is disabled.`
        )
      );
      return;
    }

    this._reprocessing[aid] = {
      count: 1,
      lastTimestamp: null,
      inboxCategoryId: inboxCategory.id,
    };
    this._reprocessSome(aid);
    this.trigger();
  };

  _onStopReprocessing = aid => {
    delete this._reprocessing[aid];
    this.trigger();
  };

  _reprocessSome = (accountId, callback?) => {
    if (!this._reprocessing[accountId]) {
      return;
    }
    const { lastTimestamp, inboxCategoryId } = this._reprocessing[accountId];

    // Fetching threads first, and then getting their messages allows us to use
    // The same indexes as the thread list / message list in the app

    // Note that we look for "50 after X" rather than "offset 150", because
    // running mail rules can move things out of the inbox!
    const query = DatabaseStore.findAll<Thread>(Thread, { accountId })
      .where(Thread.attributes.categories.contains(inboxCategoryId))
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
      .limit(50);

    if (lastTimestamp !== null) {
      query.where(Thread.attributes.lastMessageReceivedTimestamp.lessThan(lastTimestamp));
    }

    query.then(threads => {
      if (!this._reprocessing[accountId]) {
        return;
      }
      if (threads.length === 0) {
        this._onStopReprocessing(accountId);
        return;
      }

      DatabaseStore.findAll<Message>(Message, {
        threadId: threads.map(t => t.id),
      }).then(messages => {
        if (!this._reprocessing[accountId]) {
          return;
        }
        const advance = () => {
          if (this._reprocessing[accountId]) {
            this._reprocessing[accountId] = Object.assign({}, this._reprocessing[accountId], {
              count: this._reprocessing[accountId].count + messages.length,
              lastTimestamp: threads.pop().lastMessageReceivedTimestamp,
            });
            this.trigger();
            setTimeout(() => {
              this._reprocessSome(accountId);
            }, 500);
          }
        };
        MailRulesProcessor.processMessages(messages).then(advance, advance);
      });
    });
  };
}

export default new MailRulesStore();
