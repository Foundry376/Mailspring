import { generateKey } from './rsa';

export const getPriKey = () => {
    return window.localStorage.getItem("e2ee_prikey");
}
const setPriKey = (key) => {
    return window.localStorage.setItem("e2ee_prikey", key);
}
export const delPriKey = () => {
    return window.localStorage.removeItem("e2ee_prikey");
}
export const getPubKey = () => {
    return window.localStorage.getItem("e2ee_pubkey");
}
const setPubKey = (key) => {
    return window.localStorage.setItem("e2ee_pubkey", key);
}
// export const delPubKey = (jid) => {
//     return window.localStorage.removeItem("_pubkey");
// }

if (!getPriKey()) {
    let { pubkey, prikey } = generateKey();
    setPriKey(prikey);
    setPubKey(pubkey);
}

export default {
    getPriKey, delPriKey, getPubKey//, delPubKey
}