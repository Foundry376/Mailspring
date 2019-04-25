import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import InfoIcon from '../../common/icons/InfoIcon';
import Button from '../../common/Button';
import {
    dateFormat
} from '../../../utils/time';
import { sendCmd2App2, getToken, getMyAppByShortName } from '../../../utils/appmgt';
export default class MessageCommand extends PureComponent {
    static propTypes = {
        appJid: PropTypes.string.isRequired,
        conversation: PropTypes.object.isRequired,
        templateText: PropTypes.string.isRequired
    };
    argEls = [];
    sendCommand2App = async (e) => {
        let command = this.head;
        console.log('debugger: sendCommand2App: this.props: ', this.props);
        const { appJid, conversation } = this.props;
        const userId = conversation.curJid.split('@')[0];
        let jidLocal = conversation.jid.split('@')[0];
        let peerUserId, roomId;
        if (conversation.isGroup) {
            roomId = jidLocal;
        } else {
            peerUserId = jidLocal;
        }
        let appId = appJid.split('@')[0];
        let userName = '';
        this.items.forEach((item, idx) => {
            command += ' ' + this.argEls[idx].value;
            command += ' ' + item[1] || '';
        });
        const token = await getToken(userId);
        console.log('debugger: sendCommand2App: userId, userName, token, appId, command, peerUserId, roomId: ', userId, userName, token, appId, command, peerUserId, roomId);
        debugger;
        sendCmd2App2(userId, userName, token, appId, command, peerUserId, roomId, (err, data) => {
            console.log(err, data);
        });
    }

    render() {
        console.log('debugger: MessageCommand.render this.props: ', this.props);
        const cmd = this.props.templateText;
        const parts = cmd.split(/\s*\[/);
        this.head = parts[0];
        this.items = parts.slice(1);
        this.items = this.items.map(item => item.split(/\]\s*/));
        return (
            <div>
            <div className="messageCommand" onClick={this.sendCommand2App}>
                <span className="messageCommandHead">
                  {this.head}
                </span>
              {this.items.map((item, idx) => {
                    return ( <span>
                          <input placeHolder={item[0]} ref={(el) => {
                            this.argEls[idx] = el;
                          }}/>
                        {item[1]? <span>{item[1]}</span>: null}
                      </span>
                    );
              })
              }
            </div>
            </div>
        );
    }
}
