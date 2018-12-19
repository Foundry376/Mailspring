// find contact info from group conversation members
export function getContactInfo(jid, members) {
  for (const member of members) {
    if (member.jid.bare === jid) {
      return member;
    }
  }
}

export function findGroupChatOwner(members) {
  for (const member of members) {
    if (member.affiliation === 'owner') {
      //just return the reference, do not copy!
      return member;
    }
  }
}
