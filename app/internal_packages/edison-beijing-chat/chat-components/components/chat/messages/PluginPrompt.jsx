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

  componentWillReceiveProps = async nextProps => {
    const {conversation, prefix, keyword2app} = nextProps;
    let matchedAppCommands = [];
    if (!conversation || !keyword2app ||  !prefix || prefix[0] !== '/') {
      Object.assign({}, this.state, { matchedAppCommands });
      return;
    }
    const userId = conversation.curJid.split('@')[0]
    const text = prefix.slice(1).trim().toLowerCase();
    let allApps = Object.values(keyword2app);
    let matchedApps = [];
    for (let kw in keyword2app) {
      let app = keyword2app[kw];
      kw = kw.toLowerCase();
      if (text && kw==text || text.length>=3 && kw.toLowerCase().startsWith(text)) {
          matchedApps.push(app);
      }
    }
    matchedApps = _.uniq(matchedApps);
    const  uninstalledApps = [];
    matchedApps.forEach( app0 => {
      let app = getMyAppByShortName(userId, app0.shortName);
      if (!app || !app.length) {
        uninstalledApps.push (app0);
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
    let expectInstallApps;
    if (!text) {
      allApps =  _.uniq(allApps);
      expectInstallApps = allApps.filter(app => {
        const apps = getMyAppByShortName(userId, app.shortName);
        return !apps || !apps.length;
      });
    } else {
      expectInstallApps = uninstalledApps;
    }
    const state = Object.assign({}, this.state, { matchedAppCommands, expectInstallApps, hidden: false });
    this.setState(state);
  }

  hide = () => {
    const state = Object.assign({}, this.state, { hidden:true });
    this.setState(state);
  };

  installApp = () => {
    this.props.installApp();
    const state = Object.assign({}, this.state, { hidden:true });
    this.setState(state);
  };

  render() {
    const {pos,  prefix} = this.props;

    if (!prefix || prefix[0] !== '/' || this.state.hidden) {
      return null;
    }
    let commands = this.state.matchedAppCommands && this.state.matchedAppCommands.map((item, idx) => {
       if (item.description) {
         return <div key={idx} > {`${item.name}: ${item.description}`} </div>;
       } else {
         const { app, command } = item;
           return (<MessageCommand conversation={this.props.conversation}
           appJid = {app.id+'@app.im.edison.tech'}
           commandType = {app.commandType}
           templateText = {command.command}
           onClick={this.hide}
           key = {idx}>
           </MessageCommand>)
       }
    });
    if (commands && commands.length) {
      commands = (<div>
        <div>plugin commands:</div>
      {commands}
      </div>);
    } else {
      commands = null;
    }
    let apps = this.state.expectInstallApps && this.state.expectInstallApps.map(app => {
      return (<div key={app.jid}>
          <em>{app.appName}: </em>
          <span>{app.appDescription}</span>
        </div>
    )});
    if (apps && apps.length) {
      apps = (<div>
        <div>chat plugin apps that can be installed: </div>
        <div>{apps}</div>
        <br/>
        <button className='btn' onClick={this.installApp}> go chat edison app store to install </button>
        </div>)
    } else {
      apps = null;
    }

    return (
      <div className="plugin-prompt-container" style={{bottom:pos.top+28+'px', left:pos.left+28+'px'}}>
        {commands}
        {apps}
      </div>
    );
  }
}
