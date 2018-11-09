'use strict';


module.exports = function (client) {

    client.getPrivateData = function (opts, cb) {
        return this.sendIq({
            type: 'get',
            privateStorage: opts
        }, cb);
    };

    client.setPrivateData = function (opts, cb) {
        return this.sendIq({
            type: 'set',
            privateStorage: opts
        }, cb);
    };
};
