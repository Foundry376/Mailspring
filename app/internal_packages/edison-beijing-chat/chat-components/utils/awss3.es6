var AWS = require('aws-sdk');
const { decryptByAESFile } = require('./aes');
import fs from 'fs';
import uuid from 'uuid';

// import AWS object without services
//var AWS = require('aws-sdk/global');
// Set the region
AWS.config.update({
    region: "us-east-2",
    accessKeyId: "AKIAJPPBMFBNHSNZ5ELA",
    secretAccessKey: "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",
    Endpoint: "http://s3.us-east-2.amazonaws.com"
});
// import individual service
//var S3 = require('aws-sdk/clients/s3');
var s3 = new AWS.S3();
//var AWS_ENDPOINT_URL = "http://s3.us-east-2.amazonaws.com";
// 存储桶名称在所有 S3 用户中必须是独一无二的

var path = require('path');
var myBucket = 'edison-media-stag';
var ENCRYPTED_SUFFIX = ".encrypted";

export const downloadFile = (aes, key, name, callback, progressBack) => {
    var params = {
        Bucket: myBucket,
        Key: key
    };
  let request;
  if (!progressBack) {
    request = s3.getObject(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else {
          // console.log(data);           // successful response
          //console.log('data.Body', data.Body);
          if (aes) {
            //fs.writeFileSync('./files/src' + name, data.Body);
            fs.writeFileSync(name, decryptByAESFile(aes, data.Body));
          } else {
            fs.writeFileSync(name, data.Body);
          }
          if (callback) {
            callback();
          }
          console.log(`succeed downloadFile aws3 file ${key} to ${name}`);
        }
      });
    } else {
      request = s3.getObject(params);
      request.on('httpDownloadProgress', function (progress) {
        if (progressBack) {
          progressBack(progress);
        }
        if (+progress.loaded == +progress.total) {
          console.log(`finish downloadFile aws3 file ${key} to ${name}`, request);
          const err = request.response.error;
          if (err) {
            console.log(err, err.stack);
          } else {
            let res = request.response;
            let data = res.data;
            res = res.httpResponse;
            const buffers = res && res.buffers;
            let body;
            if (data) {
              body = data && data.body;
            } else if (buffers) {
              body = Buffer.concat(buffers);
            }
            if (aes) {
              body = decryptByAESFile(aes, body);
            }
            fs.writeFileSync(name, body);
            if (callback) {
              callback();
            }
            console.log(`succeed downloading aws3 file ${key} to ${name}`);
          }
        }
      });
      request.send();
    }
    return request;
}

export const uploadFile = (oid, aes, file, callback) => {

    let filename = path.basename(file);
    let size;
    var fileStream;
    var readStream = fs.createReadStream(file);
    readStream.on('error', (err) => {
        console.log('发生异常:', err);
    });
    let arr = [];
    var myKey = oid + '/' + uuid.v4() + path.extname(file);
    readStream.on('data', (chunk) => {
        //console.log('读取文件数据:', chunk);
        arr.push(chunk);
    });
    readStream.on('end', () => {
        let data = Buffer.concat(arr);Ï
        size = getSize(data.length);
        if (aes) {
            fileStream = encryptByAESFile(aes, data);
            //console.log('fileStream', fileStream);
            myKey = myKey + ENCRYPTED_SUFFIX;
        } else {
            fileStream = data;
        }

        var uploadParams = { Bucket: myBucket, Key: myKey, Body: fileStream };//,ACL: 'public-read'};
        const request = s3.putObject(uploadParams);
        request.on('httpUploadProgress', function (progress) {
          console.log(progress.loaded + " of " + progress.total + " bytes");
          if (callback && +progress.loaded == +progress.total) {
            callback(null, filename, myKey, size);
            console.log("Upload Success", data);
          }
        });
        request.send();
        return request;
    })
}

function getSize(len) {
    if (len < 1024) {
        return len + ' B';
    } else if (len < 1024 * 1024) {
        return (len / 1024).toFixed(2) + ' KB';
    }
    else if (len < 1024 * 1024 * 1024) {
        return (len / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
        return (len / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
}

