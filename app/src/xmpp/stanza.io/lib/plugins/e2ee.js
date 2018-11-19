'use strict';


module.exports = function (client) {
    client.getE2ee = function (users, cb) {
        var self = this;
        let obj = {
            type: 'get',
            e2ee: {}
        };
        if (users) {
            obj.e2ee.users = users;
        } else {
            obj.e2ee.text = '';
        };
        return client.sendIq(obj).then(function (resp) {
            return resp;
        }).then(function (result) {
            if (cb) {
                cb(null, result);
            }
            //debugger;
            return result;
        }, function (err) {
            if (cb) {
                cb(err);
            } else {
                throw err;
            }
        });
    };
    client.setE2ee = function (user, cb) {
        return client.sendIq({
            type: 'set',
            e2ee: { users: user }
        }, cb);
    };
};
