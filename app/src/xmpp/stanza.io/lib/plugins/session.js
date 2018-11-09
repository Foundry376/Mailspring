'use strict';


module.exports = function (client) {

    client.registerFeature('session', 1000, function (features, cb) {
        var self = this;

        if (features.session.optional || self.sessionStarted) {
            self.features.negotiated.session = true;
            return cb();
        }

        self.sendIq({
            type: 'set',
            session: {}
        }, function (err) {
            if (err) {
                return cb('disconnect', 'session request failed');
            }

            self.features.negotiated.session = true;
            if (!self.sessionStarted) {
                self.sessionStarted = true;
                self.emit('session:started', self.jid);
            }
            cb();
        });
    });

    client.on('disconnected', function () {
        client.sessionStarted = false;
        client.features.negotiated.session = false;
    });
};
