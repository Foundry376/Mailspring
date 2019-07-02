import React, { Component } from 'react';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import { ContactStore, MemberProfileStore } from 'chat-exports';
import { uploadContacts } from '../../../../utils/restjs';
import { remote } from 'electron';
import { checkToken, refreshChatAccountTokens, queryProfile } from '../../../../utils/restjs';
import { isJsonStr } from '../../../../utils/stringUtils';
import { Actions } from 'mailspring-exports';
import Contact from '../../../../../../src/flux/models/contact';
import keyMannager from '../../../../../../src/key-manager';
import { RetinaImg } from 'mailspring-component-kit';
import { ConversationStore } from 'chat-exports';
import { nickname, name } from '../../../../utils/name'

export default class MemberProfile extends Component {
  static timer;

  constructor(props) {
    super(props);
    this.state = {
      member: null,
      visible: true,
    };
  }

  componentDidMount = () => {
    this.mounted = true;

    this.queryProfile();
    const rect = this.panelElement.getBoundingClientRect();
    this.panelRect = rect;
    document.body.addEventListener('click', this.onClickWithProfile);
    this._unsub = MemberProfileStore.listen(() => this.setMember(MemberProfileStore.member));
    this.setMember(null);
  };

  componentWillUnmount = () => {
    document.body.removeEventListener('click', this.onClickWithProfile);
    this._unsub();
  };
  queryProfile = async () => {
    const { member } = this.state;
    if (!member) {
      return;
    }
    const chatAccounts = AppEnv.config.get('chatAccounts') || {};
    const userId = member.jid.local || member.jid.split('@')[0];
    const email = Object.keys(chatAccounts)[0];
    let accessToken = keyMannager.getAccessTokenByEmail(email);
    const { err, res } = await checkToken(accessToken);
    if (err || !res || res.resultCode !== 1) {
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
      if (!this.state.member) {
        return;
      }
      Object.assign(this.state.member, res.data);
      const state = Object.assign({}, this.state);
      if (this.mounted) {
        this.setState(state);
      } else {
        this.state = state;
      }
    });
  };

  onClickWithProfile = (e) => {
    //  cxm:
    // because onBlur on a div container does not work as expected
    // so it's necessary to use this as a workaround
    setTimeout(() => {
      if (this.clickSame) {
        this.clickSame = false;
        return;
      }
      const rect = this.panelRect;
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        this.props.exitProfile(this.state.member);
      };
    }, 5);
  };

  setMember = (member) => {
    this.clickSame = member && member === this.state.member;
    if (this.clickSame) {
      return;
    }
    if (member && (!this.state.member || member.email !== this.state.member.email)) {
      this.queryProfile();
    }
    if (member) {
      member.nickname = nickname(member.jid);
      member.name = name(member.jid);
    }
    this.setState({ member, visible: !!member});
  }

  startPrivateChat = (e) => {
    this.props.exitProfile(this.state.member);
    let member = Object.assign({}, this.state.member);
    member = member.dataValues || member;
    member.jid = member.jid && member.jid.bare || member.jid;
    member.name = member.name || member.jid && member.jid.split('^at^')[0];
    member.curJid = member.curJid || this.props.conversation.curJid;
    ConversationStore.createPrivateConversation(member);
  };

  composeEmail = (e) => {
    const member = this.state.member;
    this.props.exitProfile(member);
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
    const curJid = this.props.conversation.curJid;
    const myXmpp = xmpp.getXmpp(curJid);
    await myXmpp.block(jid);
    alert(`You have blocked ${member.nickname || member.name}`);
  };
  unblockContact = async () => {
    const member = this.state.member;
    const jid = member.jid.bare || member.jid;
    const curJid = this.props.conversation.curJid;
    const myXmpp = xmpp.getXmpp(curJid);
    await myXmpp.unblock(jid);
    alert(`You have unblocked ${member.nickname || member.name}`);
  };
  addToContacts = async () => {
    const member = this.state.member;
    const jid = member.jid.bare || member.jid;
    let contacts = await ContactStore.getContacts();
    if (contacts.some(item => item.email === member.email)) {
      alert(`This contact(${member.nickname || member.name}) has been in the contacts.`);
      return;
    }
    contacts = contacts.map(item => ({ email: item.email, displayName: item.name }));
    contacts.push({ email: member.email, displayName: member.name || member.nickname });
    const chatAccounts = AppEnv.config.get('chatAccounts') || {};
    const email = Object.keys(chatAccounts)[0];
    let accessToken = await keyMannager.getAccessTokenByEmail(email);
    const { err, res } = await checkToken(accessToken);
    if (err || !res || res.resultCode !== 1) {
      await refreshChatAccountTokens();
      accessToken = await keyMannager.getAccessTokenByEmail(email);
    }
    ContactStore.saveContacts([
      {
        jid,
        curJid: member.curJid,
        name: member.name || member.nickname || jid.split('@')[0],
        email: member.email,
        avatar: member.avatar
      }
    ], member.curJid);
    uploadContacts(accessToken, contacts, () => {
      alert(`This contact(${member.nickname || member.name}) has been added into the contacts.`)
    });
  };

  onChangeNickname = (e) => {
    const { member } = this.state;
    member.nickname = e.target.value;
    const state = Object({}, this.state, { member });
    this.setState(state);
    return;
  }

  render = () => {
    if (!this.state.visible) {
      return null;
    }

    const member = this.state.member || {};
    const jid = (member.jid && typeof member.jid != 'string') ? member.jid.bare : (member.jid || '');

    return (
      <div className="member-profile-panel" ref={(el) => this.panelElement = el} tabIndex={1}>
        <Button className="more" onClick={this.showMenu}></Button>
        <div className="avatar-area">
          <ContactAvatar jid={jid} name={member.name}
            email={member.email} avatar={member.avatar || ''} size={140} />
          <div className="name-buttons">
            <h2 className="member-name">{member.name}</h2>
            <button className="btn btn-toolbar command-button" title="Start a private chat" onClick={this.startPrivateChat}>
              <RetinaImg name={'chat.svg'} style={{ width: 16 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
              <span>Messages</span>
            </button>
            <button className="btn btn-toolbar command-button" title="Compose new message" onClick={this.composeEmail}>
              <RetinaImg name={'email.svg'} style={{ width: 16 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
              <span>Compose</span>
            </button>
          </div>
        </div>
        <div className="email">
          <div className="email-label">email</div>
          <div className="member-email">{member.email}</div>
        </div>
        <div className="nickname">
          <div className="nickname-label">nickname</div>
          <input className="nickname-input" type='text' placeholder='input nickname here' value={member.nickname} onChange={this.onChangeNickname} onBlur={this.onChangeNickname}></input>
        </div>
      </div>
    );
  };
}
