import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import InfoIcon from '../../common/icons/InfoIcon';
import Button from '../../common/Button';
import {
  dateFormat,
} from '../../../utils/time';
import { sendCmd2App2, getToken, getMyAppByShortName, getMyAppById } from '../../../utils/appmgt';
import MessageCommand from './MessageCommand';
import getDb from '../../../db/index';
import { SUCCESS_AUTH } from '../../../actions/auth';

export default class MessagePrivateApp extends PureComponent {
  static propTypes = {
    conversation: PropTypes.object.isRequired,
    msg: PropTypes.object.isRequired,
    userId: PropTypes.string.isRequired,
    peerUserId: PropTypes.string,
    roomId: PropTypes.string,
  };

  state = {};

  componentWillMount = async () => {
    const { conversation } = this.props;
    const userJid = conversation.curJid;
    const db = await getDb();
    let contact = await db.contacts.findOne().where('jid').eq(userJid).exec();
    const state = Object.assign({}, this.state, { installerName: contact.name });
    this.setState(state);
  };

  sendCommand2App(command) {
    const { appJid } = this.props.msgBody;
    const { userId, conversation } = this.props;
    let jidLocal = conversation.jid.split('@')[0];
    let peerUserId, roomId;
    if (conversation.isGroup) {
      roomId = jidLocal;
    } else {
      peerUserId = jidLocal;
    }
    let appId = appJid.split('@')[0];
    let userName = '';
    getToken(userId).then(token => {
      if (!token) {
        token = 'AhU0sbojRdafuHUV-ESofQ';
      }
      if (command) {
        sendCmd2App2(userId, userName, token, appId, command, peerUserId, roomId, (err, data) => {
          console.log(err, data);
        });
      }
    });

  }

  render() {
    const { conversation } = this.props;
    const { sentTime } = this.props.msg;
    const msgBody = JSON.parse(this.props.msg.body);
    // console.log('debugger: MessageApp.render msgBody: ', msgBody);
    const { appJid, appName, data} = msgBody;
    let {type, mimeType, content, contents, htmlBody, ctxCommands} = data;
    const appId = appJid.split('@')[0];
    const userId = conversation.curJid.split('@')[0];
    const {
      getContactAvatar,
    } = this.props;
    const member = { jid: appJid, name: '' };
    let commands = null;
    if (ctxCommands) {
      let arrCmds = JSON.parse(ctxCommands);
      commands = arrCmds.map(item => <MessageCommand conversation={this.props.conversation}
                                                     appJid={appJid}
                                                     templateText={item.command}></MessageCommand>);
    }
    if (mimeType.match(/^image/)) {
      contents = contents.map((item, idx) => <img src={item} style={{maxWidth:'100px', maxHeight:'100px'}} key={idx}/>)
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
              {htmlBody ? <div dangerouslySetInnerHTML={{ __html: htmlBody }}/> : content}
              {contents}
            </div>
            <div>{commands}</div>
          </div>
        </div>
      </div>
    );
  }
}
