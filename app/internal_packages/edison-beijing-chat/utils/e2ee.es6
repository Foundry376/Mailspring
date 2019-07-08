import uuid from 'uuid/v4';
import { generateKey } from './rsa';
import { ConfigStore } from 'chat-exports';
const device_info = 'device_info';
const iniE2ee = async () => {
  let config = await ConfigStore.findOne(device_info);
  let deviceInfo = null;
  let deviceId = null;
  if (config) {
    deviceInfo = JSON.parse(config.value);
  }
  if (!deviceInfo) {
    deviceId = await generateDeviceId();
    let { pubkey, prikey } = generateKey();
    //const isUpload = false;
    await ConfigStore.saveConfig({ key: device_info, value: JSON.stringify({ deviceId, pubkey, prikey }), time: new Date().getTime() });
  } else {
    deviceId = deviceInfo.deviceId;
  }
  return deviceId;
}
const generateDeviceId = () => {
  return new Promise((resolve) => {
    require('getmac').getMac(function (err, macAddress) {
      let deviceId;
      if (err) {
        console.warn(err);
        deviceId = uuid();
      }
      else {
        deviceId = macAddress.replace(/:/g, '-');
      }
      resolve(deviceId);
    });
  })
}
iniE2ee();
export const getPriKey = async () => {
  let config = await ConfigStore.findOne(device_info);
  if (config) {
    let deviceInfo = JSON.parse(config.value);
    if (deviceInfo) {
      return deviceInfo;
    }
  }
  return null;
}
export const getPubKey = async (cb) => {
  let config = await ConfigStore.findOne(device_info);
  if (config) {
    let deviceInfo = JSON.parse(config.value);
    if (deviceInfo) {
      cb(null, deviceInfo.deviceId, deviceInfo.pubkey);
      return;
    }
  }
  cb(null);
}
export const getDeviceId = async (cb) => {
  let config = await ConfigStore.findOne(device_info);
  if (config) {
    let deviceInfo = JSON.parse(config.value);
    if (deviceInfo) {
      return deviceInfo.deviceId;
    }
  }
  return null;
}
export const getDeviceInfo = async () => {
  let config = await ConfigStore.findOne(device_info);
  if (config) {
    return JSON.parse(config.value);
  }
  return null;
}
export const updateFlag = async (jid) => {
  let config = await ConfigStore.findOne(device_info);
  let deviceInfo = null;
  if (config) {
    deviceInfo = JSON.parse(config.value);
    if (!deviceInfo.users) {
      deviceInfo.users = [];
    }
    deviceInfo.users.push(jid);
    await ConfigStore.saveConfig({ key: device_info, value: JSON.stringify(deviceInfo), time: new Date().getTime() });
  }
}

export default {
  getPriKey, getPubKey, getDeviceId, getDeviceInfo, updateFlag//, getE2ees, setE2eeJid//, delPubKey
}
