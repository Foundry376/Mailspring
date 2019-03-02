import React from 'react';
import _ from 'underscore';

import {
  localized,
  localizedReactFragment,
  Actions,
  Account,
  AccountStore,
  MailRulesStore,
  MailRulesTemplates,
} from 'mailspring-exports';

import {
  Flexbox,
  EditableList,
  RetinaImg,
  ScrollRegion,
  ScenarioEditor,
} from 'mailspring-component-kit';

const { ActionTemplatesForAccount, ConditionTemplatesForAccount } = MailRulesTemplates;

interface PreferencesMailRulesState {
  accounts: Account[];
  currentAccount: Account;
  rules: ReturnType<typeof MailRulesStore.rulesForAccountId>;
  selectedRule?: ReturnType<typeof MailRulesStore.rulesForAccountId>[0];
  reprocessing?: ReturnType<typeof MailRulesStore.reprocessState>;
  actionTemplates: ReturnType<typeof ActionTemplatesForAccount>;
  conditionTemplates: ReturnType<typeof ConditionTemplatesForAccount>;
}

class PreferencesMailRules extends React.Component<{}, PreferencesMailRulesState> {
  static displayName = 'PreferencesMailRules';

  _unsubscribers = [];

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this._unsubscribers.push(MailRulesStore.listen(this._onRulesChanged));
  }

  componentWillUnmount() {
    this._unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  _getStateFromStores(): PreferencesMailRulesState {
    const accounts = AccountStore.accounts();

    let currentAccount = this.state ? this.state.currentAccount : null;
    if (!accounts.find(acct => acct === currentAccount)) {
      currentAccount = accounts[0];
    }

    const rules = MailRulesStore.rulesForAccountId(currentAccount.id);
    const selectedRule =
      this.state && this.state.selectedRule
        ? rules.find(r => r.id === this.state.selectedRule.id)
        : rules[0];

    return {
      accounts: accounts,
      currentAccount: currentAccount,
      rules: rules,
      selectedRule: selectedRule,
      reprocessing: MailRulesStore.reprocessState(),
      actionTemplates: ActionTemplatesForAccount(currentAccount),
      conditionTemplates: ConditionTemplatesForAccount(currentAccount),
    };
  }

  _onSelectAccount = event => {
    const accountId = event.target.value;
    const currentAccount = this.state.accounts.find(acct => acct.id === accountId);
    this.setState({ currentAccount: currentAccount }, () => {
      this.setState(this._getStateFromStores());
    });
  };

  _onReprocessRules = () => {
    const needsMessageBodies = () => {
      for (const rule of this.state.rules) {
        for (const condition of rule.conditions) {
          if (condition.templateKey === 'body') {
            return true;
          }
        }
      }
      return false;
    };

    if (needsMessageBodies()) {
      AppEnv.showErrorDialog(
        localized(
          "One or more of your mail rules requires the bodies of messages being processed. These rules can't be run on your entire mailbox."
        )
      );
    }

    if (this.state.rules.length === 0) {
      AppEnv.showErrorDialog(
        localized(
          "You haven't created any mail rules. To get started, define a new rule above and tell Mailspring how to process your inbox."
        )
      );
    }
    Actions.startReprocessingMailRules(this.state.currentAccount.id);
  };

  _onAddRule = () => {
    Actions.addMailRule({ accountId: this.state.currentAccount.id });
  };

  _onSelectRule = rule => {
    this.setState({ selectedRule: rule });
  };

  _onReorderRule = (rule, startIdx, endIdx) => {
    Actions.reorderMailRule(rule.id, endIdx);
  };

  _onDeleteRule = rule => {
    Actions.deleteMailRule(rule.id);
  };

  _onRuleNameEdited = (newName, rule) => {
    Actions.updateMailRule(rule.id, { name: newName });
  };

  _onRuleConditionModeEdited = event => {
    Actions.updateMailRule(this.state.selectedRule.id, { conditionMode: event.target.value });
  };

  _onRuleEnabled = () => {
    Actions.updateMailRule(this.state.selectedRule.id, { disabled: false, disabledReason: null });
  };

  _onRulesChanged = () => {
    const next = this._getStateFromStores();
    const nextRules = next.rules;
    const prevRules = this.state.rules ? this.state.rules : [];

    const added = _.difference(nextRules, prevRules);
    if (added.length === 1) {
      next.selectedRule = added[0];
    }

    this.setState(next);
  };

  _renderAccountPicker() {
    const options = this.state.accounts.map(account => (
      <option value={account.id} key={account.id}>
        {account.label}
      </option>
    ));

    return (
      <select
        value={this.state.currentAccount.id}
        onChange={this._onSelectAccount}
        style={{ margin: 0, minWidth: 200 }}
      >
        {options}
      </select>
    );
  }

  _renderMailRules() {
    if (this.state.rules.length === 0) {
      return (
        <div className="empty-list">
          <RetinaImg
            className="icon-mail-rules"
            name="rules-big.png"
            mode={RetinaImg.Mode.ContentDark}
          />
          <h2>{localized('No rules')}</h2>
          <button className="btn btn-small" onClick={this._onAddRule}>
            {localized('Create a new Rule')}
          </button>
        </div>
      );
    }
    return (
      <Flexbox>
        <EditableList
          showEditIcon
          className="rule-list"
          items={this.state.rules}
          itemContent={this._renderListItemContent}
          onCreateItem={this._onAddRule}
          onReorderItem={this._onReorderRule}
          onDeleteItem={this._onDeleteRule}
          onItemEdited={this._onRuleNameEdited}
          selected={this.state.selectedRule}
          onSelectItem={this._onSelectRule}
        />
        {this._renderDetail()}
      </Flexbox>
    );
  }

  _renderListItemContent(rule) {
    if (rule.disabled) {
      return <div className="item-rule-disabled">{rule.name}</div>;
    }
    return rule.name;
  }

  _renderDetail() {
    const rule = this.state.selectedRule;

    if (rule) {
      return (
        <ScrollRegion className="rule-detail">
          {this._renderDetailDisabledNotice()}
          <div className="inner">
            {localizedReactFragment(
              'If %@ of the following conditions are met:',
              <select value={rule.conditionMode} onChange={this._onRuleConditionModeEdited}>
                <option value="any">{localized('Any')}</option>
                <option value="all">{localized('All')}</option>
              </select>
            )}
            <ScenarioEditor
              instances={rule.conditions}
              templates={this.state.conditionTemplates}
              onChange={conditions => Actions.updateMailRule(rule.id, { conditions })}
              className="well well-matchers"
            />
            <span>{localized('Perform these actions:')}</span>
            <ScenarioEditor
              instances={rule.actions}
              templates={this.state.actionTemplates}
              onChange={actions => Actions.updateMailRule(rule.id, { actions })}
              className="well well-actions"
            />
          </div>
        </ScrollRegion>
      );
    }

    return (
      <div className="rule-detail">
        <div className="no-selection">
          {localized('Create a rule or select one to get started')}
        </div>
      </div>
    );
  }

  _renderDetailDisabledNotice() {
    if (!this.state.selectedRule.disabled) return false;
    return (
      <div className="disabled-reason">
        <button className="btn" onClick={this._onRuleEnabled}>
          {localized('Enable')}
        </button>
        {localized(
          'This rule has been disabled. Make sure the actions below are valid and re-enable the rule.'
        )}
        <div>({this.state.selectedRule.disabledReason})</div>
      </div>
    );
  }

  _renderTasks() {
    return (
      <div style={{ flex: 1, paddingLeft: 20 }}>
        {Object.keys(this.state.reprocessing).map(accountId => {
          const { count } = this.state.reprocessing[accountId];
          return (
            <Flexbox key={accountId} style={{ alignItems: 'baseline' }}>
              <div style={{ paddingRight: '12px' }}>
                <RetinaImg
                  name="sending-spinner.gif"
                  width={18}
                  mode={RetinaImg.Mode.ContentPreserve}
                />
              </div>
              <div>
                <strong>{AccountStore.accountForId(accountId).emailAddress}</strong>
                {` — ${Number(count).toLocaleString()} ${localized(`processed`)}`}
              </div>
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-sm"
                onClick={() => Actions.stopReprocessingMailRules(accountId)}
              >
                {localized('Stop')}
              </button>
            </Flexbox>
          );
        })}
      </div>
    );
  }

  render() {
    return (
      <div className="container-mail-rules">
        <section>
          <Flexbox className="container-dropdown">
            <div>{localized('Account')}:</div>
            <div className="dropdown">{this._renderAccountPicker()}</div>
          </Flexbox>
          <p>{localized('Rules only apply to the selected account.')}</p>

          {this._renderMailRules()}

          <Flexbox style={{ marginTop: 40, maxWidth: 600 }}>
            <div>
              <button
                disabled={!!this.state.reprocessing[this.state.currentAccount.id]}
                className="btn"
                style={{ float: 'right' }}
                onClick={this._onReprocessRules}
              >
                {localized('Process entire inbox')}
              </button>
            </div>
            {this._renderTasks()}
          </Flexbox>

          <p style={{ marginTop: 10 }}>
            {localized(
              'By default, mail rules are only applied to new mail as it arrives. Applying rules to your entire inbox may take a long time and degrade performance.'
            )}
          </p>
        </section>
      </div>
    );
  }
}

export default PreferencesMailRules;
