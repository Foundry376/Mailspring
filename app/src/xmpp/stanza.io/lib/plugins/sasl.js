'use strict';


var NS = 'urn:ietf:params:xml:ns:xmpp-sasl';


module.exports = function (client, stanzas) {

    var Auth = stanzas.getDefinition('auth', NS);
    var Response = stanzas.getDefinition('response', NS);
    var Abort = stanzas.getDefinition('abort', NS);

    client.registerFeature('sasl', 100, function (features, cb) {
        var self = this;

        var mech = self.SASLFactory.create(features.sasl.mechanisms);
        if (!mech) {
            self.releaseGroup('sasl');
            self.emit('auth:failed');
            return cb('disconnect', 'authentication failed');
        }

        self.on('sasl:success', 'sasl', function () {
            self.features.negotiated.sasl = true;
            self.releaseGroup('sasl');
            self.emit('auth:success', self.config.credentials);
            cb('restart');
        });

        self.on('sasl:challenge', 'sasl', function (challenge) {
            mech.challenge(new Buffer(challenge.value, 'base64').toString());
            return self.getCredentials(function (err, credentials) {
                if (err) {
                    return self.send(new Abort());
                }

                var resp = mech.response(credentials);
                if (resp || resp === '') {
                    self.send(new Response({
                        value: new Buffer(resp).toString('base64')
                    }));
                } else {
                    self.send(new Response());
                }

                if (mech.cache) {
                    Object.keys(mech.cache).forEach(function (key) {
                        if (!mech.cache[key]) {
                            return;
                        }

                        self.config.credentials[key] = new Buffer(mech.cache[key]);
                    });

                    self.emit('credentials:update', self.config.credentials);
                }
            });
        });

        self.on('sasl:failure', 'sasl', function () {
            self.releaseGroup('sasl');
            self.emit('auth:failed');
            cb('disconnect', 'authentication failed');
        });

        self.on('sasl:abort', 'sasl', function () {
            self.releaseGroup('sasl');
            self.emit('auth:failed');
            cb('disconnect', 'authentication failed');
        });

        var auth = {
            mechanism: mech.name
        };

        if (mech.clientFirst) {
            return self.getCredentials(function (err, credentials) {
                if (err) {
                    return self.send(new Abort());
                }

                auth.value = new Buffer(mech.response(credentials)).toString('base64');
                self.send(new Auth(auth));
            });
        }
        
        self.send(new Auth(auth));
    });

    client.on('disconnected', function () {
        client.features.negotiated.sasl = false;
        client.releaseGroup('sasl');
    });
};
