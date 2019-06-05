import { Xmpp } from '../index';
import { ChatActions, MessageStore } from 'chat-exports';

/**
 * Creates a middleware for the XMPP class to dispatch actions to a redux store whenever any events
 * are received
 * @param   {Xmpp}    xmpp            An instance of the Xmpp class
 * @param   {Object}  eventActionMap  An object with keys being the string value of the xmpp event
 *                                    and values being functions that return redux actions
 * @throws  {Error}                   Throws an error if xmpp is not an instance of Xmpp
 * @returns {Middleware}              The redux middleware function
 */
export const createXmppMiddleware = (xmpp, eventActionMap) => store => {
  if (!(xmpp instanceof Xmpp)) {
    throw Error('xmpp must be an instance of Xmpp');
  }
  if (typeof eventActionMap !== 'object') {
    throw Error('eventActionMap must be an object');
  }

  const map = eventActionMap; // Ensure map is not modified while iterating over keys
  console.log('*****map', map);
  if (map) {
    Object.entries(map)
      .forEach(([eventname, action]) => xmpp.on(eventname, data => {
        if (action) {
          store.dispatch(action(data));
        }
      }));
  }
  // receive group chat
  xmpp.on('groupchat', data => {
    MessageStore.reveiveGroupChat(data);
  })
  // receive private chat
  xmpp.on('chat', data => {
    MessageStore.reveivePrivateChat(data);
  })
  return next => action => next(action);
};

export default createXmppMiddleware;
