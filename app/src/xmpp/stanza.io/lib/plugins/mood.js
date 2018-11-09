'use strict';

var NS = 'http://jabber.org/protocol/mood';


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

        client.emit('mood', {
            jid: msg.from,
            mood: msg.event.updated.published[0].mood
        });
    });

    client.publishMood = function (mood, text, cb) {
        return this.publish('', NS, {
            mood: {
                value: mood,
                text: text
            }
        }, cb);
    };
};
