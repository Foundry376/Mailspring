const { get, post } = require('./httpex');
var urlPre = 'https://restxmpp.stag.easilydo.cc/client/';
export const register = (email, pwd, name, type, provider, setting, cb) => {
    let emailProvider = provider == "" ? "other" : provider;
    let host = setting.imap_host;
    let ssl = setting.imap_allow_insecure_ssl;
    let port = setting.imap_port;

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
        "deviceId": window.localStorage.deviceId,
        "otherAccounts": [],
        "emailAddress": email,
        "emailPassword": pwd,
        "autoLogin": "true"
    };
    post(urlPre + 'register', data, cb);
}
export const unregister = (userId, password, cb) => {
    post(urlPre + 'unregisterV2',
        { IMAccounts: [{ userId: userId, password: password }] }, cb);
}
/**
 * 
 * @param {{"accessToken":"cVAy1XCdQs6Y_xRvkDTNRg",userId:"601226"}} data 
 */
export const queryProfile = (data, cb) => {
    post(urlPre + 'queryProfile', data, cb);
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
export const getavatar = (email, cb) => {
    get('https://restxmpp.stag.easilydo.cc/public/getavatar?email=' + email, cb);
}

export default {
    register, unregister, queryProfile, setProfile, login, uploadContacts, getavatar
}