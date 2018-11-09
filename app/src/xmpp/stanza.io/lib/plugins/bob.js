'use strict';


module.exports = function (client) {

    client.disco.addFeature('urn:xmpp:bob');

    client.getBits = function (jid, cid, cb) {
        return client.sendIq({
            to: jid,
            type: 'get',
            bob: {
                cid: cid
            }
        }, cb);
    };
};
