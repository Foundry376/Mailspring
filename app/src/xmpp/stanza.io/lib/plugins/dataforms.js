'use strict';


module.exports = function (client) {

    client.disco.addFeature('jabber:x:data');
    client.disco.addFeature('urn:xmpp:media-element');
    client.disco.addFeature('http://jabber.org/protocol/xdata-validate');
    client.disco.addFeature('http://jabber.org/protocol/xdata-layout');

    client.on('message', function (msg) {
        if (msg.form) {
            client.emit('dataform', msg);
        }
    });
};
