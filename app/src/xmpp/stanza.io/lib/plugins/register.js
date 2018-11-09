'use strict';



module.exports = function (client) {

    client.getAccountInfo = function (jid, cb) {
        return this.sendIq({
            type: 'get',
            to: jid,
            register: true
        }, cb);
    };

    client.updateAccount = function (jid, data, cb) {
        return this.sendIq({
            type: 'set',
            to: jid,
            register: data
        }, cb);
    };

    client.deleteAccount = function (jid, cb) {
        return this.sendIq({
            type: 'set',
            to: jid,
            register: {
                remove: true
            }
        }, cb);
    };
};
