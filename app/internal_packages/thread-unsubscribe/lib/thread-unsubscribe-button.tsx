import React from 'react';
import { Message, localized, PropTypes } from 'mailspring-exports';
import { RetinaImg, BindGlobalCommands } from 'mailspring-component-kit';

function unsubscribe(message) {
  //
}

function canUnsubscribe(message) {
  if (message.extraHeaders && message.extraHeaders['X-UNSUBSCRIBE'] !== null) {
    return true;
  }
  if (message.body) {
    console.log('got body!');
  }
}

export default class ThreadUnsubscribeButton extends React.Component {
  static displayName = 'ThreadUnsubscribeButton';

  static containerRequired = false;

  static propTypes = { message: PropTypes.instanceOf(Message).isRequired };

  state = {
    v: 0,
  };

  _mounted: boolean = false;

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _onClick = async () => {
    const message = this.props.items.find(canUnsubscribe);
    if (!message) return;
    this.setState({ v: this.state.v + 1 });
    await unsubscribe(message);
    if (!this._mounted) return;
    this.setState({ v: this.state.v + 1 });
  };

  render() {
    if (!canUnsubscribe(this.props.message)) {
      return <span />;
    }

    return (
      <BindGlobalCommands commands={{ 'core:unsubscribe': () => this._onClick() }}>
        <button
          className={`btn btn-toolbar thread-unsubscribe-button`}
          title={localized('Share')}
          style={{ marginRight: 0 }}
          onClick={this._onClick}
        >
          <RetinaImg name="ic-toolbar-native-share.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}
