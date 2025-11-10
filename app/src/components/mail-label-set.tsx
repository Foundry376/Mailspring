import React from 'react';
import PropTypes from 'prop-types';
import FocusedPerspectiveStore from '../flux/stores/focused-perspective-store';
import CategoryStore from '../flux/stores/category-store';
import { MessageStore } from '../flux/stores/message-store';
import { AccountStore } from '../flux/stores/account-store';
import { MailLabel } from './mail-label';
import * as Actions from '../flux/actions';
import { ChangeLabelsTask } from '../flux/tasks/change-labels-task';
import { InjectedComponentSet } from './injected-component-set';
import { Thread, Message } from 'mailspring-exports';

const LabelComponentCache = {};

type MailLabelSetProps = {
  thread: Thread | Message;
  messages?: any[];
  includeCurrentCategories?: boolean;
  removable?: boolean;
};

export default class MailLabelSet extends React.Component<MailLabelSetProps> {
  static displayName = 'MailLabelSet';

  static propTypes = {
    thread: PropTypes.object.isRequired,
    messages: PropTypes.array,
    includeCurrentCategories: PropTypes.bool,
    removable: PropTypes.bool,
  };

  _onRemoveLabel(label) {
    const item = this.props.thread;

    const task = new ChangeLabelsTask({
      source: 'Label Remove Icon',
      threads: item instanceof Thread ? [item] : [],
      messages: item instanceof Message ? [item] : [],
      labelsToAdd: [],
      labelsToRemove: [label],
    });
    Actions.queueTask(task);
  }

  render() {
    const { thread, messages, includeCurrentCategories } = this.props;
    const account = AccountStore.accountForId(thread.accountId);
    const labels = [];

    if (account && account.usesLabels()) {
      const hidden = CategoryStore.hiddenCategories(thread.accountId);
      let current = FocusedPerspectiveStore.current().categories();

      if (includeCurrentCategories || !current) {
        current = [];
      }

      const ignoredIds = [...hidden, ...current].map(l => l.id);
      const ignoredNames = MessageStore.FolderNamesHiddenByDefault;

      // Get categories - threads have sortedCategories(), messages don't show labels
      let categories = [];
      if (thread instanceof Thread && typeof thread.sortedCategories === 'function') {
        categories = thread.sortedCategories();
      }
      // For individual messages, we could query the thread's labels if needed,
      // but for now we just don't show labels for messages

      for (const label of categories) {
        const labelExists = CategoryStore.byId(thread.accountId, label.id);
        if (ignoredNames.includes(label.name) || ignoredIds.includes(label.id) || !labelExists) {
          continue;
        }

        if (this.props.removable) {
          labels.push(
            <MailLabel label={label} key={label.id} onRemove={() => this._onRemoveLabel(label)} />
          );
        } else {
          if (LabelComponentCache[label.id] === undefined) {
            LabelComponentCache[label.id] = <MailLabel label={label} key={label.id} />;
          }
          labels.push(LabelComponentCache[label.id]);
        }
      }
    }
    return (
      <InjectedComponentSet
        inline
        containersRequired={false}
        matching={{ role: 'Thread:MailLabel' }}
        className="thread-injected-mail-labels"
        exposedProps={{ thread, messages }}
      >
        {labels}
      </InjectedComponentSet>
    );
  }
}
