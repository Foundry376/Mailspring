'use strict';


module.exports = function (client) {

    client.disco.addFeature('vcard-temp');

    client.getVCard = function (jid, cb) {
        return this.sendIq({
            to: jid,
            type: 'get',
            vCardTemp: true
        }, cb);
    };

    client.publishVCard = function (vcard, cb) {
        return this.sendIq({
            type: 'set',
            vCardTemp: vcard
        }, cb);
    };
};
