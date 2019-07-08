import { Xmpp } from '..';
import {
  ChatActions,
  MessageStore,
  OnlineUserStore,
  ConversationStore,
  RoomStore,
  E2eeStore,
  BlockStore,
} from 'chat-exports';
import { registerLoginEmailAccountForChat } from '../../utils/register-login-chat';

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
  if (map) {
    Object.entries(map).forEach(([eventname, action]) =>
      xmpp.on(eventname, data => {
        if (action) {
          store.dispatch(action(data));
        }
      })
    );
  }
  let saveLastTs = data => {
    let jidLocal = data.curJid.split('@')[0];
    let ts = AppEnv.config.get(jidLocal + '_message_ts');
    const msgTs = parseInt(data.ts);
    if (!ts || ts < msgTs) {
      AppEnv.config.set(jidLocal + '_message_ts', msgTs);
    }
  };
  // receive group chat
  xmpp.on('groupchat', data => {
    saveLastTs(data);
    MessageStore.reveiveGroupChat(data);
  });
  // receive private chat
  xmpp.on('chat', data => {
    saveLastTs(data);
    MessageStore.reveivePrivateChat(data);
  });
  // user online
  xmpp.on('available', data => {
    console.log('xmpp:available: ', data);
    OnlineUserStore.addOnlineUser(data);
    ChatActions.userOnlineStatusChanged(data.from.bare);
  });
  // user online
  xmpp.on('unavailable', data => {
    console.log('xmpp:unavailable: ', data);
    OnlineUserStore.removeOnlineUser(data);
    ChatActions.userOnlineStatusChanged(data.from.bare);
  });
  // Chat account online
  xmpp.on('session:started', data => {
    console.log('xmpp:session:started: ', data);
    OnlineUserStore.addOnLineAccount(data);
  });
  // Chat account offline
  xmpp.on('disconnected', data => {
    console.log('xmpp:disconnected: ', data);
    OnlineUserStore.removeOnLineAccount(data);
  });

  // change conversation name
  xmpp.on('edimucconfig', data => {
    ConversationStore.onChangeConversationName(data);
  });

  //member join / quit
  xmpp.on('memberschange', data => {
    RoomStore.onMembersChange(data);
  });

  xmpp.on('message:ext-e2ee', data => {
    //console.log('message:ext-e2ee', data);
    E2eeStore.saveE2ee(data);
  });

  xmpp.on('message:error', async data => {
    if (data.error && data.error.code == 403 && data.id) {
      let msgInDb = await MessageStore.getMessageById(data.id + '$' + data.from.bare);
      if (!msgInDb) {
        return;
      }
      const msg = msgInDb.get({ plain: true });
      let body = msg.body;
      body = JSON.parse(body);
      body.content = 'You are not in this conversation.';
      body.type = 'error403';
      body = JSON.stringify(body);
      msg.body = body;
      MessageStore.saveMessagesAndRefresh([msg]);
    }
  });
  xmpp.on('message:success', async data => {
    let msgInDb = await MessageStore.getMessageById(data.$received.id + '$' + data.from.bare);
    if (!msgInDb) {
      return;
    }
    const msg = msgInDb.get({ plain: true });
    msg.status = 'MESSAGE_STATUS_DELIVERED';
    MessageStore.saveMessagesAndRefresh([msg]);
  });

  xmpp.on('message:failed', async message => {
    console.log('message:failed: ', message);
    // let msgInDb = await MessageStore.getMessageById(data.$received.id + '$' + data.from.bare);
    // if (!msgInDb) {
    //   return;
    // }
    // const msg = msgInDb.get({ plain: true });
    // msg.status = 'MESSAGE_STATUS_FAILED';
    // MessageStore.saveMessagesAndRefresh([msg]);
  });

  xmpp.on('auth:failed', async data => {
    const account = OnlineUserStore.getSelfAccountById(data.curJid);
    const emailAccounts = AppEnv.config.get('accounts');
    let emailAccount;
    for (const acc of emailAccounts) {
      if (acc.emailAddress === account.email) {
        emailAccount = acc;
        break;
      }
    }
    let accounts = AppEnv.config.get('chatAccounts');
    delete accounts[account.email];
    AppEnv.config.set('chatAccounts', accounts);
    registerLoginEmailAccountForChat(emailAccount);
  });

  xmpp.on('block', async ({ curJid }) => {
    await BlockStore.refreshBlocksFromXmpp(curJid);
  });
  xmpp.on('unblock', async ({ curJid }) => {
    await BlockStore.refreshBlocksFromXmpp(curJid);
  });

  return next => action => next(action);
};

export default createXmppMiddleware;
