import React from 'react';
import ReactDOM from 'react-dom';
import {
  localized,
  PropTypes,
  Actions,
  AccountStore,
  Message,
  DraftEditingSession,
} from 'mailspring-exports';
import {
  KeyCommandsRegion,
  ParticipantsTextField,
  ListensToFluxStore,
} from 'mailspring-component-kit';
import AccountContactField from './account-contact-field';
import ComposerHeaderActions from './composer-header-actions';
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

interface ComposerHeaderProps {
  draft: Message;
  session: DraftEditingSession;
}
interface ComposerHeaderState {
  enabledFields: string[];
}

export class ComposerHeader extends React.Component<ComposerHeaderProps, ComposerHeaderState> {
  static displayName = 'ComposerHeader';

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
  };

  static contextTypes = {
    parentTabGroup: PropTypes.object,
  };

  private _els: {
    participantsContainer?: KeyCommandsRegion;
  } = {};

  constructor(props) {
    super(props);
    this._els = {};
    this.state = this._initialStateForDraft(this.props.draft, props);
  }

  componentDidUpdate(prevProps: ComposerHeaderProps) {
    if (prevProps.draft !== this.props.draft) {
      this._ensureFilledFieldsEnabled(this.props.draft);
    }
  }

  focus() {
    if (this.props.draft.to.length === 0) {
      this.showAndFocusField(Fields.To);
    } else if (this._els[Fields.Subject]) {
      this._els[Fields.Subject].focus();
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
    if (draft.replyTo.length && !enabledFields.find(f => f === Fields.ReplyTo)) {
      enabledFields = [Fields.ReplyTo].concat(enabledFields);
    }
    if (enabledFields !== this.state.enabledFields) {
      this.setState({ enabledFields });
    }
  }

  _initialStateForDraft(draft, props) {
    const enabledFields = [Fields.To];
    if (draft.cc.length > 0) enabledFields.push(Fields.Cc);
    if (draft.bcc.length > 0) enabledFields.push(Fields.Bcc);
    if (draft.replyTo.length > 0) enabledFields.push(Fields.ReplyTo);
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

  _onSubjectChange = event => {
    this.props.session.changes.add({ subject: event.target.value });
  };

  _renderSubject = () => {
    if (!this.state.enabledFields.includes(Fields.Subject)) {
      return false;
    }
    return (
      <KeyCommandsRegion tabIndex={-1} className="composer-subject subject-field">
        <label htmlFor="composer-subject" className="sr-only">
          {localized('Subject')}
        </label>
        <input
          id="composer-subject"
          ref={el => {
            if (el) {
              this._els[Fields.Subject] = el;
            }
          }}
          type="text"
          name="subject"
          placeholder={localized('Subject')}
          value={this.props.draft.subject}
          onChange={this._onSubjectChange}
        />
      </KeyCommandsRegion>
    );
  };

  _renderFields = () => {
    const { to, cc, bcc, from, replyTo } = this.props.draft;

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
        label={localized('To')}
        change={this._onChangeParticipants}
        className="composer-participant-field to-field"
        participants={{ to, cc, bcc, replyTo }}
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
          label={localized('Cc')}
          change={this._onChangeParticipants}
          onEmptied={() => this.hideField(Fields.Cc)}
          className="composer-participant-field cc-field"
          participants={{ to, cc, bcc, replyTo }}
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
          label={localized('Bcc')}
          change={this._onChangeParticipants}
          onEmptied={() => this.hideField(Fields.Bcc)}
          className="composer-participant-field bcc-field"
          participants={{ to, cc, bcc, replyTo }}
          draft={this.props.draft}
          session={this.props.session}
        />
      );
    }

    if (this.state.enabledFields.includes(Fields.ReplyTo)) {
      fields.push(
        <ParticipantsTextField
          ref={el => {
            if (el) {
              this._els[Fields.ReplyTo] = el;
            }
          }}
          key="replyTo"
          field="replyTo"
          label={localized('Reply-To')}
          change={this._onChangeParticipants}
          onEmptied={() => this.hideField(Fields.ReplyTo)}
          className="composer-participant-field replyto-field"
          participants={{ to, cc, bcc, replyTo }}
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
      <header className="composer-header" aria-label={localized('Message addressing')}>
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
      </header>
    );
  }
}
