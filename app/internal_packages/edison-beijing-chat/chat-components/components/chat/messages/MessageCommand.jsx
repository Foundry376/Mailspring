import React, { PureComponent } from 'react';
import uuid from 'uuid/v4';
import PropTypes from 'prop-types';
import { sendCmd2App2, getToken } from '../../../utils/appmgt';
import { MESSAGE_STATUS_RECEIVED } from '../../../db/schemas/message';
import chatModel from '../../../store/model';
import { beginStoringMessage } from '../../../actions/db/message';
import { updateSelectedConversation } from '../../../actions/db/conversation';
import chatModel from '../../../store/model';

export default class MessageCommand extends PureComponent {
    static propTypes = {
        appJid: PropTypes.string.isRequired,
        conversation: PropTypes.object.isRequired,
        templateText: PropTypes.string.isRequired
    };

    argEls = [];

    sendCommand2App = async (e) => {
        // console.log('debugger: sendCommand2App this.props: ', this.props);
        let command = this.head;
        const { appJid, appName, commandType, conversation } = this.props;
        const userId = conversation.curJid.split('@')[0];
        let jidLocal = conversation.jid.split('@')[0];
        let peerUserId, roomId;
        let appId = appJid.split('@')[0];
        if (conversation.isGroup) {
            roomId = jidLocal;
        } else if ( '@app.'.indexOf(conversation.jid) >= 0 ){
          peerUserId = appId;
        } else if (jidLocal != appId) {
            peerUserId = jidLocal;
        }

        let userName = '';
        this.items.forEach((item, idx) => {
            command += ' ' + this.argEls[idx].value;
            command += ' ' + (item[1] || '');
        });
        const token = await getToken(userId);
        sendCmd2App2(userId, userName, token, appId, command, peerUserId, roomId, (err, data) => {
          // console.log('debugger: MessageCommand: sendCmd2App2:', appId, err, data);
          // debugger;
          if (err || !data || commandType !== 2) {
            return;
          }
          data = JSON.parse(data);
          data.appJid = appJid;
          data.appName = appName;
          data.isAppprivateCommand = true;
          const msg = {
            id: uuid(),
            conversationJid: conversation.jid,
            sender: appJid,
            body: JSON.stringify(data),
            sentTime: (new Date()).getTime()+chatModel.diffTime,
            status: MESSAGE_STATUS_RECEIVED,
          };
          chatModel.store.dispatch(beginStoringMessage(msg));
          chatModel.store.dispatch(updateSelectedConversation(conversation));
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
                    return ( <span key={idx}>
                          <input placeholder={item[0]} ref={(el) => {
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
