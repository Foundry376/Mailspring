var AWS = require('aws-sdk');
const { CipherFileStream, DecryptFileStream } = require('./aes');
import fs from 'fs';
import uuid from 'uuid';

// import AWS object without services
//var AWS = require('aws-sdk/global');
// Set the region

let s3options = {
  region: 'us-east-2',
  accessKeyId: 'AKIAJPPBMFBNHSNZ5ELA',
  secretAccessKey: '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',
  Endpoint: 'http://s3.us-east-2.amazonaws.com',
};

AWS.config.update(s3options);
// import individual service
//var S3 = require('aws-sdk/clients/s3');
var s3 = new AWS.S3();
//var AWS_ENDPOINT_URL = "http://s3.us-east-2.amazonaws.com";
// 存储桶名称在所有 S3 用户中必须是独一无二的

var path = require('path');
const BUCKET_DEV = 'edison-media-stag';
const BUCKET_PROD = 'edison-media';
const ENCRYPTED_SUFFIX = '.encrypted';

function getMyBucket() {
  if (AppEnv.config.get(`chatProdEnv`)) {
    return BUCKET_PROD;
  } else {
    return BUCKET_PROD;
  }
}

export const downloadFile = (aes, key, name, callback, progressBack) => {
  var params = {
    Bucket: getMyBucket(),
    Key: key,
  };

  const request = s3.getObject(params);
  // 创建可读流、可写流和解密流
  const readStream = request.createReadStream();
  const writeStream = fs.createWriteStream(name);
  const decryptStream = new DecryptFileStream(aes);

  const onError = error => {
    // 发生错误关闭所有通道和流，避免内存泄漏
    readStream.unpipe();
    readStream.destroy();
    decryptStream.destroy();
    writeStream.destroy();
    if (callback) {
      callback;
    }
    // 发生错误删除文件
    if (fs.existsSync(name)) {
      fs.unlinkSync(name);
    }
  };

  // 监听错误事件
  readStream.on('error', onError);
  decryptStream.on('error', onError);
  writeStream.on('error', onError);

  // 获取对象信息，为了获取长度刷新进度组件
  s3.headObject(params, (err, data) => {
    if (err) {
      onError(err);
      return;
    }
    const fileLength = data.ContentLength;

    // 进度事件
    decryptStream.on('process', loaded => {
      if (progressBack && fileLength > loaded) {
        progressBack({
          loaded,
          total: fileLength,
        });
      } else if (callback && fileLength === loaded) {
        console.log('finished downloadFile: ', aes, key, name);
        callback();
      }
    });
    // 流传递
    if (decryptStream.writable && writeStream.writable) {
      readStream.pipe(decryptStream).pipe(writeStream);
    }
  });

  return request;
};

export const uploadFile = (oid, aes, file, callback, progressCallback) => {
  const filename = path.basename(file);
  let myKey = oid + '/' + uuid.v4() + path.extname(file);
  const readS = fs.createReadStream(file);
  if (aes) {
    myKey = myKey + ENCRYPTED_SUFFIX;
  }
  // 流加密
  const cipherStream = new CipherFileStream(aes);
  const data = readS.pipe(cipherStream);
  var uploadParams = { Bucket: getMyBucket(), Key: myKey, Body: data };
  const request = s3.upload(uploadParams);
  request.on('httpUploadProgress', function (progress) {
    if (progressCallback) {
      progressCallback(progress);
    }
    if (+progress.loaded === +progress.total) {
      console.log('Upload Finished. ');
      if (callback) {
        callback(null, filename, myKey, progress.loaded);
      }
    }
  });
  request.send();
  return request;
};

function getSize(len) {
  if (len < 1024) {
    return len + ' B';
  } else if (len < 1024 * 1024) {
    return (len / 1024).toFixed(2) + ' KB';
  } else if (len < 1024 * 1024 * 1024) {
    return (len / (1024 * 1024)).toFixed(2) + ' MB';
  } else {
    return (len / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
}
