import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import os from 'os';
import fs from 'fs';
import { RetinaImg } from 'mailspring-component-kit';
import TextArea from 'react-autosize-textarea';
import { FILE_TYPE } from '../../../../utils/filetypes';
import emoji from 'node-emoji';
import { Actions, ReactDOM } from 'mailspring-exports';
import EmojiPopup from '../../common/EmojiPopup';
import { RoomStore, MessageSend } from 'chat-exports';

const FAKE_SPACE = '\u00A0';

const activeStyle = {
  transform: 'scaleY(1)',
  transition: 'all 0.25s cubic-bezier(.3,1.2,.2,1)',
  zIndex: 9999
};

const disableStyle = {
  transform: 'scaleY(0)',
  transition: 'all 0.25s cubic-bezier(.3,1,.2,1)',
};

const platform = require('electron-platform')
const { clipboard } = require('electron');
const plist = require('plist');

//linux is not implemented because no method was found after googling a lot
// only be tested on mac, not be tested on Windows
//https://github.com/electron/electron/issues/9035
function getClipboardFiles() {
  if (platform.isDarwin) {
    const image = clipboard.readImage();
    // get the screen capture
    if (!image.isEmpty()) {
      const filePath = os.tmpdir() + `/EdisonCapture${new Date().getTime()}.png`;
      fs.writeFileSync(filePath, image.toPNG());
      return filePath;
    }
    else if (!clipboard.has('NSFilenamesPboardType')) {
      // this check is neccessary to prevent exception while no files is copied
      return [];
    } else {
      return plist.parse(clipboard.read('NSFilenamesPboardType'));
    }
  } else if (platform.isWin32) {
    clipboard.readBuffer('FileNameW').replace(RegExp(String.fromCharCode(0), 'g'), '');
  }
}

export default class MessageEditBar extends PureComponent {
  static propTypes = {
    value: PropTypes.string.isRequired,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string,
      email: PropTypes.string,//.isRequired,
      isGroup: PropTypes.bool.isRequired
    }).isRequired,
  }

  static defaultProps = {
    conversation: null
  }

  state = {
    messageBody: this.props.value || '',
    files: [],
    suggestions: [],
    suggestionStyle: activeStyle,
    roomMembers: [],
    // occupants: [],
  }
  emojiRef = null;

  fileInput = null;
  textarea = null;

  componentDidMount = async () => {
    const roomMembers = await this.getRoomMembers();
    // const occupants = roomMembers.map(item => item.jid.bare);
    this.setState({
      roomMembers,
      // occupants
    })
    if (this.textarea) {
      this.textarea.focus();
    }
    setTimeout(() => {
      if (document.querySelector(".edit-button-group")) {
        document.querySelector(".edit-button-group").scrollIntoViewIfNeeded(false);
      }
    }, 30);
  }

  getRoomMembers = async () => {
    const { conversation } = this.props;
    if (conversation.isGroup) {
      return await RoomStore.getRoomMembers(conversation.jid, conversation.curJid);
    }
    return [];
  }

  onMessageBodyKeyPressed = (event) => {
    const { nativeEvent } = event;
    if (nativeEvent.keyCode === 13 && !nativeEvent.shiftKey) {
      event.preventDefault();
      this.onSave();
      return false;
    }
    return true;
  }

  onMessageBodyChanged = (e) => {
    const messageBody = emoji.emojify(e.target.value);
    this.setState({
      messageBody
    });
  }

  getAtTargetPersons = () => {
    const { messageBody, roomMembers } = this.state;
    const { conversation } = this.props;
    if (!conversation.isGroup) {
      return [];
    }
    const atJids = [];
    let atPersonNames = messageBody.match(/@[^ ]+ |@[^ ]+$/g);

    if (atPersonNames) {
      atPersonNames = atPersonNames.map(item => {
        return item.trim().substr(1).replace(/&nbsp;/g, ' ')
      });
      for (const name of atPersonNames) {
        for (const member of roomMembers) {
          if (member.name === name) {
            atJids.push(member.jid.bare);
            break;
          }
        }
      }
    }
    return atJids;
  }

  sendMessage = () => {
    let messageBody = this.textarea.value;
    messageBody = messageBody.replace(/&nbsp;|<br \/>/g, ' ');
    const { conversation, msg } = this.props;

    if (!conversation) {
      return;
    }

    let updating = true;
    const messageId = msg.id;
    let message = messageBody.trim();
    if (message) {
      let body = {
        type: FILE_TYPE.TEXT,
        timeSend: new Date().getTime() + edisonChatServerDiffTime,
        content: message,
        email: conversation.email,
        name: conversation.name,
        // occupants,
        atJids: this.getAtTargetPersons(),
        updating
      };
      MessageSend.sendMessage(body, conversation, messageId, updating);
    }

    this.setState({ messageBody: '', files: [] });
  }

  onFileChange = event => {
    let state,
      files = [];
    // event.target.files is type FileList
    // it need be converted to Array  to use this.state.files.map(...) in jsx
    for (let file of event.target.files) {
      files.push(file.path);
    }
    state = Object.assign({}, this.state, { files });
    this.setState(state, () => {
      this.sendMessage();
    });
    event.target.value = '';
    // event.target.files = new window.FileList();
  };

  onDrop = (e) => {
    let tranFiles = e.dataTransfer.files,
      files = this.state.files.slice();
    for (let i = 0; i++; i < tranFiles.length) {
      files.push(tranFiles[i].path);
    }
    this.setState(Object.assign({}, this.state, { files }));
  };

  onKeyUp = (e) => {
    if (e.keyCode === 27) {
      //ESC key
      this.props.cancelEdit();
      this.hide();
    } else if (e.keyCode == 13) {
      // enter key
      this.sendMessage();
      this.hide();
    }
    e.preventDefault();
    e.stopPropagation();
  };

  onSearchChange = (value) => {
    const { conversation } = this.props;
    if (!conversation.isGroup) {
      return;
    }
    const { roomMembers } = this.state;
    const searchValue = value.toLowerCase();
    const memberNames = roomMembers.map(item => item.name.replace(/ /g, FAKE_SPACE));
    const filtered = memberNames.filter(item =>
      item.toLowerCase().indexOf(searchValue) !== -1
    );
    this.setState({
      suggestions: filtered,
      suggestionStyle: filtered.length ? activeStyle : disableStyle
    });
  };
  onEmojiSelected = (value) => {
    Actions.closePopover();
    let el = ReactDOM.findDOMNode(this.textarea);
    el.focus();
    document.execCommand('insertText', false, value);
    setTimeout(() => el.focus(), 10);
  };
  onEmojiTouch = () => {
    let rectPosition = ReactDOM.findDOMNode(this.emojiRef);
    if (!this.state.openEmoji) {
      Actions.openPopover(<EmojiPopup onEmojiSelected={this.onEmojiSelected} />, {
        direction: 'up',
        originRect: {
          top: rectPosition.getBoundingClientRect().top,
          left: rectPosition.getBoundingClientRect().left,
          width: 250,
        },
        closeOnAppBlur: true,
        onClose: () => {
          this.setState({ openEmoji: false });
        },
      });
    } else {
      Actions.closePopover();
    }
    this.setState({ openEmoji: !this.state.openEmoji });
  }

  hide = () => {
    const state = Object.assign({}, this.state, { hidden: true });
    this.setState(state);
  }
  onCancel = () => {
    this.props.cancelEdit();
    this.hide();

  }
  onSave = () => {
    let messageBody = this.textarea.value;
    if (!messageBody.trim()) {
      this.props.deleteMessage();
      return;
    }
    this.sendMessage();
    this.hide();
  }

  render() {
    // const { suggestions, suggestionStyle } = this.state;
    const inputProps = {};
    if (this.props.createRoom) {
      inputProps.onFocus = () => {
        this.props.createRoom();
      }
    }
    if (this.state.hidden) {
      return null;
    }
    return (
      <div className="sendBar">
        <TextArea
          className="messageTextField"
          placeholder="Edison Chat"
          rows={1}
          maxRows={20}
          value={this.state.messageBody}
          onChange={this.onMessageBodyChanged}
          onKeyPress={this.onMessageBodyKeyPressed}
          innerRef={element => { this.textarea = element; }}
          onKeyUp={this.onKeyUp}
          {...inputProps}
        />
        <div className="edit-button-group" ref={emoji => { this.emojiRef = emoji }}>
          <Button onClick={this.onEmojiTouch} className="emoji">
            <RetinaImg name={'emoji.svg'}
              style={{ width: 20, height: 20 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </Button>
          <Button className="cancel" onClick={this.onCancel}>Cancel</Button>
          <Button onClick={this.onSave}>
            Save Changes
          </Button>
        </div>
        <div className="chat-message-filelist">
          {this.state.files.map((file, index) => {
            const removeFile = (e) => {
              let files = this.state.files;
              index = files.indexOf(file);
              files.splice(index, 1);
              files = files.slice();
              this.setState(Object.assign({}, this.state, { files }));
            };
            return (
              <div id='remove-file' key={index} onClick={removeFile} title={file}>
                <RetinaImg
                  name="fileIcon.png"
                  mode={RetinaImg.Mode.ContentPreserve}
                  key={index}
                />
                <div id='remove-file-inner' title="remove this file from the list">
                  -
                </div>
              </div>
            );
          })
          }
        </div>
      </div>
    );
  }
}
