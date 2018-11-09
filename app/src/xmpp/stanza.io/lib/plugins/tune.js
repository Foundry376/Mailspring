'use strict';

var NS = 'http://jabber.org/protocol/tune';

module.exports = function (client) {

    client.disco.addFeature(NS);
    client.disco.addFeature(NS + '+notify');

    client.on('pubsub:event', function (msg) {
        if (!msg.event.updated) {
            return;
        }

        if (msg.event.updated.node !== NS) {
            return;
        }

        client.emit('tune', {
            jid: msg.from,
            tune: msg.event.updated.published[0].tune
        });
    });

    client.publishTune = function (tune, cb) {
        return this.publish('', NS, {
            tune: tune
        }, cb);
    };
};
