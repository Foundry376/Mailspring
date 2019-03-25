var AWS = require('aws-sdk');
let hls3 = require('s3');
const { decryptByAESFile } = require('./aes');
import fs from 'fs';
import uuid from 'uuid';

// import AWS object without services
//var AWS = require('aws-sdk/global');
// Set the region

let s3options = {
  region: "us-east-2",
  accessKeyId: "AKIAJPPBMFBNHSNZ5ELA",
  secretAccessKey: "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",
  Endpoint: "http://s3.us-east-2.amazonaws.com"
}

AWS.config.update(s3options);
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
        let data = Buffer.concat(arr);
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

export const uploadProgressly = (oid, aes, file, callback, progressCallBack) => {

  let myKey = oid + '/' + uuid.v4() + path.extname(file);
  if (1/*aes*/) {
    let data = fs.readFileSync(file);
    // data = encryptByAESFile(aes, data);
    fs.writeFileSync(file, data);
    let data2 = fs.readFileSync(file);
    console.log('dbg*** original and writed data: ', data, data2);
    myKey = myKey + ENCRYPTED_SUFFIX;
  }
    var params = {
      localFile: file,
      s3Params: {
        Bucket: myBucket+' wrong bucket',
        Key: myKey,
      },
    };
    debugger
    let  client = hls3.createClient({s3options});
    console.log('dbg*** uploadProgressly client: ', client);

    var uploader = client.uploadFile(params);
    uploader.on('error', function(err) {
      console.error("dbg*** unable to upload:", err.stack);
    });
    uploader.on('progress', function() {
      console.log("dbg*** upload progress", uploader.progressAmount, uploader.progressTotal);
      if ( +uploader.progressAmount === +uploader.progressTotal ) {
        setTimeout(() => {
          params.localFile += '-2';
          var downloader = client.downloadFile(params);
          downloader.on('error', function(err) {
            console.error("dbg*** error: unable to download:", err.stack);
          });
          downloader.on('progress', function() {
            console.log("dbg*** download progress", downloader.progressAmount, downloader.progressTotal);
          });
          downloader.on('end', function() {
            console.log("dbg*** done downloading");
          }, 10000);
        })
      }
    });
    uploader.on('end', function() {
      console.log("dbg*** done uploading");
    });
    console.log('dbg*** uploadProgressly uploader: ', uploader);
    debugger
    return uploader;
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

