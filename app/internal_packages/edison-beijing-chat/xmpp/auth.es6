import { getDeviceId, getDeviceInfo, updateFlag } from '../utils/e2ee';
import { delay } from '../utils/delay';
import xmpp from './index';

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
  let sessionId = window.localStorage['sessionId' + jid.split('@')[0]];
  if (!sessionId) {
    sessionId = '12345678901';
  }
  OnlineUserStore.addAuthingAccount(jid);

  xmpp.init({
    jid,
    password,
    transport: 'websocket',
    //wsURL: 'ws://192.168.1.103:5290'
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
  let pullMessage = (ts, jid) => {
    xmpp.pullMessage(ts, jid).then(data => {
      if (data && data.edipull && data.edipull.more) {
        pullMessage(data.edipull.since, jid);
      }
    });
  };
  try {
    const res = await xmpp.connect(jid);
    if (!res) {
      return;
    }
    let resBare = '';
    let resLocal = '';
    if (typeof res == 'string') {
      console.log('auth', res, jid);
      resBare = res;
      resLocal = res.split('@')[0];
    } else {
      resBare = res.bare;
      resLocal = res.local;
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
    E2eeStore.saveE2ees(e2ees, resBare);

    await delay(200);
    let ts = AppEnv.config.get(resLocal + '_message_ts');
    if (ts) {
      pullMessage(ts, resBare);
    }

    await delay(200);
    AppsStore.saveMyAppsAndEmailContacts({ curJid: resBare, local: resLocal });
  } catch (error) {
    window.console.warn('connect error', error);
    if (error && typeof error == 'string' && error.split('@').length > 1) {
      window.localStorage.removeItem('sessionId' + error.split('@')[0]);
      OnlineUserStore.removeAuthingAccount(error);
    }
  }
};

export default auth;
