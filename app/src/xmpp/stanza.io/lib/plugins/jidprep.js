'use strict';


module.exports = function (client) {

    client.prepJID = function (jid, cb) {
        return client.sendIq({
            to: client.jid.domain,
            type: 'get',
            jidPrep: jid
        }, cb);
    };
};
