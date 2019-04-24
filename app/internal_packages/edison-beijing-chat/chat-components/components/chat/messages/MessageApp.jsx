import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import InfoIcon from '../../common/icons/InfoIcon';
import Button from '../../common/Button';
import {
    dateFormat
} from '../../../utils/time';
import { sendCmd2App2, getToken, getMyAppByShortName } from '../../../utils/appmgt';
export default class MessageApp extends PureComponent {
    static propTypes = {
        msgBody: PropTypes.object.isRequired,
        userId: PropTypes.string.isRequired,
        peerUserId: PropTypes.string,
        roomId: PropTypes.string
    };
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
        const { appJid, appName, content, htmlBody, ctxCmds, sentTime } = this.props.msgBody;
        console.log('debugger: MessageApp.render msgBody: ', this.props.msgBody);
        const {
            getContactInfoByJid,
            getContactAvatar
        } = this.props;
        const member = { jid: appJid, name: appName };
        let cmds = '';
        if (ctxCmds) {
            let arrCmds = JSON.parse(ctxCmds);
            cmds = '\n------------commands-----------'
            arrCmds.forEach(element => {
                cmds += '\n' + element.command;
            });
        }
        return (
            <div className="message otherUser">
                <div className="messageSender">
                    {getContactAvatar(member)}
                </div>
                <div className="messageContent">
                    <div>
                        <span className="username">{appName}</span>
                        <span className="time">{dateFormat(sentTime, 'LT')}</span>
                    </div>
                    <div className="messageBody">
                        <div className="text-content">
                            {htmlBody ? <div dangerouslySetInnerHTML={htmlBody} /> : content}
                        </div>
                        <div>{cmds}</div>
                    </div>
                </div>
            </div>
        );
    }
}
