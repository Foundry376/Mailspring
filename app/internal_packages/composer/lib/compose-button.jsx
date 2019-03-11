import React from 'react';
import PropTypes from 'prop-types';
import { Actions } from 'mailspring-exports';
import { RetinaImg, LottieImg } from 'mailspring-component-kit';

const buttonTimeout = 700;
export default class ComposeButton extends React.Component {
  static displayName = 'ComposeButton';

  constructor(props) {
    super(props);
    this.state = { creatingNewDraft: false };
    this._sendButtonClickedTimer = null;
    this._mounted = false;
    this._unlisten = Actions.composedNewBlankDraft.listen(this._onNewDraftCreated, this);
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._sendButtonClickedTimer);
    this._unlisten();
  }

  _timoutButton = () => {
    if (!this._sendButtonClickedTimer) {
      this._sendButtonClickedTimer = setTimeout(() => {
        if (this._mounted) {
          this.setState({ creatingNewDraft: false });
        }
        this._sendButtonClickedTimer = null;
      }, buttonTimeout);
    }
  };

  _onNewDraftCreated = () => {
    if (!this._mounted) {
      return;
    }
    if (this._sendButtonClickedTimer) {
      return;
    }
    this._sendButtonClickedTimer = setTimeout(() => {
      if (this._mounted) {
        this.setState({ creatingNewDraft: false });
      }
      this._sendButtonClickedTimer = null;
    }, buttonTimeout);
  };

  _onNewCompose = () => {
    if (!this.state.creatingNewDraft && !this._sendButtonClickedTimer) {
      this._timoutButton();
      this.setState({ creatingNewDraft: true });
      Actions.composeNewBlankDraft();
    }
  };

  render() {
    return (
      <button
        className={`btn btn-toolbar item-compose ${
          this.state.creatingNewDraft ? 'btn-disabled' : ''
          }`}
        title="Compose new message"
        disabled={this.state.creatingNewDraft}
        onClick={this._onNewCompose}
      >
        {this.state.creatingNewDraft ?
          <LottieImg name='loading-spinner-blue'
                     size={{ width: 24, height: 24 }}
                     style={{ margin: 'none' }}/> :
          <RetinaImg name='email.svg'
                     style={{ width: 24 }}
                     isIcon={true}
                     mode={RetinaImg.Mode.ContentIsMask}/>
        }
        <span>Compose</span>
      </button>
    );
  }
}
