/* eslint global-require: 0 */
import { React, PropTypes } from 'mailspring-exports';
import MessageTimestamp from './message-timestamp';

export default class MessageControls extends React.Component {
  static displayName = 'MessageControls';
  static propTypes = {
    message: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);
    this._mounted = false;
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }
  render() {
    return (
      <div className="message-actions-wrap" onClick={e => e.stopPropagation()}>
        <MessageTimestamp
          className="message-time"
          isDetailed
          date={this.props.message.date}
        />

      </div>
    );
  }
}
