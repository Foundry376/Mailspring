'use strict';


module.exports = function (client) {

    client.disco.addFeature('urn:xmpp:rtt:0');

    client.on('message', function (msg) {
        if (msg.rtt) {
            client.emit('rtt', msg);
            client.emit('rtt:' + msg.rtt.event, msg);
        }
    });
};
