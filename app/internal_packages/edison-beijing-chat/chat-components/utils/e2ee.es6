

export const getPriKey = (jid) => {
    return window.localStorage.getItem(jid + "_prikey");
}
export const setPriKey = (jid, key) => {
    return window.localStorage.setItem(jid + "_prikey", key);
}
export const delPriKey = (jid) => {
    return window.localStorage.removeItem(jid + "_prikey");
}
export const getPubKey = (jid) => {
    return window.localStorage.getItem(jid + "_pubkey");
}
export const setPubKey = (jid, key) => {
    return window.localStorage.setItem(jid + "_pubkey", key);
}
export const delPubKey = (jid) => {
    return window.localStorage.removeItem(jid + "_pubkey");
}

export default {
    getPriKey, setPriKey, delPriKey, getPubKey, setPubKey, delPubKey
}