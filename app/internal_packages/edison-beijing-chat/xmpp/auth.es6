import { getDeviceId, getDeviceInfo, updateFlag } from '../utils/e2ee';
import { delay } from '../utils/delay';
import xmpp from './index';
import { log2 } from '../utils/log-util';
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
  let saveLastTs = (jidLocal, ts) => {
    const msgTs = parseInt(ts);
    if (msgTs) {
      AppEnv.config.set(jidLocal + '_message_ts', msgTs);
    }
  };
  let pullMessage = (ts, jid) => {
    xmpp.pullMessage(ts, jid).then(data => {
      // console.log('pullMessage', data);
      if (data && data.edipull && data.edipull.more == "true") {
        saveLastTs(resLocal, data.edipull.since);
        pullMessage(data.edipull.since, jid);
      } else {
        window.localStorage.removeItem(resLocal + '_tmp_message_state');
      }
    });
  };
  try {
    window.localStorage[resLocal + '_tmp_message_state'] = 1;
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
    E2eeStore.saveE2ees(e2ees, resBare);

    await delay(200);
    let ts = AppEnv.config.get(resLocal + '_message_ts');
    if (ts) {
      pullMessage(ts, resBare);
    }

    await delay(200);
    AppsStore.saveMyAppsAndEmailContacts({ curJid: resBare, local: resLocal });
  } catch (error) {
    log2(`auth connect error: ${JSON.stringify(error)}`);
    window.console.warn('connect error', error);
    if (error && typeof error == 'string' && error.split('@').length > 1) {
      window.localStorage.removeItem('sessionId' + error.split('@')[0]);
      OnlineUserStore.removeAuthingAccount(error);
    }
  }
};

export default auth;
