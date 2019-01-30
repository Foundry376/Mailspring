'use strict';

var JID = require('xmpp-jid').JID;


module.exports = function (client, stanzas, config) {

    client.registerFeature('bind', 300, function (features, cb) {
        var self = this;
        self.sendIq({
            type: 'set',
            bind: {
                resource: config.resource,
                deviceId: config.deviceId,
                timestamp: config.timestamp,
                deviceType: config.deviceType,
                deviceModel: config.deviceModel,
                clientVerCode: config.clientVerCode,
                clientVerName: config.clientVerName
            }
        }, function (err, resp) {
            if (err) {
                self.emit('session:error', err);
                return cb('disconnect', 'JID binding failed');
            }

            self.features.negotiated.bind = true;
            self.emit('session:prebind', resp.bind);

            var canStartSession = !features.session || (features.session && features.session.optional);
            if (!self.sessionStarted && canStartSession) {
                self.emit('session:started', self.jid);
            }
            return cb();
        });
    });

    client.on('session:started', function () {
        client.sessionStarted = true;
    });

    client.on('session:prebind', function (boundJID) {
        client.jid = new JID(boundJID.jid);
        client.emit('session:bound', client.jid);
    });

    client.on('disconnected', function () {
        client.sessionStarted = false;
        client.features.negotiated.bind = false;
    });
};
