import React from 'react';
import {
  localized,
  ISendAction,
  Actions,
  SendActionsStore,
  SoundRegistry,
  Message,
} from 'mailspring-exports';
import { Menu, RetinaImg, ButtonDropdown, ListensToFluxStore } from 'mailspring-component-kit';

interface SendActionButtonProps {
  draft: Message;
  isValidDraft: () => boolean;
  sendActions: ISendAction[];
}
class SendActionButton extends React.Component<SendActionButtonProps> {
  static displayName = 'SendActionButton';

  static containerRequired = false;

  /* This component is re-rendered constantly because `draft` changes in random ways.
  We only use the draft prop when you click send, so update with more discretion. */
  shouldComponentUpdate(nextProps) {
    return (
      nextProps.sendActions.map(a => a.configKey).join(',') !==
      this.props.sendActions.map(a => a.configKey).join(',')
    );
  }

  primarySend() {
    this._onPrimaryClick();
  }

  _onPrimaryClick = () => {
    this._onSendWithAction(this.props.sendActions[0]);
  };

  _onSendWithAction = sendAction => {
    if (this.props.isValidDraft()) {
      if (AppEnv.config.get('core.sending.sounds')) {
        SoundRegistry.playSound('hit-send');
      }
      Actions.sendDraft(this.props.draft.headerMessageId, { actionKey: sendAction.configKey });
    }
  };

  _renderSendActionItem = ({ iconUrl }) => {
    let plusHTML: React.ReactChild = '';
    let additionalImg: React.ReactChild = null;

    if (iconUrl) {
      plusHTML = <span>&nbsp;+&nbsp;</span>;
      additionalImg = <RetinaImg url={iconUrl} mode={RetinaImg.Mode.ContentIsMask} />;
    }

    return (
      <span>
        <RetinaImg name="icon-composer-send.png" mode={RetinaImg.Mode.ContentIsMask} />
        <span className="text">
          {localized(`Send`)}
          {plusHTML}
        </span>
        {additionalImg}
      </span>
    );
  };

  _renderSingleButton() {
    return (
      <button
        tabIndex={-1}
        className={'btn btn-toolbar btn-normal btn-emphasis btn-text btn-send'}
        style={{ order: -100 }}
        onClick={this._onPrimaryClick}
      >
        {this._renderSendActionItem(this.props.sendActions[0])}
      </button>
    );
  }

  _renderButtonDropdown() {
    const { sendActions } = this.props;
    const menu = (
      <Menu
        items={sendActions.slice(1)}
        itemKey={actionConfig => actionConfig.configKey}
        itemContent={this._renderSendActionItem}
        onSelect={this._onSendWithAction}
      />
    );

    return (
      <ButtonDropdown
        className={'btn-send btn-emphasis btn-text'}
        style={{ order: -100 }}
        primaryItem={this._renderSendActionItem(sendActions[0])}
        primaryTitle={sendActions[0].title}
        primaryClick={this._onPrimaryClick}
        closeOnMenuClick
        menu={menu}
      />
    );
  }

  render() {
    return this.props.sendActions.length === 1
      ? this._renderSingleButton()
      : this._renderButtonDropdown();
  }
}

const EnhancedSendActionButton = ListensToFluxStore(SendActionButton, {
  stores: [SendActionsStore],
  getStateFromStores(props) {
    return {
      sendActions: SendActionsStore.orderedSendActionsForDraft(props.draft),
    };
  },
});

// TODO this is a hack so that the send button can still expose
// the `primarySend` method required by the ComposerView. Ideally, this
// decorator mechanism should expose whatever instance methods are exposed
// by the component its wrapping.
// However, I think the better fix will happen when mail merge lives in its
// own window and doesn't need to override the Composer's send button, which
// is already a bit of a hack.
Object.assign(EnhancedSendActionButton.prototype, {
  primarySend() {
    if (this._composedComponent) {
      this._composedComponent.primarySend();
    }
  },
});

(EnhancedSendActionButton as any).UndecoratedSendActionButton = SendActionButton;

export default EnhancedSendActionButton;
