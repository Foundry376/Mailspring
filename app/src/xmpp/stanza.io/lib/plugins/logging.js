'use strict';


module.exports = function (client) {

    client.disco.addFeature('', 'urn:xmpp:eventlog');

    client.sendLog = function (jid, logData) {
        client.sendMessage({
            to: jid,
            type: 'normal',
            log: logData
        });
    };
};
