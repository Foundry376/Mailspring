export const jidlocal = (jid) => {
  if (typeof jid === 'string') {
    if (jid.indexOf('@') > 0) {
      jid.split('@')[0];
    } else {
      return jid;
    }
  } else if (jid) {
    return jid.local;
  }
}
export const jidbare = (jid) => {
  if (typeof jid === 'string') {
    return jid;
  } else if (jid) {
    return jid.bare;
  }
}
