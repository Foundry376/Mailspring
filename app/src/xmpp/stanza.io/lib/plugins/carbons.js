'use strict';



module.exports = function (client) {

    client.disco.addFeature('urn:xmpp:carbons:2');

    client.enableCarbons = function (cb) {
        return this.sendIq({
            type: 'set',
            enableCarbons: true
        }, cb);
    };

    client.disableCarbons = function (cb) {
        return this.sendIq({
            type: 'set',
            disableCarbons: true
        }, cb);
    };

    client.on('message', function (msg) {
        if (msg.carbonSent) {
            return client.emit('carbon:sent', msg);
        }
        if (msg.carbonReceived) {
            return client.emit('carbon:received', msg);
        }
    });

    client.on('carbon:*', function (name, carbon) {
        var dir = name.split(':')[1];

        if (carbon.from.bare !== client.jid.bare) {
            return;
        }

        var msg, delay;
        if (dir === 'received') {
            msg = carbon.carbonReceived.forwarded.message;
            delay = carbon.carbonReceived.forwarded.delay;
        } else {
            msg = carbon.carbonSent.forwarded.message;
            delay = carbon.carbonSent.forwarded.delay;
        }

        if (!msg.delay) {
            msg.delay = {
                stamp: delay ? delay.stamp : new Date(Date.now())
            };
        }

        msg.carbon = true;

        // Treat the carbon copied message however we would
        // have originally treated it ourself.
        if (msg.from.bare === client.jid.bare) {
            client.emit('message:sent', msg);
        } else {
            client.emit('message', msg);
        }
    });
};
