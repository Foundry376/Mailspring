import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import { RetinaImg } from 'mailspring-component-kit';
import { RichText } from '../../common/RichText';
import AtList from '../../common/AtList';
import { FILE_TYPE } from '../../../utils/filetypes';
import emoji from 'node-emoji';
import { Actions, ReactDOM } from 'mailspring-exports';
import EmojiPopup from '../../common/EmojiPopup';
import { RoomStore, MessageSend } from 'chat-exports';
import { name } from '../../../utils/name';
import { AT_BEGIN_CHAR, AT_END_CHAR, AT_EMPTY_CHAR } from '../../../utils/message';

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
  const delEmptyStr = strFormat.replace(new RegExp(`${AT_EMPTY_CHAR}`, 'g'), '');

  return delEmptyStr;
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

export default class MessageEditBar extends PureComponent {
  static propTypes = {
    value: PropTypes.string.isRequired,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string,
      email: PropTypes.string, //.isRequired,
      isGroup: PropTypes.bool.isRequired,
    }).isRequired,
  };

  static defaultProps = {
    conversation: null,
  };

  state = {
    suggestions: [],
    roomMembers: [],
    messageBody: '',
    atContacts: [],
    atPersons: [],
    atActiveIndex: 0,
    atVisible: false,
    promptPos: null,
  };

  emojiRef = null;
  _richText = null;

  componentDidMount = async () => {
    const roomMembers = await this.getRoomMembers();
    this.setState({
      roomMembers,
    });
    this.initMsg();

    setTimeout(() => {
      if (document.querySelector('.edit-button-group')) {
        document.querySelector('.edit-button-group').scrollIntoViewIfNeeded(false);
      }
    }, 30);
  };

  initMsg = () => {
    this._richText.autoFocus();
    const { value } = this.props;
    // 创建匹配标记字符的正则，避免标记字符不是成对出现引起的问题
    // .*? 非贪婪模式，最少匹配
    const regStr = `(${AT_BEGIN_CHAR}@.*?${AT_END_CHAR})`;
    const reg = new RegExp(regStr, 'g');
    let newStr = value.replace(
      reg,
      `<span class="at-contact" contenteditable=false>${'$1'}</span>`
    );
    newStr = newStr.replace(/\\n/g, '<br>');
    const domTemp = document.createElement('div');
    domTemp.innerHTML = newStr;
    const childs = [...domTemp.childNodes];
    childs.forEach(el => {
      if (el.nodeType === 1) {
        const nodeStr = el.innerHTML;
        // del AT_BEGIN_CHAR、AT_END_CHAR and @
        const jid = nodeStr.slice(2, -1);
        el.setAttribute('jid', jid);
        if (jid === 'all') {
          el.innerHTML = 'all';
        } else {
          el.innerHTML = name(jid);
        }
      }
      this._richText.addNode(el);
    });
  };

  getRoomMembers = async () => {
    const { conversation } = this.props;
    if (conversation.isGroup) {
      return await RoomStore.getRoomMembers(conversation.jid, conversation.curJid);
    }
    return [];
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
      atActiveIndex: 0,
    });
  };

  sendMessage = () => {
    let messageBody = this.state.messageBody;
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
        updating,
      };
      MessageSend.sendMessage(body, conversation, messageId, updating);
    }

    this.setState({ messageBody: '' });
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

  hide = () => {
    const state = Object.assign({}, this.state, { hidden: true });
    this.setState(state);
  };
  onCancel = () => {
    this.props.cancelEdit();
    this.hide();
  };
  onSave = () => {
    const { messageBody } = this.state;
    if (!messageBody.trim()) {
      this.props.deleteMessage();
      return;
    }
    this.sendMessage();
    this.hide();
    this.props.cancelEdit();
  };

  // --------------------------- at start ---------------------------
  chooseAtContact = contact => {
    const insertDom = document.createElement('span');
    insertDom.innerHTML = `@${contact.name}`;
    insertDom.setAttribute('jid', contact.jid);
    insertDom.setAttribute('class', 'at-contact');
    insertDom.setAttribute('contenteditable', false);
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
    if (this.state.atVisible) {
      this.setState({ atVisible: false });
    } else {
      this.props.cancelEdit();
      this.hide();
    }
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
    const { conversation } = this.props;
    this.setState({
      atVisible: conversation.isGroup && !!atContacts.length,
    });
  };

  EnterKeyEvent = funKeyIsOn => {
    const { atVisible, atContacts, atActiveIndex } = this.state;
    if (funKeyIsOn || !atVisible) {
      this.onSave();
    } else {
      const contact = atContacts[atActiveIndex];
      this.chooseAtContact(contact);
    }
  };

  ShiftEnterKeyEvent = () => {
    const insertDom = document.createElement('br');
    this._richText.addNode(insertDom);
    // 换行将光标顶到下一行
    this._richText.addNode(AT_EMPTY_CHAR);
  };
  // ---------------------------- at end ----------------------------

  render() {
    const { atVisible, promptPos, atContacts, atActiveIndex } = this.state;
    if (this.state.hidden) {
      return null;
    }

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
        shiftKey: true,
        // shift + enter
        keyEvent: () => this.ShiftEnterKeyEvent(),
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
      <div className="sendBar">
        <RichText
          keyMapping={keyMapping}
          placeholder="Edison Chat"
          maxRows={20}
          onChange={this.onMessageBodyChanged}
          ref={element => {
            this._richText = element;
          }}
          onBlur={this.onRichTextBlur}
        />
        <div
          className="edit-button-group"
          ref={emoji => {
            this.emojiRef = emoji;
          }}
        >
          <Button onClick={this.onEmojiTouch} className="emoji">
            <RetinaImg
              name={'emoji.svg'}
              style={{ width: 20, height: 20 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </Button>
          <Button className="cancel" onClick={this.onCancel}>
            Cancel
          </Button>
          <Button onClick={this.onSave}>Save Changes</Button>
        </div>
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
    );
  }
}
