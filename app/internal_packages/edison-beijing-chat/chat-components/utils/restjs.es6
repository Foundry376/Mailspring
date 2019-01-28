import keyMannager from '../../../../src/key-manager';

const { get, post } = require('./httpex');
import { getPubKey } from './e2ee';
import { isJsonStr } from './stringUtils';

var urlPre = 'https://restxmpp.stag.easilydo.cc/client/';

export const register = (email, pwd, name, type, provider, setting) => {
    if (!setting) {
        return;
    }
    let emailProvider = provider == "" ? "other" : provider;
    let host = setting.imap_host;
    let ssl = setting.imap_allow_insecure_ssl ? true : (setting.imap_security === 'SSL / TLS' ? true : false);
    let port = setting.imap_port;
    return new Promise((resolve, reject) => {
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
                post(urlPre + 'register', data, (err, res) => resolve({ err, res }));
            } else {
                console.warn(err);
                reject(err);
            }
        })
    });
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

export function checkToken(accessToken) {
    let arg = {
        accessToken: accessToken,
        deviceType: 'desktop',
        deviceModel: process.platform,
        pushToken: "",
    };
    return new Promise(resolve => {
        post(urlPre + 'checkToken', arg, (err, res) => {
            // console.log('cxm*** checkToken ', err, res, typeof res);
            if (isJsonStr(res)) {
                res = JSON.parse(res);
            }
            if (res && res.resultCode === 1) {
                resolve({ err: null, res });
            } else {
                resolve({ err, res });
            }
        });
    })
}

export async function refreshChatAccountTokens(cb) {
    let accounts = AppEnv.config.get('accounts');
    let chatAccounts = AppEnv.config.get('chatAccounts') || {};
    for (let acc of accounts) {
        let chatAccount = chatAccounts[acc.emailAddress];
        acc.clone = () => Object.assign({}, acc);
        await keyMannager.insertAccountSecrets(acc);
        // console.log('cxm*** refreshChatAccountTokens ', acc);
        let email = acc.emailAddress;
        let type = 0;
        if (email.includes('gmail.com') || email.includes('edison.tech') || email.includes('mail.ru') || acc.provider === 'gmail') {
            type = 1;
        }
        let { err, res } = await register(acc.emailAddress, acc.settings.imap_password || acc.settings.refresh_token, acc.name, type, acc.provider, acc.settings);
        try {
            res = JSON.parse(res);
        } catch (e) {
            console.log('response is not json');
        }
        if (err || !res || res.resultCode != 1) {
            console.log('fail to register email: ', acc.emailAddress, res);
            // this.setState({ errorMessage: "This email has not a chat account，need to be registered, but failed, please try later again" });
            return;
        }
        chatAccount = res.data;
        chatAccount.refreshTime = (new Date()).getTime();
        chatAccount.clone = () => Object.assign({}, chatAccount);
        chatAccount = await keyMannager.extractChatAccountSecrets(chatAccount);
        chatAccounts[acc.emailAddress] = chatAccount;
        AppEnv.config.set('chatAccounts', chatAccounts);
    }
}

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
