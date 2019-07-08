import { UserCacheStore, ContactStore } from 'chat-exports';

export function nickname(jid){
  const nicknames = window.chatLocalStorage.nicknames;
  return nicknames[jid];
}

export function name(jid) {
  const nicknames = window.chatLocalStorage.nicknames;

  if (nicknames[jid]) {
    return nicknames[jid]
  }
  const info = UserCacheStore.getUserInfoByJid(jid);
  const name = info && info.name;
  if (name) {
    return name;
  }
  const email = info && info.email;
  return email && email.split('@')[0] || '';
}

export async function getName(jid) {
  const nicknames = window.chatLocalStorage.nicknames;

  if (nicknames[jid]) {
    return nicknames[jid]
  }
  const info = UserCacheStore.getUserInfoByJid(jid);
  let name = info && info.name;
  if (name) {
    return name;
  }
  const email = info && info.email;
  name = email && email.split('@')[0];
  if (name) {
    return name;
  }
  let contact = await ContactStore.findContactByJid(jid);
  if (!contact) {
    return '';
  }
  return contact.name || contact.email && contact.email.split('@')[0] || ''
}

export default {
  nickname,
  name,
  getName
}
