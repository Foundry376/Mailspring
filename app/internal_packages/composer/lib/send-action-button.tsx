import React from 'react';
import {
  localized,
  ISendAction,
  Actions,
  SendActionsStore,
  SoundRegistry,
  Message,
} from 'mailspring-exports';
import { Menu, RetinaImg, ButtonDropdown } from 'mailspring-component-kit';

interface SendActionButtonProps {
  tabIndex: number;
  style: any;
  draft: Message;
  isValidDraft: () => boolean;
}

interface SendActionButtonState {
  sendActions: ISendAction[];
}

export class SendActionButton extends React.Component<
  SendActionButtonProps,
  SendActionButtonState
> {
  static displayName = 'SendActionButton';

  static containerRequired = false;

  _unlisteners = [];
  _composedComponent: any;

  constructor(props) {
    super(props);
    this.state = {
      sendActions: SendActionsStore.orderedSendActionsForDraft(props.draft),
    };
  }

  componentDidMount() {
    this._unlisteners.push(
      SendActionsStore.listen(() => {
        this.setState({
          sendActions: SendActionsStore.orderedSendActionsForDraft(this.props.draft),
        });
      })
    );
  }

  componentWillReceiveProps(nextProps) {
    this.setState({
      sendActions: SendActionsStore.orderedSendActionsForDraft(nextProps.draft),
    });
  }

  componentWillUnmount() {
    for (const unlisten of this._unlisteners) {
      unlisten();
    }
    this._unlisteners = [];
  }

  /* This component is re-rendered constantly because `draft` changes in random ways.
  We only use the draft prop when you click send, so update with more discretion. */
  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextState.sendActions.map(a => a.configKey).join(',') !==
      this.state.sendActions.map(a => a.configKey).join(',')
    );
  }

  primarySend() {
    this._onPrimaryClick();
  }

  _onPrimaryClick = () => {
    this._onSendWithAction(this.state.sendActions[0]);
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
        {this._renderSendActionItem(this.state.sendActions[0])}
      </button>
    );
  }

  _renderButtonDropdown() {
    const { sendActions } = this.state;
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
    return this.state.sendActions.length === 1
      ? this._renderSingleButton()
      : this._renderButtonDropdown();
  }
}
