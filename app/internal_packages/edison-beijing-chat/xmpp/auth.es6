import { getDeviceId, getDeviceInfo, updateFlag } from '../utils/e2ee';
import { delay } from '../utils/delay';
import xmpp from './index';
import uuid from 'uuid/v4';
import { RoomStore, ContactStore, E2eeStore, AppsStore, OnlineUserStore } from 'chat-exports';

export const auth = async ({ jid, password }) => {
  const deviceId = await getDeviceId();
  let sessionId = window.localStorage['sessionId' + jid.split('@')[0]];
  if (!sessionId) {
    sessionId = '12345678901';
  }
  console.log('xmpp.init: ', jid, password);
  OnlineUserStore.addAuthingAccount(jid);

  xmpp.init({
    jid,
    password,
    transport: 'websocket',
    //wsURL: 'ws://192.168.1.103:5290'
    wsURL: 'wss://tigase.stag.easilydo.cc',
    resource: deviceId && deviceId.replace(/-/g, ''),
    deviceId: deviceId,//'2b92e45c-2fde-48e3-9335-421c8c57777f"',
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
    // fetch and saveRoom infomation
    await delay(200);
    RoomStore.refreshRoomsFromXmpp(res.bare);

    await delay(200);
    const contacts = await xmpp.getRoster(res.bare);
    if (contacts && contacts.roster && contacts.roster.items) {
      ContactStore.saveContacts(contacts.roster.items, res.bare);
    }

    await delay(200);
    const device = await getDeviceInfo();
    if (device && (!device.users || device.users.indexOf(res.local) < 0)) {
      const resp = await xmpp.setE2ee({
        jid: res.bare,
        did: device.deviceId,
        key: device.pubkey,
      }, res.bare);
      if (resp && resp.type == 'result' && resp.e2ee) {
        updateFlag(res.local);
      }
    }

    await delay(200);
    const e2ees = await xmpp.getE2ee('', res.bare);
    E2eeStore.saveE2ees(e2ees, res.bare);

    await delay(200);
    let ts = AppEnv.config.get(res.local + '_message_ts');
    if (ts) {
      pullMessage(ts, res.bare);
    }

    await delay(200);
    AppsStore.saveMyAppsAndEmailContacts(res);
  } catch (error) {
    window.console.warn('connect error', error);
    if (error && error.split('@').length > 1) {
      window.localStorage.removeItem('sessionId' + error.split('@')[0]);
      OnlineUserStore.removeAuthingAccount(error);
    }
  };
};

export default auth;
