const https = require('https');
const http = require('http');
const url = require('url');

const getContent = (h, options, encode, data, cb) => {
    let arr = [];
    var req = h.request(options, (res) => {
        res.setEncoding(encode);
        res.on('data', (chunk) => {
            arr.push(chunk);
        });
        res.on('end', () => {
            cb(null, arr.join(''), res);
        });
    });

    req.on('error', function (e) {
        cb(e);
    });
    if (data) {
        req.write(data);
    }

    req.end();
}

export const get = (u, cb, headers) => {
    const encode = 'utf8';
    const srvUrl = url.parse(u);
    let options = {
        hostname: srvUrl.hostname,
        port: srvUrl.port,
        path: srvUrl.path,
        method: 'GET'
    };
    if (headers) {
        options.headers = headers;
    }
    let h;
    if (srvUrl.protocol == 'https:') {
        options.requestCert = false;
        options.rejectUnauthorized = true;
        h = https;
    } else {
        h = http;
    }
    getContent(h, options, encode, '', cb);
}

export const post = (u, data, cb, headers) => {
    const encode = 'utf8';
    if (data && typeof (data) !== 'string') {
        data = JSON.stringify(data);
    }
    const srvUrl = url.parse(u);
    let options = {
        hostname: srvUrl.hostname,
        port: srvUrl.port,
        path: srvUrl.path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Content-Length': data ? Buffer.byteLength(data) : 0
        }
    };
    if (headers) {
        options.headers = Object.assign(options.headers, headers);
    }

    let h;
    if (srvUrl.protocol == 'https:') {
        options.requestCert = false;
        options.rejectUnauthorized = true;
        h = https;
    } else {
        h = http;
    }
    getContent(h, options, encode, data, cb);
}

export default {
    get, post
}
