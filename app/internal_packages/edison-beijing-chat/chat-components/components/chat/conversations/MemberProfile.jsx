import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import getDb from '../../../db';
import chatModel from '../../../store/model';
import { uploadContacts } from '../../../utils/restjs';
import { remote } from 'electron';
import { checkToken, refreshChatAccountTokens, queryProfile } from '../../../utils/restjs';
import { isJsonStr } from '../../../utils/stringUtils';
import { Actions } from 'mailspring-exports';
import Contact from '../../../../../../src/flux/models/contact';
import keyMannager from '../../../../../../src/key-manager';
import { RetinaImg } from 'mailspring-component-kit';

export default class MemberProfie extends Component {
  static timer;

  constructor(props) {
    super(props);
    this.state = {
      member: this.props.member,
    };
  }

  componentDidMount = () => {
    this.mounted = true;
    this.queryProfile();
    const rect = this.panel.getBoundingClientRect();
    this.panelRect = rect;
    document.body.addEventListener('click', this.onClickWithMemberProfile);

  };
  componentwillUnmount = () => {
    console.log('cxm *** document.body.removeEventListener ');
    document.body.removeEventListener('click', this.onClickWithMemberProfile);

  };
  queryProfile = async () => {
    const chatAccounts = AppEnv.config.get('chatAccounts') || {};
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
      const member = Object.assign(this.state.member, res.data);
      const state = Object.assign({}, this.state, { member });
      if (this.mounted){
        this.setState(state);
      } else {
        this.state = state;
      }
    });
  };

  componentWillReceiveProps = (nextProps) => {
    if (!this.props.member || nextProps.member.email !== this.props.member.email) {
      this.props = nextProps;
      this.queryProfile();
    }
  };

  onClickWithMemberProfile = (e) => {
    //  cxm:
    // because onBlur on a div container does not work as expected
    // so it's necessary to use this as a workaround
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

  };

  showMenu = (e) => {
    const menus = [
      {
        label: `Add to Contacts`,
        click: () => {
          const moreBtnEl = document.querySelector('.more');
          this.addToContacts();
        },
      },
      {
        label: `Block this Contact`,
        click: () => {
          this.blockContact();
        },
      },
      {
        label: `Unblock this Contact`,
        click: () => {
          this.unblockContact();
        },
      }
    ]
    remote.Menu.buildFromTemplate(menus).popup(remote.getCurrentWindow());
  };

  blockContact = async () => {
    const member = this.state.member;
    const jid = member.jid.bare || member.jid;
    const store = chatModel.store;
    const state = store.getState();
    const currentUser = state.auth.currentUser;
    const curJid = currentUser.bare;
    const myXmpp = xmpp.getXmpp(curJid);
    await myXmpp.block(jid);
    alert(`You have blocked ${member.nickname || member.name}`);
  };
  unblockContact = async () => {
    const member = this.state.member;
    const jid = member.jid.bare || member.jid;
    const store = chatModel.store;
    const state = store.getState();
    const currentUser = state.auth.currentUser;
    const curJid = currentUser.bare;
    const myXmpp = xmpp.getXmpp(curJid);
    await myXmpp.unblock(jid);
    alert(`You have unblocked ${member.nickname || member.name}`);
  };
  addToContacts = async () => {
    const member = this.state.member;
    const jid = member.jid.bare || member.jid;
    const db = await getDb();
    let contacts = await db.contacts.find().exec();
    console.log(contacts);
    // debugger;
    if (contacts.some(item => item.email===member.email)) {
      alert(`This contact(${member.nickname || member.name}) has been in the contacts.`);
      return;
    }
    contacts = contacts.map(item => ({email:item.email, displayName:item.name}));
    contacts.push({email:member.email, displayName:member.name ||member.nickname});
    const chatAccounts = AppEnv.config.get('chatAccounts') || {};
    const email = Object.keys(chatAccounts)[0];
    let accessToken = keyMannager.getAccessTokenByEmail(email);
    const { err, res } = await checkToken(accessToken);
    if (err || !res || res.resultCode!==1) {
      await refreshChatAccountTokens();
      accessToken = keyMannager.getAccessTokenByEmail(email);
    }
    await db.contacts.upsert({
      jid,
      curJid:member.curJid,
      name: member.name || member.nickname || jid.split('@')[0],
      email:member.email,
      avatar:member.avatar
    });
    uploadContacts(accessToken, contacts, () => {
      alert(`This contact(${member.nickname || member.name}) has been added into the contacts.`)
    });
  };

  onChangeNickname = (e) => {
    // e.preventDefault();
    // e.stopPropagation();
    const { member } = this.state;
    member.nickname = e.target.value;
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
    let jid;
    if (member.jid && typeof member.jid != 'string') {
      jid = member.jid.bare;
    } else {
      jid = member.jid || '';
    }

    return (
      <div className="member-profile-panel" ref = {(el)=> this.panel = el } tabIndex={1}>
        <Button className="more" onClick={this.showMenu}></Button>
        <div className="avatar-area">
          <ContactAvatar jid={jid} name={member.name}
                         email={member.email} avatar={member.avatar || ''} size={140} />
          <div className="name-buttons">
            <h2 className="member-name">{member.name}</h2>
            <button className="btn btn-toolbar command-button" title="Start a private chat" onClick={this.startPrivateChat}>
              <RetinaImg name={'chat.svg'} style={{ width: 12 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
              <span>Messages</span>
            </button>
            <button className="btn btn-toolbar command-button" title="Compose new message" onClick={this.composeEmail}>
              <RetinaImg name={'email.svg'} style={{ width: 12 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
              <span>Compose</span>
            </button>
          </div>
        </div>
        <div className="email">
            <div className="email-label">email</div>
            <div  className="member-email">{member.email}</div>
        </div>
        <div className="nickname">
          <div className="nickname-label">nickname</div>
          <input className="nickname-input" type='text' placeholder='input nickname here' value={member.nickname} onChange={this.onChangeNickname} onBlur={this.onChangeNickname}></input>
        </div>
      </div>
    );
  };
}

MemberProfie.propTypes = {
  member: PropTypes.object.isRequired,
};
