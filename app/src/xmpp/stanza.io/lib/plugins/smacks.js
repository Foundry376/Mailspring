'use strict';


module.exports = function (client, stanzas, config) {

    var smacks = function (features, cb) {
        var self = this;

        if (!config.useStreamManagement) {
            return cb();
        }

        self.on('stream:management:enabled', 'sm', function (enabled) {
            self.sm.enabled(enabled);
            self.features.negotiated.streamManagement = true;
            self.releaseGroup('sm');
            cb();
        });

        self.on('stream:management:resumed', 'sm', function (resumed) {
            self.sm.resumed(resumed);
            self.features.negotiated.streamManagement = true;
            self.features.negotiated.bind = true;
            self.sessionStarted = true;
            self.releaseGroup('sm');
            cb('break'); // Halt further processing of stream features
        });

        self.on('stream:management:failed', 'sm', function () {
            self.sm.failed();
            self.emit('session:end');
            self.releaseGroup('session');
            self.releaseGroup('sm');
            cb();
        });

        if (!self.sm.id) {
            if (self.features.negotiated.bind) {
                self.sm.enable();
            } else {
                self.releaseGroup('sm');
                cb();
            }
        } else if (self.sm.id && self.sm.allowResume) {
            self.sm.resume();
        } else {
            self.releaseGroup('sm');
            cb();
        }
    };

    client.on('disconnected', function () {
        client.features.negotiated.streamManagement = false;
    });

    client.registerFeature('streamManagement', 200, smacks);
    client.registerFeature('streamManagement', 500, smacks);
};
