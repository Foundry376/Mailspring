'use strict';


module.exports = function (client) {

    client.disco.addFeature('urn:xmpp:blocking');

    client.block = function (jid, cb) {
        return client.sendIq({
            type: 'set',
            block: {
                jids: [jid]
            }
        }, cb);
    };

    client.unblock = function (jid, cb) {
        return client.sendIq({
            type: 'set',
            unblock: {
                jids: [jid]
            }
        }, cb);
    };

    client.getBlocked = function (cb) {
        return client.sendIq({
            type: 'get',
            blockList: true
        }, cb);
    };

    client.on('iq:set:block', function (iq) {
        client.emit('block', {
            jids: iq.block.jids || []
        });
        client.sendIq(iq.resultReply());
    });

    client.on('iq:set:unblock', function (iq) {
        client.emit('unblock', {
            jids: iq.unblock.jids || []
        });
        client.sendIq(iq.resultReply());
    });
};
