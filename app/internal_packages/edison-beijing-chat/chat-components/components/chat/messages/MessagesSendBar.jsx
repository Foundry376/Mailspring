import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import TextArea from 'react-autosize-textarea';
import Button from '../../common/Button';
import FilePlusIcon from '../../common/icons/FilePlusIcon';
import SendIcon from '../../common/icons/SendIcon';
import { theme } from '../../../utils/colors';
import { uploadeFile } from '../../../utils/awss3';
import RetinaImg from '../../../../../../src/components/retina-img';

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
    files: [],
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
    let state = Object.assign({}, this.state, { messageBody: value });
    this.setState(state);
  }

  sendMessage() {
    const { messageBody } = this.state;
    const { selectedConversation } = this.props;
    const atIndex = selectedConversation.jid.indexOf('@')
    let jidLocal = selectedConversation.jid.slice(0, atIndex);

    if (this.state.files.length) {
      this.state.files.map((file, index) => {
        uploadeFile(jidLocal, null, file, (err, filename, myKey, size) => {
            if (err) {
              alert(`upload files failed, filename: ${filename}`);
              return;
            }
            let message;
            if (index === 0) {
              message = messageBody.trim();
            } else {
              message = 'file received';
            }
            if (selectedConversation && message) {
              let body = {
                type: 1,
                timeSend: new Date().getTime(),
                content: message,
                email: selectedConversation.email,
                name: selectedConversation.name,
                mediaObjectId: myKey,
              };
              this.props.onMessageSubmitted(selectedConversation, JSON.stringify(body));
            }
          },
        );
      })
    } else {
      let message = messageBody.trim();
      if (selectedConversation && message) {
        let body = {
          type: 1,
          timeSend: new Date().getTime(),
          content: message,
          email: selectedConversation.email,
          name: selectedConversation.name,
        };
        this.props.onMessageSubmitted(selectedConversation, JSON.stringify(body));//message);
      }

    }
    this.setState({ messageBody: '', files: [] });
  }
  onChange = event => {
    let state,
      files = [];
    // event.target.files is type FileList
    // it need be converted to Array  to use this.state.files.map(...) in jsx
    for (let file of event.target.files) {
      files.push(file.path);
    }
    state = Object.assign({}, this.state, { files });
    this.setState(state);
    event.target.value = '';
    // event.target.files = new window.FileList();
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
              onChange={this.onChange}
            />
          </Button>
        </div>
        <div className="messageTextField">
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
          <div className="chat-message-filelist">
            {this.state.files.map((file, index) => {
              return <RetinaImg
              name="fileIcon.png"
              mode={RetinaImg.Mode.ContentPreserve}
              key={index}
              />;
            })}
          </div>
        </div>
        <div className="sendBarActions">
          <Button onTouchTap={this.sendMessage.bind(this)}>
            <SendIcon color={theme.primaryColor} />
          </Button>
        </div>
      </div>
    );
  }
}
