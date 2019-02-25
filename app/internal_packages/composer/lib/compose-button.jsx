import React from 'react';
import PropTypes from 'prop-types';
import { Actions } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

export default class ComposeButton extends React.Component {
  static displayName = 'ComposeButton';
  static propTypes = {
    composeButtonTimeout: PropTypes.number,
  };

  static default = {
    composeButtonTimeout: 700, // milliseconds
  };

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

  _onNewDraftCreated = () => {
    if (!this._mounted) {
      return;
    }
    if (this._sendButtonClickedTimer) {
      clearTimeout(this._sendButtonClickedTimer);
    }
    this._sendButtonClickedTimer = setTimeout(() => {
      this.setState({ creatingNewDraft: false });
    }, this.props.composeButtonTimeout);
  };

  _onNewCompose = () => {
    if (!this.state.creatingNewDraft) {
      Actions.composeNewBlankDraft();
    }
    this.setState({ creatingNewDraft: true });
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
        <RetinaImg name={this.state.creatingNewDraft ? 'sending-spinner.gif' : 'email.svg'}
                   style={{ width: 24 }}
                   isIcon={!this.state.creatingNewDraft}
                   mode={RetinaImg.Mode.ContentIsMask}/>
        <span>Compose</span>
      </button>
    );
  }
}
