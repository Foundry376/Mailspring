import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import os from 'os';
import fs from 'fs';
import { RetinaImg } from 'mailspring-component-kit';

import xmpp from '../../../xmpp';
import uuid from 'uuid/v4';
import TextArea from 'react-autosize-textarea';
import { FILE_TYPE } from '../../../utils/filetypes';
import emoji from 'node-emoji';
import { Actions, ReactDOM } from 'mailspring-exports';
import EmojiPopup from '../../common/EmojiPopup';
import EmailAttachmentPopup from '../../common/EmailAttachmentPopup';
import { beginStoringMessage } from '../../../actions/db/message';
import { MESSAGE_STATUS_RECEIVED } from '../../../../model/Message';
import { updateSelectedConversation } from '../../../actions/db/conversation';
import { sendFileMessage } from '../../../utils/message';
import { sendCmd2App2, getMyAppByShortName, getMyApps, getToken, sendMsg2App2 } from '../../../utils/appmgt';
import PluginPrompt from './PluginPrompt';
import { xmpplogin } from '../../../utils/restjs';
const { exec } = require('child_process');
import { RoomStore } from 'chat-exports';

const getCaretCoordinates = require('../../../utils/textarea-caret-position');

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

export default class MessagesSendBar extends PureComponent {
  static propTypes = {
    onMessageSubmitted: PropTypes.func.isRequired,
    selectedConversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string,
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
    suggestions: [],
    suggestionStyle: activeStyle,
    roomMembers: [],
    occupants: [],
  }
  emojiRef = null;

  fileInput = null;
  textarea = null;


  componentWillReceiveProps = async nextProps => {
    if (!nextProps || !nextProps.selectedConversation) {
      return;
    }
    const { selectedConversation } = nextProps;
    if (!selectedConversation.curJid) {
      return;
    }
    const userId = selectedConversation.curJid.split('@')[0];
    const keyword2app = {};
    let apps = getMyApps(userId);
    apps = apps && apps.apps;
    apps = apps || [];
    apps.forEach(app => {
      const keywords = [app.shortName, app.appName].concat(app.keywords);
      keywords.forEach(keyword => {
        keyword2app[keyword] = app;
      })
    });
    const state = Object.assign({}, this.state, { keyword2app });
    this.setState(state);
  }

  componentDidMount = async () => {
    const roomMembers = await this.getRoomMembers();
    const occupants = roomMembers.map(item => item.jid.bare);
    this.setState({
      roomMembers,
      occupants
    })
  }

  getRoomMembers = async () => {
    const { selectedConversation: conversation } = this.props;
    if (conversation.isGroup) {
      return await RoomStore.getRoomMembers(conversation.jid, conversation.curJid);
    }
    return [];
  }

  onMessageBodyKeyPressed(event) {
    const { nativeEvent } = event;
    if (nativeEvent.keyCode === 13 && !nativeEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
      const state = Object.assign({}, this.state, { prefix: '', messageBody: '' });
      this.setState(state);
      return false;
    }
    return true;
  }
  onInputKeyUp = (event) => {
    const { nativeEvent } = event;
    event.preventDefault();
    event.stopPropagation();
    if (nativeEvent.keyCode == 27) { //ESC
      nativeEvent.target.value = '';
      const prefix = '';
      const state = Object.assign({}, this.state, { prefix });
      this.setState(state);
    } else if (nativeEvent.keyCode != 13) {
      const prefix = nativeEvent.target.value;
      const promptPos = getCaretCoordinates(nativeEvent.target, nativeEvent.target.value.length);
      const state = Object.assign({}, this.state, { prefix, promptPos });
      this.setState(state);
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
    const { selectedConversation } = this.props;
    if (!selectedConversation.isGroup) {
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
  sendCommand2App(userId, app, command, peerUserId, roomId) {
    const { selectedConversation, onMessageSubmitted } = this.props;
    let { id, name, commandType } = app;
    let userName = '';
    getToken(userId).then(token => {
      if (command) {
        sendCmd2App2(userId, userName, token, id, command, peerUserId, roomId, (err, data) => {
          if (err || !data || commandType !== 2) {
            return;
          }
          const appJid = id + '@app.im.edison.tech';
          data = JSON.parse(data);
          data.appJid = appJid;
          data.appName = name;
          data.isAppprivateCommand = true;
          const msg = {
            id: uuid(),
            conversationJid: selectedConversation.jid,
            sender: appJid,
            body: JSON.stringify(data),
            sentTime: (new Date()).getTime() + edisonChatServerDiffTime,
            status: MESSAGE_STATUS_RECEIVED,
          };
          chatReduxStore.dispatch(beginStoringMessage(msg));
          // chatReduxStore.dispatch(updateSelectedConversation(selectedConversation));

        });
      }
    })
  }
  sendMessage2App(userId, appId, content) {
    let userName = '';
    getToken(userId).then(token => {
      sendMsg2App2(userId, userName, token, appId, content, (err, data) => {
        console.log(err, data);
      });
    });
  }

  installApp = async (e) => {
    const conv = this.props.selectedConversation;
    const { curJid } = conv;
    const userId = curJid.split('@')[0];
    let token = await getToken(userId);
    xmpplogin(userId, token, (err, data) => {
      if (data) {
        data = JSON.parse(data);
        if (data.data && data.data.url) {
          exec('open ' + data.data.url);
        } else {
          window.alert('fail to open the app store page');
        }
      }
    })
  }

  sendMessage() {
    let { messageBody, occupants } = this.state;
    const { selectedConversation, onMessageSubmitted } = this.props;
    const atIndex = selectedConversation.jid.indexOf('@')
    let jidLocal = selectedConversation.jid.slice(0, atIndex);

    let curJidLocal = selectedConversation.curJid.split('@')[0];//.slice(0, selectedConversation.curJid.indexOf('@'));
    if (messageBody === '/install-chat-plugin-app') {
      this.installApp();
      return;
    } else if (messageBody.indexOf('/') == 0) {
      let peerUserId, roomId;
      let appName = messageBody.split(' ')[0].substring(1);
      let app = getMyAppByShortName(curJidLocal, appName);
      if (app && app.length > 0) {
        if (selectedConversation.isGroup) {
          roomId = jidLocal;
        } else {
          //console.log('yazz-test88', jidLocal, curJidLocal);
          if (jidLocal != app[0].id) {
            peerUserId = jidLocal;
          }
        }
        this.sendCommand2App(curJidLocal, app[0], messageBody, peerUserId, roomId);
        this.setState({ messageBody: '', files: [] });
        return;
      }
    } else if (selectedConversation.jid.indexOf('@app') > 0) {
      this.sendMessage2App(curJidLocal, jidLocal, messageBody);
      this.setState({ messageBody: '', files: [] });
      return;
    }

    messageBody = messageBody.replace(/&nbsp;|<br \/>/g, ' ');

    if (!selectedConversation) {
      return;
    }

    if (this.state.files.length) {
      this.state.files.map((file, index) => sendFileMessage(file, index, this, messageBody));
    } else {
      let message = messageBody.trim();
      if (message) {
        let body = {
          type: FILE_TYPE.TEXT,
          timeSend: new Date().getTime(),
          content: message,
          email: selectedConversation.email,
          name: selectedConversation.name,
          occupants,
          atJids: this.getAtTargetPersons()
        };
        const messageId = uuid();
        onMessageSubmitted(selectedConversation, JSON.stringify(body), messageId, false);
      }
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

  hidePrompt = () => {
    const state = Object.assign({}, this.state, { prefix: '' });
    this.setState(state);
  }

  clearFiles = (e) => {
    this.setState(Object.assign({}, this.state, { files: [] }));
  };

  onSearchChange = (value) => {
    const { selectedConversation } = this.props;
    if (!selectedConversation.isGroup) {
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
    setTimeout(() => el.focus(), 10);
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
    const inputProps = {};
    const { selectedConversation } = this.props;
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
          maxRows={5}
          value={this.state.messageBody}
          onChange={this.onMessageBodyChanged.bind(this)}
          onKeyPress={this.onMessageBodyKeyPressed.bind(this)}
          onKeyUp={this.onInputKeyUp}
          ref={element => { this.textarea = element; }}
          onKeyDown={this.onKeyDown}
          {...inputProps}
        />
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
        {/* <div key='attachments' className="sendbar-attacment" ref={(el) => { this.attachmentRef = el }}>
          <Button className='no-border' onClick={this.onEmailAttachmentTouch}>
            <InfoIcon className="icon" />
          </Button>
        </div> */}

        <div className="chat-tool-bar" ref={emoji => { this.emojiRef = emoji }}>
          <Button
            onClick={() => {
              this.fileInput.click();
            }}
          >
            <RetinaImg name={'attachments.svg'}
              style={{ width: 20, height: 20 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
            <input
              style={{ display: 'none' }}
              ref={element => { this.fileInput = element; }}
              type="file"
              multiple
              onChange={this.onFileChange}
            />
          </Button>
          <Button onClick={this.onEmojiTouch}>
            <RetinaImg name={'emoji.svg'}
              style={{ width: 20, height: 20 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </Button>
        </div>
        <PluginPrompt conversation={selectedConversation}
          pos={this.state.promptPos}
          prefix={this.state.prefix}
          keyword2app={this.state.keyword2app}
          hidePrompt={this.hidePrompt}
          installApp={this.installApp}
        />
      </div>
    );
  }
}
