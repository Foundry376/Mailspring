import getDb from '../db/index';

export  const getChatMembersFromDb = async convjid => {
  const db = await getDb();
  const conv = await db.conversations.findOne().where('jid').eq(convjid).exec();
  const occupants = conv.occupants;
  return Promise.all(occupants.map(accupant=> db.contacts.findOne().where('jid').eq(accupant).exec()))
};

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
