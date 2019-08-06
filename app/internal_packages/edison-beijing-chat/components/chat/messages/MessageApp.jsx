import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
const { DateUtils } = require('mailspring-exports');
import { sendCmd2App2, getToken } from '../../../utils/appmgt';
import MessageCommand from './MessageCommand';
const sanitizeHtml = require('sanitize-html');
import { RetinaImg } from 'mailspring-component-kit';
const a11yEmoji = require('a11y-emoji');
import { getName } from '../../../utils/name';

export default class MessageApp extends PureComponent {
  static propTypes = {
    conversation: PropTypes.object.isRequired,
    msg: PropTypes.object.isRequired,
    userId: PropTypes.string.isRequired,
    peerUserId: PropTypes.string,
    roomId: PropTypes.string,
  };

  state = {};

  componentWillMount = async () => {
    const { msg } = this.props;

    const senderName = await getName(msg.sender);
    this.setState({ senderName });
  };
  componentWillReceiveProps = async nextProps => {
    const { msg } = nextProps;
    const senderName = await getName(msg.sender);
    this.setState({ senderName });
  };

  sendCommand2App(command) {
    const { appJid } = this.props.msgBody;
    const { userId, conversation } = this.props;
    let jidLocal = conversation.jid.split('@')[0];
    let peerUserId, roomId;
    const appId = appJid.split('@')[0];
    if (conversation.isGroup) {
      roomId = jidLocal;
    } else if (jidLocal != appId) {
      peerUserId = jidLocal;
    }
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

  toggleCommands = () => {
    const commandsVisible = !this.state.commandsVisible;
    this.setState({ commandsVisible });
  };

  render() {
    const { msg, conversation } = this.props;
    const { commandsVisible } = this.state;
    const msgBody = JSON.parse(msg.body);
    let { appJid, appName, content, htmlBody, ctxCmds } = msgBody;
    const { sentTime } = msg;
    const options = {
      allowedTags: [
        'html',
        'head',
        'body',
        'br',
        'del',
        's',
        'strike',
        'ins',
        'em',
        'b',
        'strong',
        'i',
        'u',
        'a',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'pre',
        'p',
        'div',
        'span',
        'hr',
        'article',
        'section',
        'header',
        'footer',
        'summary',
        'aside',
        'details',
        'ul',
        'ol',
        'li',
        'dir',
        'dl',
        'dt',
        'dd',
        'table',
        'caption',
        'th',
        'tr',
        'td',
        'thead',
        'tbody',
        'tfoot',
        'col',
        'colgroup',
        'img',
      ],
      allowedAttributes: {
        a: ['href', 'name', 'target'],
        img: [
          'style',
          'class',
          'alt',
          'src',
          'align',
          'border',
          'height',
          'width',
          'hspace',
          'vspace',
        ],
        '*': ['href', 'align', 'alt', 'center', 'bgcolor'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
    };
    if (htmlBody) {
      htmlBody = a11yEmoji(sanitizeHtml(htmlBody, options));
    }
    const { getContactAvatar } = this.props;

    const member = { jid: appJid, name: appName };
    let commands = null;
    if (ctxCmds) {
      let arrCmds = JSON.parse(ctxCmds);
      commands = arrCmds.map((item, idx) => (
        <MessageCommand
          conversation={this.props.conversation}
          appJid={appJid}
          templateText={item.command}
          key={idx}
        />
      ));
    }
    return (
      <div className="message otherUser">
        <div className="messageSender">{getContactAvatar(member)}</div>
        <div className="message-content">
          <div className="message-header">
            <span className="username">{appName}</span>
            {!conversation.jid.match(/@app/) ? (
              <span className="username">{this.state.senderName}</span>
            ) : null}
            <span className="time">{DateUtils.shortTimeString(sentTime)}</span>
          </div>
          <div className="messageBody">
            <div className="text-content">
              <div className="text">
                {htmlBody ? <div dangerouslySetInnerHTML={{ __html: htmlBody }} /> : content}
              </div>
            </div>
            {commands && commands.length ? (
              <RetinaImg
                name={'expand-more.svg'}
                onClick={this.toggleCommands}
                style={{ width: 26, height: 26 }}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask}
              />
            ) : null}
            {commandsVisible ? <div>{commands}</div> : null}
          </div>
        </div>
      </div>
    );
  }
}
