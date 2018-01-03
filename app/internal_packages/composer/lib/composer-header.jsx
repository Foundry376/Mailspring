import { React, ReactDOM, PropTypes, Actions, AccountStore } from 'mailspring-exports';
import {
  KeyCommandsRegion,
  ParticipantsTextField,
  ListensToFluxStore,
} from 'mailspring-component-kit';
import AccountContactField from './account-contact-field';
import ComposerHeaderActions from './composer-header-actions';
import SubjectTextField from './subject-text-field';
import Fields from './fields';

const ScopedFromField = ListensToFluxStore(AccountContactField, {
  stores: [AccountStore],
  getStateFromStores: props => {
    const savedOrReplyToThread = !!props.draft.threadId;
    if (savedOrReplyToThread) {
      return { accounts: [AccountStore.accountForId(props.draft.accountId)] };
    }
    return { accounts: AccountStore.accounts() };
  },
});

export default class ComposerHeader extends React.Component {
  static displayName = 'ComposerHeader';

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
  };

  static contextTypes = {
    parentTabGroup: PropTypes.object,
  };

  constructor(props = {}) {
    super(props);
    this._els = {};
    this.state = this._initialStateForDraft(this.props.draft, props);
  }

  componentWillReceiveProps(nextProps) {
    this._ensureFilledFieldsEnabled(nextProps.draft);
  }

  focus() {
    if (this.props.draft.to.length === 0) {
      this.showAndFocusField(Fields.To);
    } else {
      this._els.subject.focus();
    }
  }

  showAndFocusField = fieldName => {
    this.setState(
      {
        enabledFields: this.state.enabledFields.filter(f => f !== fieldName).concat([fieldName]),
      },
      () => {
        this._els[fieldName].focus();
      }
    );
  };

  hideField = fieldName => {
    if (ReactDOM.findDOMNode(this._els[fieldName]).contains(document.activeElement)) {
      this.context.parentTabGroup.shiftFocus(-1);
    }

    const enabledFields = this.state.enabledFields.filter(n => n !== fieldName);
    this.setState({ enabledFields });
  };

  _ensureFilledFieldsEnabled(draft) {
    let enabledFields = this.state.enabledFields;
    if (draft.cc.length && !enabledFields.find(f => f === Fields.Cc)) {
      enabledFields = [Fields.Cc].concat(enabledFields);
    }
    if (draft.bcc.length && !enabledFields.find(f => f === Fields.Bcc)) {
      enabledFields = [Fields.Bcc].concat(enabledFields);
    }
    if (enabledFields !== this.state.enabledFields) {
      this.setState({ enabledFields });
    }
  }

  _initialStateForDraft(draft, props) {
    const enabledFields = [Fields.To];
    if (draft.cc.length > 0) enabledFields.push(Fields.Cc);
    if (draft.cc.length > 0) enabledFields.push(Fields.Bcc);
    enabledFields.push(Fields.From);
    if (this._shouldEnableSubject()) {
      enabledFields.push(Fields.Subject);
    }
    return {
      enabledFields,
    };
  }

  _shouldEnableSubject = () => {
    if ((this.props.draft.subject || '').trim().length === 0) {
      return true;
    }
    if (this.props.draft.isForwarded()) {
      return true;
    }
    if (this.props.draft.replyToHeaderMessageId) {
      return false;
    }
    return true;
  };

  _onChangeParticipants = changes => {
    this.props.session.changes.add(changes);
    Actions.draftParticipantsChanged(this.props.draft.id, changes);
  };

  _onSubjectChange = value => {
    this.props.session.changes.add({ subject: value });
  };

  _renderSubject = () => {
    if (!this.state.enabledFields.includes(Fields.Subject)) {
      return false;
    }
    return (
      <KeyCommandsRegion tabIndex={-1}>
        <SubjectTextField
          ref={el => {
            if (el) {
              this._els[Fields.Subject] = el;
            }
          }}
          value={this.props.draft.subject}
          onSubjectChange={this._onSubjectChange}
        />
      </KeyCommandsRegion>
    );
  };

  _renderFields = () => {
    const { to, cc, bcc, from } = this.props.draft;

    // Note: We need to physically add and remove these elements, not just hide them.
    // If they're hidden, shift-tab between fields breaks.
    const fields = [];

    fields.push(
      <ParticipantsTextField
        ref={el => {
          if (el) {
            this._els[Fields.To] = el;
          }
        }}
        key="to"
        field="to"
        change={this._onChangeParticipants}
        className="composer-participant-field to-field"
        participants={{ to, cc, bcc }}
        draft={this.props.draft}
        session={this.props.session}
      />
    );

    if (this.state.enabledFields.includes(Fields.Cc)) {
      fields.push(
        <ParticipantsTextField
          ref={el => {
            if (el) {
              this._els[Fields.Cc] = el;
            }
          }}
          key="cc"
          field="cc"
          change={this._onChangeParticipants}
          onEmptied={() => this.hideField(Fields.Cc)}
          className="composer-participant-field cc-field"
          participants={{ to, cc, bcc }}
          draft={this.props.draft}
          session={this.props.session}
        />
      );
    }

    if (this.state.enabledFields.includes(Fields.Bcc)) {
      fields.push(
        <ParticipantsTextField
          ref={el => {
            if (el) {
              this._els[Fields.Bcc] = el;
            }
          }}
          key="bcc"
          field="bcc"
          change={this._onChangeParticipants}
          onEmptied={() => this.hideField(Fields.Bcc)}
          className="composer-participant-field bcc-field"
          participants={{ to, cc, bcc }}
          draft={this.props.draft}
          session={this.props.session}
        />
      );
    }

    if (this.state.enabledFields.includes(Fields.From)) {
      fields.push(
        <ScopedFromField
          key="from"
          ref={el => {
            if (el) {
              this._els[Fields.From] = el;
            }
          }}
          value={from[0]}
          draft={this.props.draft}
          session={this.props.session}
          onChange={this._onChangeParticipants}
        />
      );
    }

    return fields;
  };

  render() {
    return (
      <div className="composer-header">
        <ComposerHeaderActions
          headerMessageId={this.props.draft.headerMessageId}
          enabledFields={this.state.enabledFields}
          onShowAndFocusField={this.showAndFocusField}
        />
        <KeyCommandsRegion
          tabIndex={-1}
          ref={el => {
            if (el) {
              this._els.participantsContainer = el;
            }
          }}
          className="expanded-participants"
        >
          {this._renderFields()}
        </KeyCommandsRegion>
        {this._renderSubject()}
      </div>
    );
  }
}
