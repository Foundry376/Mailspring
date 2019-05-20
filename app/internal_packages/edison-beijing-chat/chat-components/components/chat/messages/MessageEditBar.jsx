import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import EmojiIcon from '../../common/icons/EmojiIcon';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { uploadFile } from '../../../utils/awss3';
import { RetinaImg } from 'mailspring-component-kit';

import xmpp from '../../../xmpp';
import uuid from 'uuid/v4';
import TextArea from 'react-autosize-textarea';
import chatModel from '../../../store/model';
import { FILE_TYPE } from './messageModel';
import emoji from 'node-emoji';
import { Actions, ReactDOM } from 'mailspring-exports';
import EmojiPopup from '../../common/EmojiPopup'
import EmailAttachmentPopup from '../../common/EmailAttachmentPopup'
import { updateSelectedConversation } from '../../../actions/db/conversation';
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
    onMessageSubmitted: PropTypes.func.isRequired,
    value: PropTypes.string.isRequired,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
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
    occupants: [],
  }
  emojiRef = null;

  fileInput = null;
  textarea = null;

  componentDidMount = async () => {
    const roomMembers = await this.getRoomMembers();
    const occupants = roomMembers.map(item => item.jid.bare);
    this.setState({
      roomMembers,
      occupants
    })
    if (this.textarea) {
      this.textarea.focus();
    }
  }

  getRoomMembers = async () => {
    const { conversation } = this.props;
    const { roomMembers } = this.state;
    if (conversation.isGroup) {
      if (roomMembers && roomMembers.length) {
        return roomMembers;
      }
      const result = await xmpp.getRoomMembers(conversation.jid, null, conversation.curJid)
      return result.mucAdmin.items;
    }
    return [];
  }

  onMessageBodyKeyPressed(event) {
    const { nativeEvent } = event;
    if (nativeEvent.keyCode === 13 && !nativeEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
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
    let { messageBody, occupants } = this.state;
    messageBody = messageBody.replace(/&nbsp;|<br \/>/g, ' ');
    const { conversation, onMessageSubmitted } = this.props;
    const atIndex = conversation.jid.indexOf('@')
    let jidLocal = conversation.jid.slice(0, atIndex);

    if (!conversation) {
      return;
    }

    if (this.state.files.length) {
      this.state.files.map((file, index) => {
        let filepath;
        if (typeof file === 'object') {
          let id = file.id;
          let configDirPath = AppEnv.getConfigDirPath();
          filepath = path.join(configDirPath, 'files', id.slice(0, 2), id.slice(2, 4), id, file.filename);
          if (!fs.existsSync(filepath)) {
            alert(`the selected file to be sent is not downloaded  to this computer: ${filepath}, ${file.id}, ${file.filename}`);
            return;
          }
        } else {
          filepath = file;
        }
        let messageId, updating = false;

        if (chatModel.editingMessageId) {
          messageId = chatModel.editingMessageId;
          updating = true;
          chatModel.editingMessageId = null;
        } else {
          messageId = uuid();
        }
        let message;
        if (index === 0) {
          message = messageBody.trim();
        } else {
          message = '📄';
        }
        let body = {
          type: FILE_TYPE.TEXT,
          timeSend: new Date().getTime(),
          isUploading: true,
          content: 'sending...',
          email: conversation.email,
          name: conversation.name,
          mediaObjectId: '',
          localFile: filepath,
          updating
        };
        if (file !== filepath) {
          body.emailSubject = file.subject;
          body.emailMessageId = file.messageId;
        }
        onMessageSubmitted(conversation, JSON.stringify(body), messageId, true);
        uploadFile(jidLocal, null, filepath, (err, filename, myKey, size) => {
          if (err) {
            alert(`upload files failed because error: ${err}, filepath: ${filepath}`);
            return;
          }
          if (filename.match(/.gif$/)) {
            body.type = FILE_TYPE.GIF;
          } else if (filename.match(/(\.bmp|\.png|\.jpg|\.jpeg)$/)) {
            body.type = FILE_TYPE.IMAGE;
          } else {
            body.type = FILE_TYPE.OTHER_FILE;
          }
          body.localFile = filepath;
          body.isUploading = false;
          body.content = message || " ";
          body.mediaObjectId = myKey;
          body.occupants = occupants;
          body.atJids = this.getAtTargetPersons();
          body.updating = updating;
          onMessageSubmitted(conversation, JSON.stringify(body), messageId, false);
        });
      })
    } else {
      let messageId, updating = false;
      debugger;
      console.log('debugger: MessageEditBar.sendMessage chatModel: ', chatModel.editingMessageId, chatModel);
      if (chatModel.editingMessageId) {
        messageId = chatModel.editingMessageId;
        updating = true;
        chatModel.editingMessageId = null;
      } else {
        messageId = uuid();
      }
      let message = messageBody.trim();
      if (message) {
        let body = {
          type: FILE_TYPE.TEXT,
          timeSend: new Date().getTime(),
          content: message,
          email: conversation.email,
          name: conversation.name,
          occupants,
          atJids: this.getAtTargetPersons(),
          updating
        };

        onMessageSubmitted(conversation, JSON.stringify(body), messageId, false);
      }

    }
    this.setState({ messageBody: '', files: [] });
    // this.refs.mention.reset();
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

  onKeyDown = (e) => {
    if (e.keyCode === 86 && (e.ctrlKey || e.metaKey)) {
      let files;
      // try-catch is neccessary to prevent exception
      // while the clipboard is containing files copied from non standard system application(e.g. webstorm)
      try {
        files = getClipboardFiles();
      }
      catch (e) {
      }
      if (!files || files.length === 0) {
        return true;
      }
      files = this.state.files.concat(files);
      this.setState(Object.assign({}, this.state, { files }), () => {
        this.sendMessage();
      });
      e.preventDefault();
      e.stopPropagation();
    } else if (e.keyCode == 13 && (e.ctrlKey || e.metaKey)) {
      this.sendMessage();
      e.preventDefault();
      e.stopPropagation();
    }
  };

  clearFiles = (e) => {
    this.setState(Object.assign({}, this.state, { files: [] }));
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
  sendEmailAttachment = (files) => {
    Actions.closePopover();
    let state = Object.assign({}, this.state, { files });
    this.setState(state, () => {
      this.sendMessage();
    });
    let el = ReactDOM.findDOMNode(this.textarea);
    el.value = '';
    el.focus();
  };
  onEmojiSelected = (value) => {
    Actions.closePopover();
    let el = ReactDOM.findDOMNode(this.textarea);
    el.focus();
    document.execCommand('insertText', false, value);
  };
  onEmailAttachmentTouch = () => {
    let attachmentEl = ReactDOM.findDOMNode(this.attachmentRef);
    if (!this.state.openAttachment) {
      Actions.openPopover(<EmailAttachmentPopup sendEmailAttachment={this.sendEmailAttachment} />, {
        direction: 'up',
        originRect: {
          top: attachmentEl.getBoundingClientRect().top,
          left: attachmentEl.getBoundingClientRect().left,
          width: 250,
        },
        closeOnAppBlur: true,
        onClose: () => {
          this.setState({ openAttachment: false });
        },
      });
    } else {
      Actions.closePopover();
    }
    this.setState({ openAttachment: !this.state.openAttachment });
  }
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

  render() {
    // const { suggestions, suggestionStyle } = this.state;
    const inputProps = {};
    if (this.props.createRoom) {
      inputProps.onFocus = () => {
        this.props.createRoom();
      }
    }
    return (
      <div className="sendBar" onDrop={this.onDrop}>
        {/* <Mention
            style={{ width: '100%', height: '70px' }}
            multiLines={true}
            onChange={this.onMessageBodyChanged}
            onSearchChange={this.onSearchChange}
            suggestions={suggestions}
            suggestionStyle={suggestionStyle}
            prefixCls="rc-editor-mention"
            notFoundContent="could not find"
            ref="mention"
            prefix="@"
          /> */}
        <TextArea
          className="messageTextField"
          placeholder="Edison Chat"
          rows={1}
          maxRows={20}
          value={this.state.messageBody}
          onChange={this.onMessageBodyChanged.bind(this)}
          onKeyPress={this.onMessageBodyKeyPressed.bind(this)}
          innerRef={element => { this.textarea = element; }}
          onKeyDown={this.onKeyDown}
          {...inputProps}
        />
        <div className="edit-button-group">
          <Button onClick={this.onEmojiTouch} className="emoji">
            <RetinaImg name={'emoji.svg'}
              style={{ width: 20, height: 20 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </Button>
          <Button className="cancel" onClick={this.props.cancelEdit}>Cancel</Button>
          <Button onClick={this.sendMessage}>
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
          {this.state.files.length ?
            <div id="clear-all-files" title="clear all files from the list" onClick={this.clearFiles}> X </div> :
            null
          }
        </div>
      </div>
    );
  }
}
