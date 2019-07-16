import { getDeviceId, getDeviceInfo, updateFlag } from '../utils/e2ee';
import { delay } from '../utils/delay';
import xmpp from './index';
import { log } from '../utils/log';
import {
  RoomStore,
  ContactStore,
  E2eeStore,
  AppsStore,
  OnlineUserStore,
  BlockStore,
} from 'chat-exports';

export const auth = async ({ jid, password }) => {
  const deviceId = await getDeviceId();
  let resBare = jid;
  let resLocal = jid.split('@')[0];
  let sessionId = window.localStorage['sessionId' + resLocal];
  if (!sessionId) {
    sessionId = '12345678901';
  }
  OnlineUserStore.addAuthingAccount(jid);

  xmpp.init({
    jid,
    password,
    transport: 'websocket',
    // wsURL: 'wss://tigase.edison.tech',//_prod
    wsURL: 'wss://tigase.stag.easilydo.cc',
    resource: deviceId && deviceId.replace(/-/g, ''),
    deviceId: deviceId,
    timestamp: new Date().getTime(),
    deviceType: 'desktop',
    deviceModel: process.platform,
    clientVerCode: '101',
    clientVerName: '1.0.0',
    sessionId,
  });
  try {
    const res = await xmpp.connect(jid);
    if (!res) {
      console.warn('connect.null', jid);
      return;
    }
    // fetch and saveRoom infomation
    await delay(200);
    RoomStore.refreshRoomsFromXmpp(resBare);

    await delay(200);
    BlockStore.refreshBlocksFromXmpp(resBare);

    await delay(200);
    const contacts = await xmpp.getRoster(resBare);
    if (contacts && contacts.roster && contacts.roster.items) {
      ContactStore.saveContacts(contacts.roster.items, resBare);
    }

    await delay(200);
    const device = await getDeviceInfo();
    if (device && (!device.users || device.users.indexOf(resLocal) < 0)) {
      const resp = await xmpp.setE2ee(
        {
          jid: resBare,
          did: device.deviceId,
          key: device.pubkey,
        },
        resBare
      );
      if (resp && resp.type == 'result' && resp.e2ee) {
        updateFlag(resLocal);
      }
    }

    await delay(200);
    const e2ees = await xmpp.getE2ee('', resBare);
    console.log('e2ee', e2ees)
    E2eeStore.saveE2ees(e2ees, resBare);

    await delay(200);
    AppsStore.saveMyAppsAndEmailContacts({ curJid: resBare, local: resLocal });
  } catch (error) {
    log('connect', `auth connect error: ${JSON.stringify(error)}`);
    window.console.warn('connect error', error);
    if (error && typeof error == 'string' && error.split('@').length > 1) {
      window.localStorage.removeItem('sessionId' + error.split('@')[0]);
      OnlineUserStore.removeAuthingAccount(error);
    }
  }
};

export default auth;
