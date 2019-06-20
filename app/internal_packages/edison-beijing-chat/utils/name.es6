export function nickname(jid){
  const nicknames = window.chatLocalStorage.nicknames;
  return nicknames[jid];
}

export async function name(jid) {
  const nicknames = window.chatLocalStorage.nicknames;

  if (nicknames[jid]){
    return nicknames[jid]
  } else {
    const contact = await ContactStore.findContactByJid(jid);
    return contact && (contact.name || contact.email) || '';
  }
}

export default {
  nickname,
  name,
}
