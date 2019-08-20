import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { getMyAppByShortName } from '../../../utils/appmgt';
import MessageCommand from './MessageCommand';
import _ from 'lodash';

export default class PluginPrompt extends PureComponent {
  static propTypes = {
    conversation: PropTypes.object,
    pos: PropTypes.object,
    prefix: PropTypes.string,
    keyword2app: PropTypes.object,
  };

  state = {};

  componentWillReceiveProps = async nextProps => {
    const { conversation, prefix, keyword2app } = nextProps;
    let matchedAppCommands = [];
    if (!conversation || !keyword2app || !prefix || prefix[0] !== '/') {
      Object.assign({}, this.state, { matchedAppCommands });
      return;
    }
    const userId = conversation.curJid.split('@')[0];
    const text = prefix
      .slice(1)
      .trim()
      .toLowerCase();
    let allApps = Object.values(keyword2app);
    let matchedApps = [];
    for (let kw in keyword2app) {
      let app = keyword2app[kw];
      kw = kw.toLowerCase();
      if ((text && kw == text) || (text.length >= 3 && kw.toLowerCase().startsWith(text))) {
        matchedApps.push(app);
      }
    }
    matchedApps = _.uniq(matchedApps);
    matchedApps.forEach(app0 => {
      let app = getMyAppByShortName(userId, app0.shortName);
      if (app && app.length) {
        app = app[0];
        if (app.description) {
          matchedAppCommands.push({ name: app.name, description: app.description });
        }
        if (app.commands && app.commands.length) {
          matchedAppCommands.push.apply(
            matchedAppCommands,
            app.commands.map(command => ({ app, command }))
          );
        } else {
          matchedAppCommands.push({ app, command: { command: '/' + app.shortName, text: '' } });
          matchedAppCommands.push({
            app,
            command: { command: '/' + app.shortName + ' ?', text: '' },
          });
        }
      }
    });
    const state = Object.assign({}, this.state, { matchedAppCommands, hidden: false });
    this.setState(state);
  };

  hide = () => {
    this.props.hidePrompt();
  };

  installApp = () => {
    this.props.installApp();
    const state = Object.assign({}, this.state, { hidden: true });
    this.setState(state);
  };

  renderCommands() {
    const { matchedAppCommands } = this.state;
    if (!matchedAppCommands || !matchedAppCommands.length) {
      return null;
    }
    return (
      <div>
        <div>plugin commands:</div>
        {matchedAppCommands.map((item, idx) => {
          if (item.description) {
            return <div key={idx}> {`${item.name}: ${item.description}`} </div>;
          } else {
            const { app, command } = item;
            return (
              <MessageCommand
                conversation={this.props.conversation}
                appJid={app.id + '@app.im.edison.tech'}
                commandType={app.commandType}
                templateText={command.command}
                onClick={this.hide}
                key={idx}
              ></MessageCommand>
            );
          }
        })}
      </div>
    );
  }

  render() {
    const { pos, prefix } = this.props;

    if (!prefix || prefix[0] !== '/' || this.state.hidden) {
      return null;
    }

    return (
      <div
        className="plugin-prompt-container"
        style={{
          bottom: '48px',
          left: (pos && pos.left ? pos.left : 0) + 28 + 'px',
        }}
      >
        {this.renderCommands()}
      </div>
    );
  }
}
