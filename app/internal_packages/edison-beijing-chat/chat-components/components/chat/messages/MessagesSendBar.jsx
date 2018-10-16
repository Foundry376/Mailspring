import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import TextArea from 'react-autosize-textarea';
import Button from '../../common/Button';
import FilePlusIcon from '../../common/icons/FilePlusIcon';
import SendIcon from '../../common/icons/SendIcon';
import { theme } from '../../../utils/colors';

export default class MessagesSendBar extends PureComponent {
  static propTypes = {
    onMessageSubmitted: PropTypes.func.isRequired,
    selectedConversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,//.isRequired,
      isGroup: PropTypes.bool.isRequired
    }).isRequired,
  }

  static defaultProps = {
    selectedConversation: null
  }

  state = {
    messageBody: '',
  }

  fileInput = null;
  textarea = null;

  onMessageBodyKeyPressed(event) {
    const { nativeEvent } = event;
    if (nativeEvent.keyCode === 13 && !nativeEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
      return false;
    }
    return true;
  }

  onMessageBodyChanged(event) {
    const { target: { value } } = event;
    this.setState({
      messageBody: value,
    });
  }

  sendMessage() {
    const { messageBody } = this.state;
    const { selectedConversation } = this.props;
    const message = messageBody.trim();
    if (selectedConversation && message) {
      let body = {
        type: 1,
        timeSend: new Date().getTime(),
        content: message,
        email: selectedConversation.email,
        name: selectedConversation.name
      };
      this.props.onMessageSubmitted(selectedConversation, JSON.stringify(body));//message);
      this.setState({ messageBody: '' });
    }
  }

  render() {
    return (
      <div className="sendBar">
        <div className="sendBarActions">
          <Button
            onTouchTap={() => {
              this.fileInput.click();
            }}
          >
            <FilePlusIcon color={theme.primaryColor} />
            <input
              style={{ display: 'none' }}
              ref={element => { this.fileInput = element; }}
              type="file"
              multiple
            />
          </Button>
        </div>
        <TextArea
          className="messageTextField"
          placeholder="Write a message..."
          rows={1}
          maxRows={5}
          value={this.state.messageBody}
          onChange={this.onMessageBodyChanged.bind(this)}
          onKeyPress={this.onMessageBodyKeyPressed.bind(this)}
          ref={element => { this.textarea = element; }}
        />
        <div className="sendBarActions">
          <Button onTouchTap={this.sendMessage.bind(this)}>
            <SendIcon color={theme.primaryColor} />
          </Button>
        </div>
      </div>
    );
  }
}
