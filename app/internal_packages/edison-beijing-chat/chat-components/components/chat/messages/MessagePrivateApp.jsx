import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import uuid from 'uuid/v4';
import { dateFormat } from '../../../../utils/time';
import { RetinaImg } from 'mailspring-component-kit';
import MessageCommand from './MessageCommand';
import { beginSendingMessage } from '../../../actions/chat';
import { FILE_TYPE } from '../../../../utils/filetypes';
import { MessageStore, ContactStore } from 'chat-exports';

export default class MessagePrivateApp extends PureComponent {
  static propTypes = {
    conversation: PropTypes.object.isRequired,
    msg: PropTypes.object.isRequired,
  };

  state = {};

  componentWillMount = async () => {
    const { conversation } = this.props;
    const userJid = conversation.curJid;
    const contact = await ContactStore.findContactByJid(userJid);
    const state = Object.assign({}, this.state, { installerName: contact && contact.name });
    this.state = state;
  };

  sendImageLink = (url) => {
    const { conversation } = this.props;
    let fileType;
    if (url.match(/gif$/)) {
      fileType = FILE_TYPE.GIF;
    } else if (url.match(/gif$|png$|bmp$|jpg$|jpeg$/)) {
      fileType = FILE_TYPE.IMAGE;
    } else {
      fileType = FILE_TYPE.OTHER_FILE;
    }
    const body = {
      "type": fileType,
      "mediaObjectId": url,
      timeSend: new Date().getTime() + edisonChatServerDiffTime,
      path: url,
      content: 'sent'
    };
    const messageId = uuid();
    const msg = this.props.msg;
    const msgBody = JSON.parse(msg.body);
    msgBody.deleted = true;
    msg.body = JSON.stringify(msgBody);
    MessageStore.saveMessagesAndRefresh([msg]);
    chatReduxStore.dispatch(beginSendingMessage(conversation, JSON.stringify(body), messageId, false));
  }
  toggleCommands = ()  => {
    const commandsVisible = !this.state.commandsVisible;
    this.setState({commandsVisible});
  };

  render() {
    const { msg } = this.props;
    const { commandsVisible } = this.state;
    const { sentTime } = msg;
    const msgBody = JSON.parse(msg.body);
    if (msgBody.deleted) {
      return null;
    }
    const { appJid, appName, data } = msgBody;
    if (!data) {
      return null;
    }
    let { type, mimeType, content, contents, htmlBody, ctxCommands } = data;
    const {
      getContactAvatar,
    } = this.props;
    const member = { jid: appJid, name: '' };
    let commands = null;
    if (ctxCommands) {
      let arrCmds;
      if (typeof ctxCommands === 'string') {
        arrCmds = JSON.parse(ctxCommands);
      } else {
        arrCmds = ctxCommands;
      }
      commands = arrCmds.map((item, idx) => <MessageCommand conversation={this.props.conversation}
        appJid={appJid}
        commandType={2}
        appName={appName}
        templateText={item.command}
        key={idx}></MessageCommand>);
    }
    if (mimeType.match(/^image/)) {
      contents = contents.map((item, idx) => <img src={item} style={{ maxWidth: '100px', maxHeight: '100px' }} onClick={e => this.sendImageLink(item)} key={idx} />)
    } else if (type === 'url') {
      contents = contents.map((item, idx) => <a href={item} key={idx} />)
    } else {
      contents = null;
    }
    return (
      <div className="message otherUser">
        <div className="messageSender">
          {getContactAvatar(member)}
        </div>
        <div className="message-content">
          <div className="message-header">
            <span className="username">{appName}</span>
            <span className="username">{this.state.installerName}</span>
            <span className="time">{dateFormat(sentTime, 'LT')}</span>
          </div>
          <div className="messageBody">
            <div className="text-content">
              {htmlBody ? <div dangerouslySetInnerHTML={{ __html: htmlBody }} /> : <div> {content} </div>}
              {contents}
              <br />
              {contents && contents.length ? <h6>click a image to send it</h6> : null}
            </div>
            {commands && commands.length ? <RetinaImg name={'expand-more.svg'}
                                                      onClick={this.toggleCommands}
                                                      style={{ width: 26, height: 26 }}
                                                      isIcon
                                                      mode={RetinaImg.Mode.ContentIsMask} /> : null }
            {commandsVisible ? <div>{commands}</div> : null}
          </div>
        </div>
      </div>
    );
  }
}
