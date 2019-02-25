import { React, PropTypes, Actions, SendActionsStore, SoundRegistry } from 'mailspring-exports';
import { Menu, RetinaImg, ButtonDropdown, ListensToFluxStore } from 'mailspring-component-kit';

class SendActionButton extends React.Component {
  static displayName = 'SendActionButton';

  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object,
    isValidDraft: PropTypes.func,
    sendActions: PropTypes.array,
    disabled: PropTypes.bool,
    sendButtonTimeout: PropTypes.number,
  };
  static default = {
    sendButtonTimeout: 1000, // in milliseconds
  };

  constructor(props) {
    super(props);
    this.state = { isSending: false, mounted: false };
    this._sendButtonTimer = null;
    this._mounted = false;
    this._unlisten = [
      Actions.draftDeliveryFailed.listen(this._onSendDraftProcessCompleted, this),
      Actions.draftDeliveryCancelled.listen(this._onSendDraftProcessCompleted, this),
    ]
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._sendButtonTimer);
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

  primarySend() {
    this._onPrimaryClick();
  }

  _onPrimaryClick = () => {
    this._onSendWithAction(this.props.sendActions[0]);
  };

  _onSendWithAction = sendAction => {
    if (this.props.isValidDraft() && !this.state.isSending) {
      this.setState({ isSending: true });
      if (AppEnv.config.get('core.sending.sounds')) {
        SoundRegistry.playSound('hit-send');
      }
      Actions.sendDraft(this.props.draft.headerMessageId, { actionKey: sendAction.configKey });
    }
  };
  _onSendDraftProcessCompleted = ({ headerMessageId }) => {
    if (this._mounted && headerMessageId && headerMessageId === this.props.draft.headerMessageId) {
      clearTimeout(this._sendButtonTimer);
      this._sendButtonTimer = setTimeout(() => {
        this.setState({ isSending: false });
      }, this.props.sendButtonTimeout);
    }
  };

  _renderSendActionItem = ({ iconUrl }) => {
    let plusHTML = '';
    let additionalImg = false;

    if (iconUrl) {
      plusHTML = <span>&nbsp;+&nbsp;</span>;
      additionalImg = <RetinaImg url={iconUrl} mode={RetinaImg.Mode.ContentIsMask}/>;
    }

    return (
      <span>
        <RetinaImg name={!this.state.isSending ? 'sent.svg' : 'sending-spinner.gif'}
                   style={{ width: 27, height: 27 }}
                   isIcon={!this.state.isSending}
                   mode={RetinaImg.Mode.ContentIsMask}/>
        <span className="text">Send{plusHTML}</span>
        {additionalImg}
      </span>
    );
  };

  _renderSingleButton() {
    return (
      <button
        tabIndex={-1}
        className={`btn btn-toolbar btn-normal btn-send ${this.state.isSending ? 'btn-disabled' : ''}`}
        style={{ order: 100 }}
        onClick={!this.props.disabled ? this._onPrimaryClick : null}
        disabled={this.props.disabled}
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
        primaryClick={!this.props.disabled ? this._onPrimaryClick : null}
        disabled={this.props.disabled}
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
