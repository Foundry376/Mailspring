import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Conversations from './Conversations';
import ConversationsTopBar from './ConversationsTopBar';
import ProgressBar from '../../common/ProgressBar';
import { ProgressBarStore } from 'chat-exports';

let key = 0;
export default class ConversationsPanel extends PureComponent {
  static propTypes = {
    referenceTime: PropTypes.number,
  };

  static defaultProps = {
    referenceTime: new Date().getTime(),
  }

  state = { progress: {} }

  componentDidMount() {
    this.unsubscribers = [];
    this.unsubscribers.push(ProgressBarStore.listen(this.onProgressChange));
  }

  componentWillUnmount() {
    return this.unsubscribers.map(unsubscribe => unsubscribe());
  }

  onProgressChange = () => {
    let { progress, props } = ProgressBarStore;
    progress = Object.assign({}, progress);
    const state = Object.assign({}, this.state, { progress }, props);
    this.setState(state);
  }


  render() {
    const {
      referenceTime,
    } = this.props;

    const conversationsProps = {
      referenceTime,
    };
    const { progress, onCancel, onRetry } = this.state;

    return (
      <div className="panel">
        <ConversationsTopBar />
        <div className="conversations">
          <Conversations {...conversationsProps} />
        </div>
        <ProgressBar progress={progress} onCancel={onCancel} onRetry={onRetry} />
      </div>
    );
  }
}
