'use strict';

var hashes = require('iana-hashes');


module.exports = function (client) {

    client.disco.addFeature('urn:xmpp:hashes:1');

    var names = hashes.getHashes();
    names.forEach(function (name) {
        client.disco.addFeature('urn:xmpp:hash-function-text-names:' + name);
    });
};
