import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import os from 'os';
import fs from 'fs';
import { RetinaImg, KeyCommandsRegion } from 'mailspring-component-kit';
import uuid from 'uuid/v4';
import { FILE_TYPE } from '../../../utils/filetypes';
import emoji from 'node-emoji';
import { Actions, ReactDOM } from 'mailspring-exports';
import EmojiPopup from '../../common/EmojiPopup';
import { MESSAGE_STATUS_RECEIVED } from '../../../model/Message';
import { sendFileMessage } from '../../../utils/message';
import { getName } from '../../../utils/name';
import {
  sendCmd2App2,
  getMyAppByShortName,
  getMyApps,
  getToken,
  sendMsg2App2,
} from '../../../utils/appmgt';
import { RichText } from '../../common/RichText';
import AtList from '../../common/AtList';
import PluginPrompt from './PluginPrompt';
import { xmpplogin } from '../../../utils/restjs';
import { MessageStore, ConversationStore, RoomStore, MessageSend } from 'chat-exports';
import { alert } from '../../../utils/electron';

const getCaretCoordinates = require('../../../utils/textarea-caret-position');
const { exec } = require('child_process');
const platform = require('electron-platform');
const { clipboard } = require('electron');
const plist = require('plist');

const AT_BEGIN_CHAR = '\u0005';
const AT_END_CHAR = '\u0004';
const AT_INDEX_BASE = 0xf000;

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
    } else if (!clipboard.has('NSFilenamesPboardType')) {
      // this check is neccessary to prevent exception while no files is copied
      return [];
    } else {
      return plist.parse(clipboard.read('NSFilenamesPboardType'));
    }
  } else if (platform.isWin32) {
    clipboard.readBuffer('FileNameW').replace(RegExp(String.fromCharCode(0), 'g'), '');
  }
}

function getTextFromHtml(str) {
  let strFormat = '';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = str;
  const childs = tempDiv.childNodes;
  childs.forEach(el => {
    if (el.nodeType === 3) {
      strFormat += el.nodeValue;
    } else if (el.nodeType === 1) {
      const jid = el.getAttribute('jid');
      if (jid) {
        strFormat += `${AT_BEGIN_CHAR}@${jid}${AT_END_CHAR}`;
      }
      if (el.nodeName === 'BR') {
        strFormat += '\n';
      }
    }
  });
  return strFormat;
}

function getAtJidFromHtml(str) {
  const atJidList = [];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = str;
  const childs = tempDiv.childNodes;
  childs.forEach(el => {
    if (el.nodeType === 1) {
      const jid = el.getAttribute('jid');
      if (jid) {
        atJidList.push(jid);
      }
    }
  });
  return atJidList;
}

export default class MessagesSendBar extends PureComponent {
  static propTypes = {
    selectedConversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string,
      email: PropTypes.string, //.isRequired,
      isGroup: PropTypes.bool.isRequired,
    }).isRequired,
  };

  static defaultProps = {
    selectedConversation: null,
  };

  state = {
    messageBody: '',
    files: [],
    roomMembers: [],
    atContacts: [],
    atPersons: [],
    atActiveIndex: 0,
    atVisible: false,
    promptPos: null,
  };

  emojiRef = null;
  fileInput = null;
  _richText = null;

  componentWillReceiveProps = async nextProps => {
    const selectedConversation = ConversationStore.selectedConversation;
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
      });
    });
    const state = Object.assign({}, this.state, { keyword2app, prefix: '' });
    if (
      nextProps.selectedConversation &&
      this.props.selectedConversation &&
      nextProps.selectedConversation.jid !== this.props.selectedConversation.jid
    ) {
      this._richText.clearNode();
    }
    this.setState(state);
  };

  componentDidMount = async () => {
    const roomMembers = await this.getRoomMembers();
    const atContacts = [
      {
        affiliation: 'member',
        jid: 'all',
        name: 'all',
      },
      ...roomMembers,
    ];
    this.setState({
      roomMembers,
      atContacts,
    });
  };

  getRoomMembers = async () => {
    const conversation = ConversationStore.selectedConversation;
    let members = [];
    if (conversation && conversation.isGroup) {
      members = await RoomStore.getRoomMembers(conversation.jid, conversation.curJid);
    }

    const renameMembers = [];
    for (const member of members) {
      member.name = await getName(member.jid);
      renameMembers.push(member);
    }

    return renameMembers;
  };

  onMessageBodyChanged = value => {
    const { roomMembers } = this.state;
    const messageHtml = emoji.emojify(value);
    // Top nodevalue element nearest to cursor
    const inputText = this._richText.getInputText();

    // msgbody is a string, not a dom element
    const messageBody = getTextFromHtml(messageHtml);
    // at choose list should change when msg @ someone
    const atJidList = getAtJidFromHtml(value);

    const inputTextHasAt = inputText.indexOf('@') >= 0;
    const splitInputText = inputText.split('@');
    const atFuzzyMatchingStr =
      splitInputText.length > 1 ? splitInputText[splitInputText.length - 1] : '';
    const atContacts = [
      {
        affiliation: 'member',
        jid: 'all',
        name: 'all',
      },
      ...roomMembers,
    ].filter(contact => {
      // filter contact that has be at
      const noBeAt = atJidList.indexOf(contact.jid) < 0;
      // filter contact that dont match search string
      const FuzzyMatching = contact.name.toLowerCase().includes(atFuzzyMatchingStr.toLowerCase());
      return noBeAt && FuzzyMatching;
    });
    // string dont have at or atList is null
    if (!atContacts.length || !inputTextHasAt) {
      this.setState({ atVisible: false });
    }
    this.setState({
      prefix: inputText,
      messageBody,
      atContacts,
    });
  };

  sendCommand2App(userId, app, command, peerUserId, roomId) {
    const { selectedConversation } = this.props;
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
            sentTime: new Date().getTime() + edisonChatServerDiffTime,
            status: MESSAGE_STATUS_RECEIVED,
          };
          MessageStore.saveMessagesAndRefresh([msg]);
        });
      }
    });
  }
  sendMessage2App(userId, appId, content) {
    let userName = '';
    getToken(userId).then(token => {
      sendMsg2App2(userId, userName, token, appId, content, (err, data) => {
        console.log(err, data);
      });
    });
  }

  sendMessage() {
    let { messageBody } = this.state;
    const { selectedConversation } = this.props;
    const atIndex = selectedConversation.jid.indexOf('@');
    let jidLocal = selectedConversation.jid.slice(0, atIndex);

    let curJidLocal = selectedConversation.curJid.split('@')[0]; //.slice(0, selectedConversation.curJid.indexOf('@'));
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
          timeSend: new Date().getTime() + edisonChatServerDiffTime,
          content: message,
          email: selectedConversation.email,
          name: selectedConversation.name,
        };

        MessageSend.sendMessage(body, selectedConversation);
      }
    }
    this._richText.clearNode();
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

  onDrop = e => {
    let tranFiles = e.dataTransfer.files,
      files = this.state.files.slice();
    for (let i = 0; i++; i < tranFiles.length) {
      files.push(tranFiles[i].path);
    }
    this.setState(Object.assign({}, this.state, { files }));
  };

  hidePrompt = () => {
    const state = Object.assign({}, this.state, { prefix: '' });
    this.setState(state);
  };

  installApp = async e => {
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
          alert(`fail to open the app store page`);
        }
      }
    });
  };

  onContextMenu = () => {
    const sel = document.getSelection();
    AppEnv.windowEventHandler.openSpellingMenuFor(sel.toString(), !sel.isCollapsed, {
      onCorrect: correction => {
        document.execCommand('insertText', false, correction);
      },
    });
  };

  onEmojiSelected = value => {
    Actions.closePopover();
    this._richText.addNode(value);
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
  };

  // --------------------------- at start ---------------------------
  chooseAtContact = contact => {
    const insertDom = document.createElement('span');
    insertDom.innerHTML = `@${contact.name}`;
    insertDom.setAttribute('jid', contact.jid);
    insertDom.setAttribute('class', 'at-contact');
    this._richText.delNode(1);
    this._richText.addNode(insertDom);
    this._richText.addNode(',');
    this.setState({ atVisible: false });
  };

  onRichTextBlur = () => {
    setTimeout(() => {
      this.setState({ atVisible: false });
    }, 200);
  };

  changeAtActiveIndex = index => {
    const { atActiveIndex, atContacts } = this.state;
    // 取模后的数的绝对值小于模数，因此加上模数可以保证为正数，在取模即可获得正模数
    let nextIndex = ((index % atContacts.length) + atContacts.length) % atContacts.length;
    if (nextIndex !== atActiveIndex) {
      this.setState({ atActiveIndex: nextIndex });
    }
  };

  // @ key event
  EscKeyEvent = () => {
    this.setState({ atVisible: false });
  };

  DownKeyEvent = () => {
    const { atActiveIndex } = this.state;
    this.changeAtActiveIndex(atActiveIndex + 1);
  };

  UpKeyEvent = () => {
    const { atActiveIndex } = this.state;
    this.changeAtActiveIndex(atActiveIndex - 1);
  };

  AtKeyEvent = () => {
    const { atContacts } = this.state;
    const { selectedConversation } = this.props;
    this.setState({
      atVisible: selectedConversation.isGroup && !!atContacts.length,
    });
  };

  EnterKeyEvent = funKeyIsOn => {
    const { atVisible, atContacts, atActiveIndex } = this.state;
    if (funKeyIsOn || !atVisible) {
      this.sendMessage();
    } else {
      const contact = atContacts[atActiveIndex];
      this.chooseAtContact(contact);
    }
  };
  // ---------------------------- at end ----------------------------

  render() {
    const { selectedConversation } = this.props;
    const { atVisible, promptPos, atContacts, atActiveIndex } = this.state;
    const keyMapping = [
      {
        keyCode: 13,
        preventDefault: true,
        stopPropagation: true,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        // enter
        keyEvent: () => this.EnterKeyEvent(false),
      },
      {
        keyCode: 13,
        preventDefault: true,
        stopPropagation: true,
        altKey: true,
        shiftKey: false,
        // alt + enter
        keyEvent: () => this.EnterKeyEvent(true),
      },
      {
        keyCode: 13,
        preventDefault: true,
        stopPropagation: true,
        ctrlKey: true,
        shiftKey: false,
        // ctrl + enter
        keyEvent: () => this.EnterKeyEvent(true),
      },
      {
        keyCode: 13,
        preventDefault: true,
        stopPropagation: true,
        metaKey: true,
        shiftKey: false,
        // meta + enter
        keyEvent: () => this.EnterKeyEvent(true),
      },
      {
        keyCode: 27,
        keyEvent: this.EscKeyEvent,
      },
      {
        keyCode: 40,
        preventDefault: true,
        stopPropagation: true,
        keyEvent: this.DownKeyEvent,
      },
      {
        keyCode: 38,
        preventDefault: true,
        stopPropagation: true,
        keyEvent: this.UpKeyEvent,
      },
      {
        keyCode: 50,
        shiftKey: true,
        keyEvent: this.AtKeyEvent,
      },
    ];
    return (
      <KeyCommandsRegion>
        <div className="sendBar" onDrop={this.onDrop} onContextMenu={this.onContextMenu}>
          <RichText
            keyMapping={keyMapping}
            placeholder="Edison Chat"
            maxRows={5}
            onChange={this.onMessageBodyChanged.bind(this)}
            ref={element => {
              this._richText = element;
            }}
            onBlur={this.onRichTextBlur}
          />

          <div
            className="chat-tool-bar"
            ref={emoji => {
              this.emojiRef = emoji;
            }}
          >
            <Button
              onClick={() => {
                this.fileInput.click();
              }}
            >
              <RetinaImg
                name={'attachments.svg'}
                style={{ width: 24 }}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask}
              />
              <input
                style={{ display: 'none' }}
                ref={element => {
                  this.fileInput = element;
                }}
                type="file"
                multiple
                onChange={this.onFileChange}
              />
            </Button>
            <Button onClick={this.onEmojiTouch}>
              <RetinaImg
                name={'emoji.svg'}
                style={{ width: 24 }}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask}
              />
            </Button>
          </div>
          <PluginPrompt
            conversation={selectedConversation}
            pos={this.state.promptPos}
            prefix={this.state.prefix}
            keyword2app={this.state.keyword2app}
            hidePrompt={this.hidePrompt}
            installApp={this.installApp}
          />
          {atVisible ? (
            <AtList
              pos={promptPos}
              contacts={atContacts}
              activeIndex={atActiveIndex}
              chooseAtContact={this.chooseAtContact}
              changeAtActiveIndex={this.changeAtActiveIndex}
            />
          ) : null}
        </div>
      </KeyCommandsRegion>
    );
  }
}
