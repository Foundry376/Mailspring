import { React, PropTypes, Actions, SendActionsStore, SoundRegistry, OnlineStatusStore, WorkspaceStore } from 'mailspring-exports';
import { Menu, RetinaImg, LottieImg, ButtonDropdown, ListensToFluxStore } from 'mailspring-component-kit';

const sendButtonTimeout = 700;

class SendActionButton extends React.Component {
  static displayName = 'SendActionButton';

  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object,
    isValidDraft: PropTypes.func,
    sendActions: PropTypes.array,
    disabled: PropTypes.bool,
  };

  constructor(props) {
    super(props);
    this.state = { isSending: false, mounted: false, showLoading: false, offline: !OnlineStatusStore.isOnline() };
    this._sendButtonTimer = null;
    this._delayLoadingTimer = null;
    this._mounted = false;
    this._unlisten = [
      OnlineStatusStore.listen(this.onlineStatusChanged, this),
      Actions.draftDeliveryFailed.listen(this._onSendDraftProcessCompleted, this),
      Actions.draftDeliveryCancelled.listen(this._onSendDraftProcessCompleted, this),
    ];
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._sendButtonTimer);
    clearTimeout(this._delayLoadingTimer);
    this._unlisten.forEach(unlisten => {
      unlisten();
    });
  }


  /* This component is re-rendered constantly because `draft` changes in random ways.
  We only use the draft prop when you click send, so update with more discretion. */
  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.sendActions.map(a => a.configKey).join(',') !==
      this.props.sendActions.map(a => a.configKey).join(',') ||
      this.props.disabled !== nextProps.disabled ||
      this.state.isSending !== nextState.isSending
    );
  }
  onlineStatusChanged = ({ onlineDidChange }) => {
    if (onlineDidChange) {
      this.setState({ offline: !OnlineStatusStore.isOnline() });
    }
  }

  primarySend() {
    this._onPrimaryClick();
  }

  _onPrimaryClick = () => {
    if (this.props.disabled) {
      if (WorkspaceStore.layoutMode() === 'popout') {
        console.error('SendActionButton is disabled in popout composer, this is wrong', this.props);
        AppEnv.reportError(
          new Error(`SendActionButton::_onPrimaryClick: SendActionButton is disabled in popout composer, this is wrong`, this.props)
        );
      }
      return;
    }
    this._onSendWithAction(this.props.sendActions[0]);
  };
  _timoutButton = () => {
    if (!this._sendButtonTimer) {
      this._sendButtonTimer = setTimeout(() => {
        clearTimeout(this._delayLoadingTimer);
        if (this._mounted) {
          this.setState({ isSending: false, showLoading: false });
        }
        this._sendButtonTimer = null;
      }, sendButtonTimeout);
    }
  };
  _delayShowLoading = () => {
    clearTimeout(this._delayLoadingTimer);
    this._delayLoadingTimer = setTimeout(() => {
      if (this._mounted) {
        this.setState({ showLoading: true });
      }
    }, sendButtonTimeout);
  };

  _onSendWithAction = sendAction => {
    if (this.props.isValidDraft() && !this.state.isSending && !this._sendButtonTimer) {
      this._timoutButton();
      this._delayShowLoading();
      this.setState({ isSending: true });
      if (AppEnv.config.get('core.sending.sounds')) {
        SoundRegistry.playSound('hit-send');
      }
      Actions.sendDraft(this.props.draft.headerMessageId, { actionKey: sendAction.configKey });
    }
  };
  _onSendDraftProcessCompleted = ({ headerMessageId }) => {
    if (this._mounted && headerMessageId && headerMessageId === this.props.draft.headerMessageId) {
      clearTimeout(this._delayLoadingTimer);
      if (this._sendButtonTimer) {
        return;
      }
      this._sendButtonTimer = setTimeout(() => {
        if (this._mounted) {
          this.setState({ isSending: false, showLoading: false });
        }
        this._sendButtonTimer = null;
      }, sendButtonTimeout);
    }
  };

  _renderSendActionItem = ({ iconUrl }) => {
    let plusHTML = '';
    let additionalImg = false;

    if (iconUrl) {
      plusHTML = <span>&nbsp;+&nbsp;</span>;
      additionalImg = <RetinaImg url={iconUrl} mode={RetinaImg.Mode.ContentIsMask} />;
    }

    return (
      <span>
        {this.state.showLoading ?
          <LottieImg name='loading-spinner-transparent'
            size={{ width: 27, height: 27 }}
            style={{ margin: '0', display: 'inline-block', float: 'left' }} /> :
          <RetinaImg name={'sent.svg'}
            style={{ width: 27, height: 27 }}
            isIcon={true}
            mode={RetinaImg.Mode.ContentIsMask} />
        }
        <span className="text">Send{plusHTML}</span>
        {additionalImg}
      </span>
    );
  };

  _renderSingleButton() {
    const style = Object.assign({ order: 100 }, this.props.style);
    return (
      <button
        tabIndex={-1}
        className={`btn btn-toolbar btn-normal btn-send`}
        style={style}
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
        style={{ order: 100 }}
        primaryItem={this._renderSendActionItem(sendActions[0])}
        primaryTitle={sendActions[0].title}
        primaryClick={!this.props.disabled && !this.state.offline ? this._onPrimaryClick : null}
        disabled={this.props.disabled || this.state.offline}
        closeOnMenuClick
        menu={menu}
      />
    );
  }

  render() {
    // return this.props.sendActions.length === 1
    //   ? this._renderSingleButton()
    //   : this._renderButtonDropdown();
    return this._renderSingleButton();
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

EnhancedSendActionButton.UndecoratedSendActionButton = SendActionButton;

export default EnhancedSendActionButton;
