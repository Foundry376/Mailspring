import uuid from 'uuid/v4';
import { generateKey } from './rsa';
//import { encryptByAES } from './aes';
import getDb from '../db';
const iniE2ee = async () => {
    const db = await getDb();
    const datas = await db.configs.find({ key: { $in: ['deviceId', 'e2ee_prikey', 'e2ee_pubkey'] } }).exec();
    if (datas.length < 3) {
        let deviceId = false;
        for (let data in datas) {
            if (data.key == 'deviceId') {
                deviceId = true; break;
            }
        }
        if (deviceId) {
            setE2ee(db);
        } else if (datas.length == 2) {
            setDeviceId(db);
        } else {
            setDeviceId(db);
            setE2ee(db);
        }
    }
}
const setDeviceId = (db) => {
    require('getmac').getMac(function (err, macAddress) {
        let deviceId;
        if (err) {
            console.warn(err);
            deviceId = uuid();
        }
        else {
            deviceId = macAddress.replace(/:/g, '-');
        }
        db.configs.upsert({ key: 'deviceId', value: deviceId, time: Date.now() });
        // console.log(macAddress);
        // console.log(encryptByAES(macAddress, '75ab8e66395f').replace(/[=+]/g, ''));
    });
}
const setE2ee = (db) => {
    let { pubkey, prikey } = generateKey();
    db.configs.upsert({ key: 'e2ee_prikey', value: prikey, time: Date.now() });
    db.configs.upsert({ key: 'e2ee_pubkey', value: pubkey, time: Date.now() });
}
iniE2ee();
export const getPriKey = async (cb) => {
    const db = await getDb();
    let data = await db.configs.find({ key: { $in: ['deviceId', 'e2ee_prikey'] } }).exec();
    if (data.length == 2) {
        return { deviceId: data[0].value, priKey: data[1].value };
    } else {
        return null;
    }
    // db.configs.findOne({ key: 'e2ee_prikey' }).exec().then((data) => {
    //     cb(data);
    // });
}
export const getPubKey = (cb) => {
    const db = getDb();
    db.configs.find({ key: { $in: ['deviceId', 'e2ee_pubkey'] } }).exec().then((data) => {
        if (data.length == 2) {
            cb(null, data[0].value, data[1].value);
        }
        else {
            iniE2ee();
            cb('please retry!');
        }
    });
}
export const getDeviceId = async (cb) => {
    const db = await getDb();
    let data = await db.configs.findOne({ key: 'deviceId' }).exec();
    if (data) {
        return data.value;
    } else {
        return null;
    }
    // db.configs.findOne({ key: 'deviceId' }).exec().then((data) => {
    //     cb(data);
    // });
}
export const setE2eeJid = (jidLocal, value) => {
    const db = getDb();
    db.configs.upsert({ key: 'e2ee_' + jidLocal, value, time: Date.now() });
}
export const getE2ees = async (jidLocal) => {
    const db = await getDb();
    let datas = await db.configs.find({
        key: { $in: ['deviceId', 'e2ee_prikey', 'e2ee_pubkey', 'e2ee_' + jidLocal] }
    }).exec();

    if (datas) {
        let d = {};
        datas.forEach((data) => {
            d[data.key] = data.value;
            d[data.key + "_time"] = data.time;
        });
        d['e2ee_time'] = d['deviceId_time'] + d['e2ee_prikey_time'] + d['e2ee_pubkey_time'];
        d['needUpload'] = (d['e2ee_time'] != d['e2ee_' + jidLocal]);
        return d;
    } else {
        return null;
    }
    // db.configs.findOne({ key: 'deviceId' }).exec().then((data) => {
    //     cb(data);
    // });
}

export default {
    getPriKey, getPubKey, getDeviceId, getE2ees, setE2eeJid//, delPubKey
}