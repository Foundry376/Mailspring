import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { sendCmd2App2, getToken, getMyAppByShortName, getMyAppById } from '../../../utils/appmgt';
import MessageCommand from './MessageCommand';
import _ from 'lodash'

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
    let matchedAppCommands = [];
    if (!conversation || !keyword2app ||  !prefix || prefix[0] !== '/') {
      Object.assign({}, this.state, { matchedAppCommands });
      return;
    }
    const userId = conversation.curJid.split('@')[0]
    const text = prefix.slice(1).trim().toLowerCase();
    let matchedApps = [];
    for (let kw in keyword2app) {
      let app = keyword2app[kw];
      kw = kw.toLowerCase();
      if (kw==text || text.length>=3 && kw.toLowerCase().startsWith(text)) {
          matchedApps.push(app);
      }
    }
    matchedApps = _.uniq(matchedApps);
    matchedApps.forEach( app => {
      app = getMyAppByShortName(userId, app.shortName);
      console.log('debugger: getMyAppById: app: ', userId, app);
      if (!app || !app.length) {
        return;
      } else {
        app = app[0];
        if (app.description) {
          matchedAppCommands.push({name:app.name, description:app.description});
        }
        if (app.commands && app.commands.length) {
          matchedAppCommands.push.apply(matchedAppCommands, app.commands.map(command => ({app, command})));
        } else {
          matchedAppCommands.push({app, command:{command:'/'+app.shortName, text:''}});
          matchedAppCommands.push({app, command:{command:'/'+app.shortName +' ?', text:''}});
        };
      }
    });
    const state = Object.assign({}, this.state, { matchedAppCommands })
    this.setState(state);
  }

  render() {
    // console.log('debugger: PluginPrompt.render this.props: ', this.props);
    const {pos,  prefix} = this.props;

    if (!prefix || prefix[0] !== '/' || prefix=='/') {
      return null;
    }
     if (!this.state.matchedAppCommands || !this.state.matchedAppCommands.length) {
       return null;
     }
    const commands = this.state.matchedAppCommands.map((item, idx) => {
       if (item.description) {
         return <div key={idx} > {`${item.name}: ${item.description}`} </div>;
       } else {
         const { app, command } = item;
           // console.log('debugger: app, command: ', app, command);
           return (<MessageCommand conversation={this.props.conversation}
           appJid = {app.id+'@app.im.edison.tech'}
           commandType = {app.commandType}
           templateText = {command.command}
           key = {idx}>
           </MessageCommand>)
       }
    });

    return (
      <div className="plugin-prompt-container" style={{bottom:pos.top+28+'px', left:pos.left+28+'px'}}>
        <div>plugin commands:</div>
        {commands}
      </div>
    );
  }
}
