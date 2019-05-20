import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import uuid from 'uuid/v4';
import { dateFormat } from '../../../utils/time';
import MessageCommand from './MessageCommand';
import getDb from '../../../db/index';
import chatModel from '../../../store/model';
import { beginSendingMessage } from '../../../actions/chat';
import { FILE_TYPE } from './messageModel';
import { beginStoringMessage } from '../../../actions/db/message';
import { copyRxdbMessage } from '../../../utils/db-utils';

export default class MessagePrivateApp extends PureComponent {
  static propTypes = {
    conversation: PropTypes.object.isRequired,
    msg: PropTypes.object.isRequired,
  };

  state = {};

  componentWillMount = async () => {
    const { conversation } = this.props;
    const userJid = conversation.curJid;
    const db = await getDb();
    let contact = await db.contacts.findOne().where('jid').eq(userJid).exec();
    const state = Object.assign({}, this.state, { installerName: contact.name });
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
      timeSend: new Date().getTime(),
      path:url,
      content:'sent'
    };
    const messageId = uuid();
    const msg = copyRxdbMessage(this.props.msg);
    const msgBody = JSON.parse(msg.body);
    msgBody.deleted = true;
    msg.body = JSON.stringify(msgBody);
    chatModel.store.dispatch(beginStoringMessage(msg));
    chatModel.store.dispatch(beginSendingMessage(conversation, JSON.stringify(body), messageId, false));
  }

  render() {
    const { msg } = this.props;
    const { sentTime } = msg;
    const msgBody = JSON.parse(msg.body);
    if (msgBody.deleted) {
      return null;
    }
    const { appJid, appName, data} = msgBody;
    if (!data) {
      return null;
    }
    let {type, mimeType, content, contents, htmlBody, ctxCommands} = data;
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
      commands = arrCmds.map((item,idx) => <MessageCommand conversation={this.props.conversation}
                                                     appJid={appJid}
                                                     commandType={2}
                                                     appName={appName}
                                                     templateText={item.command}
                                                     key={idx}></MessageCommand>);
    }
    if (mimeType.match(/^image/)) {
      contents = contents.map((item, idx) => <img src={item} style={{maxWidth:'100px', maxHeight:'100px'}} onClick={e => this.sendImageLink(item)} key={idx}/>)
    } else if (type==='url') {
      contents = contents.map((item, idx) => <a href={item} key={idx}/>)
    } else {
      contents = null;
    }
    return (
      <div className="message otherUser">
        <div className="messageSender">
          {getContactAvatar(member)}
        </div>
        <div className="messageContent">
          <div>
            <span className="username">{appName}</span>
            <span className="username">{this.state.installerName}</span>
            <span className="time">{dateFormat(sentTime, 'LT')}</span>
          </div>
          <div className="messageBody">
            <div className="text-content">
              {htmlBody ? <div dangerouslySetInnerHTML={{ __html: htmlBody }}/> : <div> { content } </div> }
              {contents}
              <br/>
              {contents && contents.length ? <h6>click a image to send it</h6> : null}
            </div>
            <div>{commands}</div>
          </div>
        </div>
      </div>
    );
  }
}
