import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { sendCmd2App2, getToken } from '../../../utils/appmgt';
export default class MessageCommand extends PureComponent {
    static propTypes = {
        appJid: PropTypes.string.isRequired,
        conversation: PropTypes.object.isRequired,
        templateText: PropTypes.string.isRequired
    };
    argEls = [];
    sendCommand2App = async (e) => {
        let command = this.head;
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
            command += ' ' + (item[1] || '');
        });
        const token = await getToken(userId);
        sendCmd2App2(userId, userName, token, appId, command, peerUserId, roomId, (err, data) => {
            console.log(err, data);
        });
    }

    render() {
        const cmd = this.props.templateText;
        const parts = cmd.split(/\s*\[/);
        this.head = parts[0];
        this.items = parts.slice(1);
        this.items = this.items.map(item => item.split(/\]\s*/));
        return (
            <div>
            <div className="messageCommand">
                <span className="messageCommandHead" onClick={this.sendCommand2App}>
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
