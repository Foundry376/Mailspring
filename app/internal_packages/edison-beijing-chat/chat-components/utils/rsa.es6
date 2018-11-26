const NodeRSA = require('node-rsa');
const strPubKey = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCVY5D5ct+c0YYuWVBnONR0TWAPC4gTfWHvqmBcVzI72CVHjFwtC173eGChVGR25HM3TtWkPhENTFi/Uz7kkirUsiRh+upTmHrOekYmsf2wnRrnkLfQNCYw05s28XIHh3IcKxDwKRLLjWGUHHZdwTFnRVj3g/kUQmahK9m+f5FhowIDAQAB";
const strPriKey = "MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAJVjkPly35zRhi5ZUGc41HRNYA8LiBN9Ye+qYFxXMjvYJUeMXC0LXvd4YKFUZHbkczdO1aQ+EQ1MWL9TPuSSKtSyJGH66lOYes56Riax/bCdGueQt9A0JjDTmzbxcgeHchwrEPApEsuNYZQcdl3BMWdFWPeD+RRCZqEr2b5/kWGjAgMBAAECgYB+JAaEO1VJqznr5QqZPklWswcLbSdHnbWWk3yuPAp0sbw4v/INLu7Pc1vUndf+9EO9Tdnjx2zKl87QLtCKXEnA6M8ed9tv6EPWUWnDkwtF9YcNl0ij5NjlSzQXYUVE+jlo+dd2Ri2KZIG/AHMWx/Iipm7p2YEaRwboaD9rmHB0oQJBAM00FAiuicy5wsgj3xQhvFro1Ygm7myTV/gnJyLWHntppej1HPbfNITM0rPQq3bFa7iwBYHGVgwQPFnzQ5tymisCQQC6XnlhhROHQHI7h3eC/vzZpmJjNYBf3JiSgJrmGPGgTFvIJMySux0wzyOtAvZmnk2AypXMhYhyan4G434HO3JpAkAaXSqFwwbpSqR/2jv69iqg83EbwQS45mVS+JTKoP/hkz1BpNxHy32P4lDf0Vt2Mv8YB2VtuvGrMxrN47c37Y1pAkEAsc58w9uw+/MyiTT/gs0/829YowpiRhMyxWNJZYoazTLMxjDFtKAsg2q8wM34w4L4so2VSaGEwpRzVKMqlD/VMQJABWAapq3Y8JU4JL0ghcsKx6P0d5UNsK5Ps/5/9ijiN8Aj5Otnaz8Ogf7V1nS3rRK+ZUMS5iSjv+NPGnGTgD3q+Q==";

export const generateKey = () => {
    var key = new NodeRSA({ b: 1024 });//生成128位秘钥
    var pubkey = key.exportKey('pkcs8-public');//导出公钥
    var prikey = key.exportKey('pkcs8-private');//导出私钥
    let pub = pubkey.split('\n');
    pubkey = '';
    for (let i = 1; i < pub.length - 1; i++) {
        pubkey += pub[i];
    }
    let pri = prikey.split('\n');
    prikey = '';
    for (let i = 1; i < pri.length - 1; i++) {
        prikey += pri[i];
    }
    console.log(pubkey);
    console.log(prikey);
    return { pubkey, prikey };
}


const priKey = new NodeRSA(strPriKey, 'pkcs8-private');//导入私钥
priKey.setOptions({ encryptionScheme: 'pkcs1' });//就是增加这一行代码。

// test();
const test = () => {
    const { pubkey, prikey } = generateKey();
    let aeskey = 'HHM3MWsucz6tq71CxeObsg==';
    let tjia = encrypte(strPubKey, 'hello ya');
    console.log(decrypte(tjia, strPriKey));

    let jia = encrypte(strPubKey, aeskey);//=aeskeyjia
    console.log('公钥加密：', jia);//
    let jie = decrypte(jia, strPriKey);//=aeskey
    console.log('私钥解密：', jie);
}
/**
 * 公钥加密
 * @param {公钥字符串}} pubKey
 * @param {待加密字符串} buffer
 */
export const encrypte = (pubStr, data) => {
    let pub = new NodeRSA(pubStr, 'pkcs8-public');
    pub.setOptions({ encryptionScheme: 'pkcs1' });//就是增加这一行代码。
    let encrypted = pub.encrypt(data, 'base64');
    return encrypted;
}
/**
 * 私钥解密
 * @param {待解密字符串} buffer
 */
export const decrypte = (data, priStr) => {
    if (priStr) {
        let priTmp = new NodeRSA(priStr, 'pkcs8-private');//导入私钥
        priTmp.setOptions({ encryptionScheme: 'pkcs1' });//就是增加这一行代码。
        return priTmp.decrypt(data, 'utf8');
    }
    return priKey.decrypt(data, 'utf8');
}

export default {
    generateKey,
    encrypte,
    decrypte
}
