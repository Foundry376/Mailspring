import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { sendCmd2App2, getToken, getMyAppByShortName, getMyAppById } from '../../../utils/appmgt';
import MessageCommand from './MessageCommand';

export default class PluginPrompt extends PureComponent {
  static propTypes = {
    conversation: PropTypes.object,
    pos: PropTypes.object,
    prefix: PropTypes.string,
    keyword2app: PropTypes.object,
  };

  state = {}

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
      if (!token) { token = "AhU0sbojRdafuHUV-ESofQ"; }
      if (command) {
        sendCmd2App2(userId, userName, token, appId, command, peerUserId, roomId, (err, data) => {
          console.log(err, data);
        });
      }
    })

  }

  componentWillReceiveProps = async nextProps => {
    console.log('debugger: PluginPrompt.componentWillReceiveProps nextProps: ', nextProps);
    const {conversation, prefix, keyword2app} = nextProps;
    let matchedAppCommands = null;
    if (!conversation || !keyword2app ||  !prefix || prefix[0] !== '/') {
      Object.assign({}, this.state, { matchedAppCommands });
      return;
    }
    const userId = conversation.curJid.split('@')[0]
    const text = prefix.slice(1).toLowerCase();
    const matchedApps = [];
    for (let kw in keyword2app) {
      let app = keyword2app[kw];
      let kws = app.keywords;
      kws = kws.map(kw => kw.toLowerCase());
      if (kws.indexOf(text)>=0) {
        matchedApps.push(app);
      }
    }
    matchedApps.forEach( app => {
      app = getMyAppById(userId, app.appId);
      console.log('debugger: getMyAppById: userId, app.appId, err, data: ', userId, app.appId, err, data);
      if (!app) {
        return;
      };
    });
  }

  render() {
    console.log('debugger: PluginPrompt.render this.props: ', this.props);
    const {pos,  prefix, keyword2app} = this.props;

    if (!prefix || prefix[0] !== '/') {
      return null;
    }

    return (
      <div className="plugin-prompt-container" style={{bottom:pos.top+48+'px', left:pos.left+'px'}}>
        <div>plugin commands:</div>
        {prefix}
      </div>
    );
  }
}
