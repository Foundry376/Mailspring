import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import InfoIcon from '../../common/icons/InfoIcon';
import Button from '../../common/Button';
import {
    dateFormat
} from '../../../utils/time';
import { sendCmd2App2, getToken, getMyAppByShortName } from '../../../utils/appmgt';
import MessageCommand from './MessageCommand';
import getDb from '../../../db/index';
export default class MessageApp extends PureComponent {
    static propTypes = {
        selectedConversation: PropTypes.object.isRequired,
        msgBody: PropTypes.object.isRequired,
        userId: PropTypes.string.isRequired,
        peerUserId: PropTypes.string,
        roomId: PropTypes.string
    };

    state = {}

    componentWillMount = async () => {
      const { selectedConversation } = this.props;
      const userJid = selectedConversation.curJid;
      const db = await getDb();
      let contact = await db.contacts.findOne().where('jid').eq(userJid).exec();
      const state = Object.assign({}, this.state, {installerName: contact.name});
      this.setState(state);
    }

    sendCommand2App(command) {
        const { appJid } = this.props.msgBody;
        const { userId, selectedConversation } = this.props;
        let jidLocal = selectedConversation.jid.split('@')[0];
        let peerUserId, roomId;
        if (selectedConversation.isGroup) {
            roomId = jidLocal;
        } else {
            peerUserId = jidLocal;
        }
        let appId = appJid.split('@')[0];
        let userName = '';
        getToken(userId).then(token => {
            if (!token) { token = "AhU0sbojRdafuHUV-ESofQ"; }
            if (command) {
                sendCmd2App2(userId, userName, token, appId, command, peerUserId, roomId, (err, data) => {
                    console.log(err, data);
                });
            }
        })

    }
    render() {
        // console.log('debugger: MessageApp.render this.props.msgBody: ', this.props.msgBody);
        const { appJid, appName, content, htmlBody, ctxCmds, sentTime } = this.props.msgBody;
        // console.log('debugger: MessageApp.render msgBody: ', this.props.msgBody);
        const {
            getContactInfoByJid,
            getContactAvatar
        } = this.props;
        const member = { jid: appJid, name: appName };
        let cmds = '';
        let commands = null;
        if (ctxCmds) {
            let arrCmds = JSON.parse(ctxCmds);
            console.log('debubger: arrCmds: ', arrCmds);
          commands = arrCmds.map(item => <MessageCommand conversation={this.props.selectedConversation}
                                                         appJid = {appJid}
                                                         templateText = {item.command}></MessageCommand>)
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
                            {htmlBody ? <div dangerouslySetInnerHTML={{__html:htmlBody}} /> : content}
                        </div>
                        <div>{commands}</div>
                    </div>
                </div>
            </div>
        );
    }
}
