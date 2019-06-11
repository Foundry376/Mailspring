import uuid from 'uuid/v4';
import { generateKey } from './rsa';
//import { encryptByAES } from './aes';
// import getDb from '../db';
// import { safeUpsert } from './db-utils';
import { ConfigStore } from 'chat-exports';
const Sequelize = require('sequelize');
// const Op = Sequelize.Op;
// let deviceId = null;
const device_info = 'device_info'
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
    console.log('yazztest', config)
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
// export const setE2eeJid = async (jidLocal, value) => {
//     const db = getDb();
//     await safeUpsert(db.configs, { key: 'e2ee_' + jidLocal, value, time: Date.now() });
// }
// export const getE2ees = async (jidLocal) => {
//     const db = getDb();
//     let datas = await db.configs.findAll({
//         where:
//             { key: { [Op.in]: ['deviceId', 'e2ee_prikey', 'e2ee_pubkey', 'e2ee_' + jidLocal] } }
//     });

//     if (datas) {
//         let d = {};
//         datas.forEach((data) => {
//             d[data.key] = data.value;
//             d[data.key + "_time"] = data.time;
//         });
//         d['e2ee_time'] = d['deviceId_time'] + d['e2ee_prikey_time'] + d['e2ee_pubkey_time'];
//         d['needUpload'] = (d['e2ee_time'] != d['e2ee_' + jidLocal]);
//         return d;
//     } else {
//         return null;
//     }
//     // db.configs.findOne({ key: 'deviceId' }).exec().then((data) => {
//     //     cb(data);
//     // });
// }

export default {
    getPriKey, getPubKey, getDeviceId//, getE2ees, setE2eeJid//, delPubKey
}
