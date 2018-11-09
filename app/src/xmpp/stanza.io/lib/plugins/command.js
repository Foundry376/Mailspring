'use strict';


var NS = 'http://jabber.org/protocol/commands';


module.exports = function (client) {

    client.disco.addFeature(NS);
    client.disco.addItem({
        name: 'Ad-Hoc Commands',
        node: NS
    });


    client.getCommands = function (jid, cb) {
        return client.getDiscoItems(jid, NS, cb);
    };
};
