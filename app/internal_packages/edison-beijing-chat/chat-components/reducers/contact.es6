import { CONNECTION_BROKEN } from '../actions/auth';
import {
  USER_AVAILABLE,
  USER_UNAVAILABLE,
} from '../actions/contact';
import {
  UPDATE_STORED_CONTACTS,
  SUCCESS_STORE_CONTACTS
} from '../actions/db/contact';
import _ from 'underscore';

const initialState = {
  availableUsers: [],
  contacts: [],
};

const addAvailableUser = (state, user) => {
  const { availableUsers } = state;
  const newAvailableUsers = new Set(availableUsers);
  newAvailableUsers.add(user);
  return Object.assign({}, state, { availableUsers: Array.from(newAvailableUsers).sort() });
};

const removeAvailableUser = (state, user) => {
  const { availableUsers } = state;
  const newAvailableUsers = new Set(availableUsers);
  newAvailableUsers.delete(user);
  return Object.assign({}, state, { availableUsers: Array.from(newAvailableUsers).sort() });
};

const concatContactsByJid = (oldContacts, newContacts) => {
  const jids = oldContacts.map(item => item.jid);
  const arr = [...oldContacts];
  for (const contact of newContacts) {
    if (jids.indexOf(contact.jid) === -1) {
      jids.push(contact.jid);
      arr.push(contact);
    }
  }
  return arr;
}

export default function contactReducer(state = initialState, { type, payload }) {
  switch (type) {
    case CONNECTION_BROKEN:
      return Object.assign({}, state, { availableUsers: [] });
    case USER_AVAILABLE:
      return addAvailableUser(state, payload.from.bare);
    case USER_UNAVAILABLE:
      return removeAvailableUser(state, payload.from.bare);
    case SUCCESS_STORE_CONTACTS:
      var contacts = concatContactsByJid(state.contacts, payload);
      contacts = _.unique(contacts);
      return Object.assign({}, state, { contacts });
    case UPDATE_STORED_CONTACTS:
      var contacts = [].concat(state.contacts, payload);
      contacts = _.unique(contacts);
      return Object.assign({}, state, { contacts: payload });
    default:
      return state;
  }
}
