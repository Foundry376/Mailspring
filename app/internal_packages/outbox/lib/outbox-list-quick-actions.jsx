const {
  Actions,
  React,
  PropTypes,
  FocusedPerspectiveStore,
} = require('mailspring-exports');
import { RetinaImg } from 'mailspring-component-kit';

class OutboxTrashQuickAction extends React.Component {
  static displayName = 'OutboxTrashQuickAction';
  static propTypes = { draft: PropTypes.object };

  render() {
    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(
      [this.props.draft],
      'trash'
    );
    if (!allowed) {
      return <span />;
    }

    return (
      <div
        key="remove"
        title="Trash"
        style={{ order: 3}}
        className="action action-trash"
        onClick={this._onRemove}
      >
        <RetinaImg name="trash.svg" style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  _onRemove = event => {
    Actions.cancelOutboxDrafts({
      messages: [this.props.draft],
      source: 'Outbox:QuickActions:Remove',
    });
    event.stopPropagation();
  };
}

class OutboxEditQuickAction extends React.Component {
  static displayName = 'OutboxEditQuickAction';
  static propTypes = { draft: PropTypes.object };

  render() {
    return (
      <div
        key="edit"
        title='Edit'
        style={{ order: 2 }}
        className="action action-edit "
        onClick={this._onEdit}
      >
        <RetinaImg
          name="pencil.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  _onEdit = event => {
    Actions.editOutboxDraft(this.props.draft.headerMessageId);
    return event.stopPropagation();
  };
}

class OutboxResendQuickAction extends React.Component {
  static displayName = 'OutboxResendQuickAction';
  static propTypes = { draft: PropTypes.object };

  render() {
    return (
      <div
        key="resend"
        title='Resend'
        style={{ order: 1 }}
        className="action action-flag"
        onClick={this._onResend}
      >
        <RetinaImg name='refresh.svg' style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  _onResend = event => {
    Actions.resendDrafts({messages: [this.props.draft], source: "Outbox:QuickAction:Resend"});
    return event.stopPropagation();
  };
}

module.exports = { OutboxEditQuickAction, OutboxTrashQuickAction, OutboxResendQuickAction };
