import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { RetinaImg, CreateButtonGroup, BindGlobalCommands } from 'mailspring-component-kit';
import {
  OutboxStore,
  Actions,
  Message,
} from 'mailspring-exports';

export class ResendButton extends React.Component {
  static displayName = 'ResendButton';
  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object.isRequired,
  };

  _onResend = event => {
    if (event) {
      event.stopPropagation();
    }
    const draft = OutboxStore.selectedDraft();
    Actions.resendDrafts({
      messages: [draft],
      source: 'Outbox Message Controls: Resend'
    });
    return;
  };

  render() {
    const draft = OutboxStore.selectedDraft();
    if (draft && Message.compareMessageState(draft.state, Message.messageState.failed)) {
      return <button tabIndex={-1} className="btn btn-toolbar" title="Resend" onClick={this._onResend}>
        <RetinaImg name={'refresh.svg'}
                   style={{ width: 24, height: 24 }}
                   isIcon
                   mode={RetinaImg.Mode.ContentIsMask}/>
      </button>;
    } else {
      return <span/>;
    }
  }
}

export class TrashButton extends React.Component {
  static displayName = 'TrashButton';
  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.array.isRequired,
  };

  _onRemove = event => {
    const draft = OutboxStore.selectedDraft();
    Actions.cancelOutboxDrafts({
      messages: [draft],
      source: 'Toolbar Button: Outbox Message, Cancel',
    });
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const draft = OutboxStore.selectedDraft();
    if (draft && Message.compareMessageState(draft.state, Message.messageState.failed)) {
      return <button
        tabIndex={-1}
        className="btn btn-toolbar"
        title='Cancel'
        onClick={this._onRemove}
      >
        <RetinaImg name={'trash.svg'} style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask}/>
      </button>;
    } else {
      return <span/>;
    }
  }
}

export class EditButton extends React.Component {
  static displayName = 'EditButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onEditOutboxDraft = event => {
    if (event) {
      event.stopPropagation();
    }
    const draft = OutboxStore.selectedDraft();
    Actions.editOutboxDraft(draft.headerMessageId);
    return;
  };

  render() {
    const draft = OutboxStore.selectedDraft();
    if (draft && Message.compareMessageState(draft.state, Message.messageState.failed)) {
      return <button tabIndex={-1} className="btn btn-toolbar" title="Edit" onClick={this._onEditOutboxDraft}>
        <RetinaImg name={'pencil.svg'}
                   style={{ width: 24, height: 24 }}
                   isIcon
                   mode={RetinaImg.Mode.ContentIsMask}/>
      </button>;
    } else {
      return <span/>;
    }
  }
}

const Divider = (key = 'divider') => (
  <div className="divider" key={key}/>
);
Divider.displayName = 'Divider';

export const OutboxMessageButtons = CreateButtonGroup(
  'OutboxMessageButtons',
  [ResendButton, TrashButton, Divider, EditButton],
  { order: 205 },
);
