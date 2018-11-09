'use strict';


module.exports = function (client) {

    client.disco.addFeature('urn:xmpp:time');

    client.getTime = function (jid, cb) {
        return this.sendIq({
            to: jid,
            type: 'get',
            time: true
        }, cb);
    };

    client.on('iq:get:time', function (iq) {
        var time = new Date();
        client.sendIq(iq.resultReply({
            time: {
                utc: time,
                tzo: time.getTimezoneOffset()
            }
        }));
    });
};
