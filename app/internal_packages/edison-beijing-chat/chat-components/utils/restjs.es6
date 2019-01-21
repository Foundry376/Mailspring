const { get, post } = require('./httpex');
import { getPubKey } from './e2ee';
var urlPre = 'https://restxmpp.stag.easilydo.cc/client/';
export const register = (email, pwd, name, type, provider, setting, cb) => {
    if (!setting) {
        return;
    }
    let emailProvider = provider == "" ? "other" : provider;
    let host = setting.imap_host;
    let ssl = setting.imap_allow_insecure_ssl ? true : (setting.imap_security === 'SSL / TLS' ? true : false);
    let port = setting.imap_port;

    getPubKey((err, deviceId, pubKey) => {
        if (!err) {
            let data = {
                "name": name,
                "emailType": type,
                "emailProvider": emailProvider,
                "emailHost": host,
                "emailSSL": ssl,
                "emailPort": port,
                "deviceType": "desktop",
                "deviceModel": process.platform,
                "pushToken": "",
                "deviceId": deviceId,
                "otherAccounts": [],
                "e2eeKeys": [
                    { 'id': '1', 'key': pubKey }
                ],
                "emailAddress": email,
                "emailPassword": pwd,
                "autoLogin": "true"
            };
            post(urlPre + 'register', data, cb);
        } else {
            console.warn(err);
        }
    })

}
export const unregister = (userId, password, cb) => {
    post(urlPre + 'unregisterV2',
        { IMAccounts: [{ userId: userId, password: password }] }, cb);
}

const profileCache = {};
/**
 * 
 * @param {{"accessToken":"cVAy1XCdQs6Y_xRvkDTNRg",userId:"601226"}} data 
 */
export const queryProfile = (data, cb) => {
    if (profileCache[data.userId]) {
        cb(null, profileCache[data.userId]);
        return;
    }
    post(urlPre + 'queryProfile', data, (err, resData, ...args) => {
        let userProfile = resData;
        if (!err) {
            try {
                if (typeof userProfile === 'string') {
                    userProfile = JSON.parse(userProfile);
                }
            } catch (err) {
                console.warn('queryProfile error', err);
            }
            profileCache[data.userId] = userProfile;
        }
        if (cb) {
            cb(err, userProfile, ...args);
        }
    });
};
/**
 * 
 * @param {{"accessToken":"xxxxxxxxxx",name:"tom",avatar:"1000/3332"}} data 
 * @param {*} cb 
 */
export const setProfile = (data, cb) => {
    post(urlPre + 'setProfile', data, cb);
}

export const login = (email, password, cb) => {
    post(urlPre + 'login',
        {
            deviceType: "desktop",
            deviceModel: "mac",
            password: password,
            emailAddress: email,
            otherAccounts: []
        }, cb);
}
export const uploadContacts = (accessToken, contacts, cb) => {
    post(urlPre + 'uploadContacts',
        {
            accessToken: accessToken,
            contacts: contacts
        }, cb);
}
/**
 * 获取头像，返回头像路径
 * @param {*} email 
 * @param {*} cb 
 */
const avatarCache = {};
export const getAvatar = (email, cb) => {
    if (avatarCache[email] !== undefined) {
        cb(avatarCache[email]);
        return avatarCache[email];
    }
    get('https://restxmpp.stag.easilydo.cc/public/getavatar?email=' + email, (error, data, res) => {
        if (res && res.statusCode < 400) {
            avatarCache[email] = res.headers.location;
        } else {
            avatarCache[email] = '';
        }
        if (cb) {
            cb(avatarCache[email]);
        }
    });
}
export const getAvatarFromCache = email => {
    return avatarCache[email];
}

export default {
    register, unregister, queryProfile, setProfile, login, uploadContacts, getAvatar, getAvatarFromCache
}