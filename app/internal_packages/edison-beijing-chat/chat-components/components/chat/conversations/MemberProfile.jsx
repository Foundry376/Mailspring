import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import getDb from '../../../db';
import chatModel from '../../../store/model';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../utils/colors';
import { remote } from 'electron';
import { clearMessages } from '../../../utils/message';
import { login, checkToken, refreshChatAccountTokens, queryProfile } from '../../../utils/restjs';
import { isJsonStr } from '../../../utils/stringUtils';
import { Actions } from 'mailspring-exports';
import Contact from '../../../../../../src/flux/models/contact';
import keyMannager from '../../../../../../src/key-manager';
import uuid from 'uuid';
const { primaryColor } = theme;

export default class MemberProfie extends Component {
  static timer;

  constructor(props) {
    super(props);
    this.state = {
      member: this.props.member,
    };
  }

  componentDidMount = () => {
    this.queryProfile();
    const rect = this.panel.getBoundingClientRect();
    // console.log('cxm*** getBoundingClientRect ', rect);
    this.panelRect = rect;
    document.body.addEventListener('click', this.onClickWithMemberProfile);

  };
  componentwillUnmount = () => {
    console.log('cxm *** document.body.removeEventListener ');
    document.body.removeEventListener('click', this.onClickWithMemberProfile);

  };
  queryProfile = async () => {
    const chatAccounts = AppEnv.config.get('chatAccounts') || {};
    //console.log('cxm*** before queryProfile member ', this.props.member);
    const userId = this.props.member.jid.local || this.props.member.jid.split('@')[0];
    const email = Object.keys(chatAccounts)[0];
    let accessToken = keyMannager.getAccessTokenByEmail(email);
    const { err, res } = await checkToken(accessToken);
    if (err || !res || res.resultCode!==1) {
      await refreshChatAccountTokens();
      accessToken = keyMannager.getAccessTokenByEmail(email);
    }
    queryProfile({ accessToken, userId }, (err, res) => {
      if (!res) {
        console.log('fail to queryProfile');
        return;
      }
      if (isJsonStr(res)) {
        res = JSON.parse(res);
      }
      //console.log('cxm*** queryProfile res ', res);
      const member = Object.assign(this.state.member, res.data);
      const state = Object.assign({}, this.state, { member });
      this.setState(state);
    });
  };

  componentWillReceiveProps = (nextProps) => {
    //console.log('cxm*** componentWillReceiveProps ', nextProps);
    if (!this.props.member || nextProps.member.email !== this.props.member.email) {
      this.props = nextProps;
      const member = nextProps.member;
      // const state = Object({}, this.state, { member });
      // this.setState(state);
      this.queryProfile();
    }
  }

  showMenu = (e) => {
    const menus = [
      {
        label: `Add to Group...`,
        click: () => {
          const moreBtnEl = document.querySelector('.more');
          this.props.toggleInvite(moreBtnEl);
        },
      },
      {
        label: `Clear Message History`,
        click: () => {
          this.clearMessages();
        },
      },
      { type: 'separator' },
      {
        label: `Hide notifications`,
        type: 'checkbox',
        checked: this.state.isHiddenNotifi,
        click: () => {
          this.hiddenNotifi();
        },
      },
    ];
    remote.Menu.buildFromTemplate(menus).popup(remote.getCurrentWindow());
  };

  onClickWithMemberProfile = (e) => {
    //  cxm:
    // because onBlur on a div container does not work as expected
    // so it's necessary to use this as a workaround
    console.log('cxm*** onClickWithMemberProfile', e);
    debugger;
    const rect = this.panelRect;
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      // document.body.removeEventListener('click', this.onClickWithMemberProfile);
      this.props.exitMemberProfile(this.state.member);
    }
  };
  startPrivateChat = (e) => {
    this.props.exitMemberProfile(this.props.member);
    const member = Object.assign({}, this.props.member);
    member.jid = member.jid.bare || member.jid;
    //console.log('cxm*** startPrivateChat ', member);
    member.name = member.name || member.jid.split('^at^')[0];
    this.props.onPrivateConversationCompleted(member);
  };
  composeEmail = (e) => {
    const member = this.state.member;
    this.props.exitMemberProfile(member);
    const contact = new Contact({
      id: member.id,
      accountId: member.accountId,
      name: member.name,
      email: member.email
    });
    Actions.composeNewDraftToRecipient(contact);

  }
  onChangeNickname = (e) => {
    // e.preventDefault();
    // e.stopPropagation();
    const { member } = this.state;
    member.nickname = e.target.value;
    //console.log('cxm*** onChangeNickname ', member);
    const state = Object({}, this.state, { member });
    this.setState(state);
    return;
  }

  render = () => {
    const { member } = this.state;
    let backgroundImage;
    if (member.avatar) {
      backgroundImage = `url(https://s3.us-east-2.amazonaws.com/edison-profile-stag/${member.avatar})`;
    } else {
      backgroundImage = ''
    }
    // console.log('cxm*** mem profile member ', member);
    let jid;
    if (member.jid && typeof member.jid != 'string') {
      jid = member.jid.bare;
    } else {
      jid = member.jid || '';
    }

    return (
      <div className="member-profile-panel" ref = {(el)=> this.panel = el } tabIndex={1}>
        <div className="member-info-area">
          <div className="member-avatar">
          <ContactAvatar jid={jid} name={member.name}
                         email={member.email} avatar={member.avatar || ''} size={160} />
          </div>
          <div className="member-fields">
            <h2>{member.name}</h2>
            <div>
              <button className="btn btn-toolbar command-button" onClick={this.startPrivateChat} title="starta private chat">Messages</button>
            </div>
            <div>
              <button className="btn btn-toolbar command-button" onClick={this.composeEmail} title="Compose new message">Compose</button>
            </div>
            <div> <span>email</span> <span>{member.email}</span></div>
            <div className='member-field'>
              <span>nickname</span>
              <input type='text' placeholder='input nickname here' value={member.nickname} onChange={this.onChangeNickname} onBlur={this.onChangeNickname}></input></div>
          </div>
        </div>
      </div>
    );
  };
}

MemberProfie.propTypes = {
  member: PropTypes.object.isRequired,
};
