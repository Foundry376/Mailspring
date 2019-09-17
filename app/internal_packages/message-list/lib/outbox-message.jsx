import { React } from 'mailspring-exports';
import MessageList from './message-list';
export default class OutboxMessage extends React.Component {
  static displayName = 'OutboxMessageList';

  constructor(props) {
    super(props);
  }
  render() {
    return <MessageList />;
  }
};

