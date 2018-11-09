'use strict';

var NS = 'http://jabber.org/protocol/shim';


module.exports = function (client) {

    client.disco.addFeature(NS);
    client.disco.addFeature(NS + '#SubID', NS);
};
