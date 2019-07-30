import uuid from 'uuid/v4';
import { Transform } from 'stream';
import crypto from 'crypto';
// 导入 crypto-js 包
const CryptoJS = require('crypto-js');

/**
 * 生成密钥字节数组, 原始密钥字符串不足128位, 补填0.
 * @param {string} key - 原始 key 值
 * @return Buffer
 */
const fillKey = key => {
  const keys = Buffer.from(key);
  const filledKey = Buffer.alloc(keys.length > 16 ? 32 : 16);
  if (keys.length < filledKey.length) {
    filledKey.map((b, i) => (filledKey[i] = keys[i]));
  }

  return filledKey;
};

/**
 * 定义加密函数
 * @param {string} data - 需要加密的数据, 传过来前先进行 JSON.stringify(data);
 * @param {string} key - 加密使用的 key
 */
const aesEncrypt = (data, key) => {
  const cipher = CryptoJS.AES.encrypt(data, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
    iv: '',
  });
  const base64Cipher = cipher.ciphertext.toString(CryptoJS.enc.Base64);
  return base64Cipher;
};
/**
 * 定义解密函数
 * @param {string} encrypted - 加密的数据;
 * @param {string} key - 加密使用的 key
 */
const aesDecrypt = (encrypted, key) => {
  const restoreBase64 = encrypted;
  const decipher = CryptoJS.AES.decrypt(restoreBase64, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
    iv: '',
  });
  const resultDecipher = CryptoJS.enc.Utf8.stringify(decipher);
  return resultDecipher;
};

/**
 * 消息加密
 * @param {Aes key} key
 * @param {message body} buffer
 */
export const encryptByAES = (key, buffer) => {
  const k = CryptoJS.enc.Base64.parse(key);
  const encrypted = aesEncrypt(buffer, k);
  return encrypted;
};

/**
 * 消息解密
 * @param {aes key} key
 * @param {message body} buffer
 */
export const decryptByAES = (key, buffer) => {
  try {
    const k = CryptoJS.enc.Base64.parse(key);
    const decrypted = aesDecrypt(buffer, k);
    return decrypted;
  } catch (e) {
    console.warn(key, buffer);
    throw e;
  }
};

// 文件流加密
export class CipherFileStream extends Transform {
  constructor(aes) {
    super();
    this._loaded = 0;
    if (aes) {
      const key = Buffer.from(aes, 'base64');
      const decipher = crypto.createCipheriv('aes-128-ecb', key, '');
      decipher.setAutoPadding(true);
      this._decipher = decipher;
    } else {
      this._decipher = null;
    }
  }
}

CipherFileStream.prototype._transform = function(data, encoding, callback) {
  if (this._decipher) {
    this.push(this._decipher.update(data));
  } else {
    this.push(data);
  }
  this._loaded += data.length;
  // 触发进度事件
  this.emit('process', this._loaded);
  callback();
};

CipherFileStream.prototype._flush = function(callback) {
  if (this._decipher) {
    this.push(this._decipher.final());
  }
  callback();
};

// 文件流解密
export class DecryptFileStream extends Transform {
  constructor(aes) {
    super();
    this._loaded = 0;
    if (aes) {
      const key = Buffer.from(aes, 'base64');
      const decipher = crypto.createDecipheriv('aes-128-ecb', key, '');
      decipher.setAutoPadding(true);
      this._decipher = decipher;
    } else {
      this._decipher = null;
    }
  }
}

DecryptFileStream.prototype._transform = function(data, encoding, callback) {
  if (this._decipher) {
    this.push(this._decipher.update(data));
  } else {
    this.push(data);
  }
  this._loaded += data.length;
  // 触发进度事件
  this.emit('process', this._loaded);
  callback();
};

DecryptFileStream.prototype._flush = function(callback) {
  if (this._decipher) {
    this.push(this._decipher.final());
  }
  callback();
};

export const generateAESKey = () => {
  return CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(
      uuid
        .v4()
        .replace(/-/g, '')
        .substring(0, 16)
    )
  );
};

export default {
  encryptByAES,
  decryptByAES,
  generateAESKey,
};
