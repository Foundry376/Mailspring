'use strict';


module.exports = function (client) {

    client.disco.addFeature('urn:xmpp:extdisco:1');

    client.getServices = function (jid, type, cb) {
        return this.sendIq({
            type: 'get',
            to: jid,
            services: {
                type: type
            }
        }, cb);
    };

    client.getServiceCredentials = function (jid, host, cb) {
        return this.sendIq({
            type: 'get',
            to: jid,
            credentials: {
                service: {
                    host: host
                }
            }
        }, cb);
    };
};
