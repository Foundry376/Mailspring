/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import { gradientColorForString } from '../utils/colors';
import { getLogo } from '../utils/restjs';
import { LottieImg } from 'mailspring-component-kit';
import { FocusedPerspectiveStore, AccountStore } from 'mailspring-exports';

const ConfigProfileKey = 'core.appearance.profile';
export default class EmailAvatar extends Component {
  static displayName = 'EmailAvatar';

  constructor(props) {
    super(props);
    let from = {};
    if (props.thread) {
      const messages = props.thread.__messages;
      if (messages && messages.length) {
        let message = messages[messages.length - 1];
        from = message.from && message.from[0];
        let to = message.to && message.to[0];
        if (!from && to) {
          from = to;
        }
        this._parseAvatarForSendMessage(messages, from, props);
      }
      from = from || {};
    } else if (props.message) {
      const message = props.message;
      from = message.from && message.from[0];
      let to = message.to && message.to[0];
      if (!from && to) {
        from = to;
      }
    } else if (props.from) {
      from = {
        name: props.from && props.from.displayName({ compact: true }),
        email: props.from.email,
      };
    } else if (props.account) {
      from = {
        name: props.account.name,
        email: props.account.email,
      };
    } else if (props.name || props.email) {
      from = {
        name: props.name,
        email: props.email,
      };
    }
    // This mode is not the "split/list" mode, but as in "use in list"  or "use in other places" mode
    const isListModel = props.mode && props.mode === 'list';

    this.state = {
      name: (from.name || from.email || ' ')
        .trim()
        .substring(0, 1)
        .toUpperCase(),
      bgColor: gradientColorForString(from.email || ''),
      email: from.email,
      hasImage: false,
      showPicture: AppEnv.config.get(ConfigProfileKey) || !isListModel,
    };
    if (props.number) {
      this.state.name = props.number;
    }
    this._mounted = false;

    this.disposable = AppEnv.config.onDidChange(ConfigProfileKey, () => {
      this.setState({
        showPicture: AppEnv.config.get(ConfigProfileKey) || !isListModel,
      });
    });
  }

  _parseAvatarForSendMessage = (messages, from, props) => {
    const currentPerspective = FocusedPerspectiveStore.current();
    if (currentPerspective && props.mode && ( props.mode === 'list' )) {
      const cats = currentPerspective.categories();
      if (cats.length > 0 && cats[0].role === 'sent') {
        const message = this._findLatestSendMessage(messages);
        const to = message.to && message.to[0];
        const cc = message.cc && message.cc[0];
        const bcc = message.bcc && message.bcc[0];
        from = to || cc || bcc;
      }
    }
  };
  _findLatestSendMessage(messages){
    let sendMessage = null;
    const replaceSendMessage = newMessage => {
      if (!sendMessage) {
        sendMessage = newMessage;
      } else {
        if (newMessage.date.getTime() > sendMessage.date.getTime()) {
          sendMessage = newMessage;
        }
      }
    };
    messages.forEach(message => {
      if(!message.from || (message.from.length === 0)){
        replaceSendMessage(message);
      }else{
        const email = message.from[0].email;
        const account = AccountStore.accountForEmail(email);
        if(account){
          if(account.id === message.accountId){
            replaceSendMessage(message);
          }
        }
      }
    });
    if (!sendMessage) {
      console.error(`cannot find message send from account: ${JSON.stringify(messages)}`);
      return messages[messages.length - 1];
    }
    return sendMessage;
  }

  componentDidMount = async () => {
    this._mounted = true;
    const { email, showPicture } = this.state;
    if (!showPicture) {
      return;
    }
    if (email) {
      const avatarUrl = await getLogo(email);
      if (avatarUrl && this._mounted) {
        this &&
          this.setState({
            bgColor: `url('${avatarUrl}')`,
            hasImage: true,
          });
      }
    }
  };

  componentWillUnmount() {
    this.disposable.dispose();
    this._mounted = false;
  }

  render() {
    const { name, bgColor, hasImage, showPicture } = this.state;
    if (!showPicture) {
      return null;
    }
    let styles = {
      backgroundImage: bgColor,
      backgroundPosition: 'center',
      backgroundSize: 'cover',
    };
    if (this.props.styles) {
      styles = Object.assign(styles, this.props.styles);
    }
    if (this.props.messagePending) {
      const lottieStyle = { marginTop: -5, marginLeft: -5 };
      if (!hasImage) {
        lottieStyle.position = 'absolute';
        lottieStyle.left = 0;
        lottieStyle.top = 15;
      }
      return (
        <div className="avatar-icon" style={styles}>
          {!hasImage ? name : null}
          <LottieImg
            name={'loading-spinner-blue'}
            size={{ width: 50, height: 50 }}
            isClickToPauseDisabled={true}
            style={lottieStyle}
          />
        </div>
      );
    }
    return (
      <div className="avatar-icon" style={styles}>
        {!hasImage ? name : null}
      </div>
    );
  }
}
