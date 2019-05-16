/* global Promise */
'use strict';

var each = require('lodash.foreach');
var extend = require('lodash.assign');
var isArray = require('lodash.isarray');

var jxt = require('../../jxt');
var WildEmitter = require('wildemitter');
var util = require('util');
var uuid = require('uuid');
var JID = require('xmpp-jid').JID;
var StreamManagement = require('./sm');
var getHostMeta = require('hostmeta');
var SASLFactory = require('saslmechanisms');


var SASL_MECHS = {
    external: require('sasl-external'),
    'scram-sha-1': require('sasl-scram-sha-1'),
    'digest-md5': require('alt-sasl-digest-md5'),
    'x-oauth2': require('sasl-x-oauth2'),
    plain: require('sasl-plain'),
    anonymous: require('sasl-anonymous')
};


function timeoutRequest(targetPromise, id, delay) {
    var timeoutRef;
    return Promise.race([
        targetPromise,
        new Promise(function (resolve, reject) {
            timeoutRef = setTimeout(function () {
                reject({
                    id: id,
                    type: 'error',
                    error: {
                        condition: 'timeout'
                    }
                });
            }, delay);
        })
    ]).then(function (result) {
        clearTimeout(timeoutRef);
        return result;
    });
}


function Client(opts) {
    var self = this;

    WildEmitter.call(this);

    opts = opts || {};
    this._initConfig(opts);

    this.stanzas = jxt.getGlobalJXT();

    this.jid = new JID();

    this.stanzas = jxt.createRegistry();
    this.stanzas.use(require('jxt-xmpp-types'));
    this.stanzas.use(require('../../jxt-xmpp/lib'));

    this.use(require('./plugins/features'));
    this.use(require('./plugins/sasl'));
    this.use(require('./plugins/smacks'));
    this.use(require('./plugins/bind'));
    this.use(require('./plugins/session'));

    this.sm = new StreamManagement(this);

    this.transports = {};

    this.on('stream:data', function (data) {
        var memberschange;
        if (data.edimucevent && data.edimucevent.memberschange && data.edimucevent.memberschange.userJid) {
            memberschange = data.edimucevent.memberschange.toJSON();
        }
        var json = data ? data.toJSON() : null;
        if (!json) {
            return;
        }
        // if(data._extensions&&data._extensions.roster){ // yazz
        //     self.emit('rosterex',data._extensions.roster.items);
        //     //console.log(data._extensions.roster.items.toJSON());
        // }
        if (data._name === 'iq') {
            json._xmlChildCount = 0;
            each(data.xml.childNodes, function (child) {
                if (child.nodeType === 1) {
                    json._xmlChildCount += 1;
                }
            });
        }
        self.emit(data._eventname || data._name, json);
        if (data._name == 'open') {
            if (data.id) {
                self.emit("streamFeaturesEx", "bind");
            }
            else {
                self.emit("streamFeaturesEx", "sasl");
            }
        }
        if (data._name === 'message' || data._name === 'presence' || data._name === 'iq') {
            self.sm.handle(json);
            //console.log('yazz-test8', json);//yazz
            if (json.edimucevent && json.edimucevent.edimucconfig && json.edimucevent.edimucconfig.actorJid) {
                self.emit('edimucconfig', json);
            } else if (memberschange) {
                memberschange.from = json.from;
                self.emit('memberschange', memberschange);
            } else {
                self.emit('stanza', json);
            }
        } else if (data._name === 'smAck') {
            return self.sm.process(json);
        } else if (data._name === 'smRequest') {
            return self.sm.ack();
        }

        if (json.id) {
            self.emit('id:' + json.id, json);
            self.emit(data._name + ':id:' + json.id, json);
        }
    });

    this.on('disconnected', function () {
        if (self.transport) {
            self.transport.off('*');
            delete self.transport;
        }
        self.releaseGroup('connection');
    });

    this.on('auth:success', function () {
        if (self.transport) {
            self.transport.authenticated = true;
        }
    });

    this.on('iq', function (iq) {
        var iqType = iq.type;
        var xmlChildCount = iq._xmlChildCount;
        delete iq._xmlChildCount;

        var exts = Object.keys(iq).filter(function (ext) {
            return ext !== 'id' &&
                ext !== 'to' &&
                ext !== 'from' &&
                ext !== 'lang' &&
                ext !== 'type' &&
                ext !== 'errorReply' &&
                ext !== 'resultReply';
        });

        if (iq.type === 'get' || iq.type === 'set') {
            // Invalid request
            if (xmlChildCount !== 1) {
                return self.sendIq(iq.errorReply({
                    error: {
                        type: 'modify',
                        condition: 'bad-request'
                    }
                }));
            }

            // Valid request, but we don't have support for the
            // payload data.
            if (!exts.length) {
                return self.sendIq(iq.errorReply({
                    error: {
                        type: 'cancel',
                        condition: 'service-unavailable'
                    }
                }));
            }

            var iqEvent = 'iq:' + iqType + ':' + exts[0];
            if (self.callbacks[iqEvent]) {
                self.emit(iqEvent, iq);
            } else {
                // We support the payload data, but there's
                // nothing registered to handle it.
                self.sendIq(iq.errorReply({
                    error: {
                        type: 'cancel',
                        condition: 'service-unavailable'
                    }
                }));
            }
        }
    });

    this.on('message', function (msg) {
        //yazz
        //console.log("yazz-on-message:",msg);
        if (Object.keys(msg.$body || msg.$payload || {}).length) {
            if (msg.type === 'chat' || msg.type === 'normal') {
                self.emit('chat', msg);
                //console.log("yazz-on-message:", msg);
            } else if (msg.type === 'groupchat') {
                self.emit('groupchat', msg);
                //console.log("yazz-on-message:", msg);
            }
        }
        if (msg.type === 'normal' && msg.$e2ee) {
            self.emit('message:ext-e2ee', msg.$e2ee);
        }
        if (msg.type === 'normal' && msg.$received) {
            self.emit('message:received', msg.$received);
        }
        if (msg.type === 'error') {
            self.emit('message:error', msg);
        }
    });

    this.on('presence', function (pres) {
        var presType = pres.type || 'available';
        if (presType === 'error') {
            presType = 'presence:error';
        }
        self.emit(presType, pres);
    });
}

util.inherits(Client, WildEmitter);

Object.defineProperty(Client.prototype, 'stream', {
    get: function () {
        return this.transport ? this.transport.stream : undefined;
    }
});

Client.prototype._initConfig = function (opts) {
    var self = this;
    var currConfig = this.config || {};

    this.config = extend({
        useStreamManagement: true,
        transports: ['websocket'],//yazz, 'bosh'],
        sasl: ['plain']//yazz ['external', 'scram-sha-1', 'digest-md5', 'plain', 'anonymous']
    }, currConfig, opts);

    // Enable SASL authentication mechanisms (and their preferred order)
    // based on user configuration.
    if (!isArray(this.config.sasl)) {
        this.config.sasl = [this.config.sasl];
    }

    this.SASLFactory = new SASLFactory();
    this.config.sasl.forEach(function (mech) {
        if (typeof mech === 'string') {
            var existingMech = SASL_MECHS[mech.toLowerCase()];
            if (existingMech && existingMech.prototype && existingMech.prototype.name) {
                self.SASLFactory.use(existingMech);
            }
        } else {
            self.SASLFactory.use(mech);
        }
    });

    this.config.jid = new JID(this.config.jid);

    if (!this.config.server) {
        this.config.server = this.config.jid.domain;
    }

    if (this.config.password) {
        this.config.credentials = this.config.credentials || {};
        this.config.credentials.password = this.config.password;
        delete this.config.password;
    }

    if (this.config.transport) {
        this.config.transports = [this.config.transport];
    }

    if (!isArray(this.config.transports)) {
        this.config.transports = [this.config.transports];
    }
};

Client.prototype.use = function (pluginInit) {
    if (typeof pluginInit !== 'function') {
        return;
    }
    pluginInit(this, this.stanzas, this.config);
};

Client.prototype.nextId = function () {
    return uuid.v4();
};

Client.prototype.discoverBindings = function (server, cb) {
    getHostMeta(server, function (err, data) {
        if (err) {
            return cb(err, []);
        }

        var results = {
            websocket: [],
            bosh: []
        };
        var links = data.links || [];

        links.forEach(function (link) {
            if (link.href && link.rel === 'urn:xmpp:alt-connections:websocket') {
                results.websocket.push(link.href);
            }
            if (link.href && link.rel === 'urn:xmpp:altconnect:websocket') {
                results.websocket.push(link.href);
            }
            if (link.href && link.rel === 'urn:xmpp:alt-connections:xbosh') {
                results.bosh.push(link.href);
            }
            if (link.href && link.rel === 'urn:xmpp:altconnect:bosh') {
                results.bosh.push(link.href);
            }
        });

        cb(false, results);
    });
};

Client.prototype._getConfiguredCredentials = function () {
    var creds = this.config.credentials || {};
    var requestedJID = new JID(this.config.jid);

    var username = creds.username || requestedJID.local;
    var server = creds.server || requestedJID.domain;

    var defaultCreds = {
        username: username,
        password: this.config.password,
        server: server,
        host: server,
        realm: server,
        serviceType: 'xmpp',
        serviceName: server
    };

    var result = extend(defaultCreds, creds);

    return result;
};

Client.prototype.getCredentials = function (cb) {
    return cb(null, this._getConfiguredCredentials());
};

Client.prototype.connect = function (opts, transInfo) {
    var self = this;

    this._initConfig(opts);

    if (!transInfo && self.config.transports.length === 1) {
        transInfo = {};
        transInfo.name = self.config.transports[0];
    }

    if (transInfo && transInfo.name) {
        if (transInfo.name === 'websocket' || transInfo.name === 'old-websocket') {
            this.use(require('./plugins/websocket'));
            this.use(require('./plugins/oldwebsocket'));
        }
        if (transInfo.name === 'bosh') {
            this.use(require('./plugins/bosh'));
        }
        var trans = self.transport = new self.transports[transInfo.name](self.sm, self.stanzas);
        trans.on('*', function (event, data) {
            // if(event=='stream:start'){
            //   self.emit("streamFeaturesEx", "sasl");
            // }else
            {
                self.emit(event, data);
            }
        });
        return trans.connect(self.config);
    }

    return self.discoverBindings(self.config.server, function (err, endpoints) {
        if (err) {
            console.error('Could not find https://' + self.config.server + '/.well-known/host-meta file to discover connection endpoints for the requested transports.');
            return self.disconnect();
        }

        for (var t = 0, tlen = self.config.transports.length; t < tlen; t++) {
            var transport = self.config.transports[t];
            console.log('Checking for %s endpoints', transport);
            for (var i = 0, len = (endpoints[transport] || []).length; i < len; i++) {
                var uri = endpoints[transport][i];
                if (uri.indexOf('wss://') === 0 || uri.indexOf('https://') === 0) {
                    if (transport === 'websocket') {
                        self.config.wsURL = uri;
                    } else {
                        self.config.boshURL = uri;
                    }
                    console.log('Using %s endpoint: %s', transport, uri);
                    return self.connect(null, {
                        name: transport,
                        url: uri
                    });
                } else {
                    console.warn('Discovered unencrypted %s endpoint (%s). Ignoring', transport, uri);
                }
            }
        }
        console.error('No endpoints found for the requested transports.');
        return self.disconnect();
    });
};

Client.prototype.disconnect = function () {
    if (this.sessionStarted) {
        this.releaseGroup('session');
        if (!this.sm.started) {
            // Only emit session:end if we had a session, and we aren't using
            // stream management to keep the session alive.
            this.emit('session:end');
        }
    }
    this.sessionStarted = false;
    this.releaseGroup('connection');
    if (this.transport) {
        this.transport.disconnect();
    } else {
        this.emit('disconnected');
    }
};

Client.prototype.send = function (data) {
    this.emit('rawdata-', data);
    this.sm.track(data);
    if (this.transport) {
        this.transport.send(data);
    }
};

Client.prototype.sendMessage = function (data) {
    data = data || {};
    if (!data.id) {
        data.id = this.nextId();
    }

    var Message = this.stanzas.getMessage();
    var msg = new Message(data);
    //msg.body=msg.body.replace(/"/g,"&amp;quot;")
    // console.log("yazz-send-message1");
    //this.emit('message:sent', msg.body);
    //console.log("yazz-send-message2");
    this.send(msg);

    return data.id;
};

Client.prototype.sendPresence = function (data) {
    data = data || {};
    if (!data.id) {
        data.id = this.nextId();
    }
    var Presence = this.stanzas.getPresence();
    this.send(new Presence(data));

    return data.id;
};

Client.prototype.sendIq = function (data, cb) {
    var request, respEvent, allowed, dest;
    var self = this;

    //debugger;
    data = data || {};
    if (!data.id) {
        data.id = this.nextId();
    }

    var Iq = this.stanzas.getIq();
    var iq = (!data.toJSON) ? new Iq(data) : data;

    if (data.type === 'error' || data.type === 'result') {
        this.send(iq);
        return;
    }

    dest = new JID(data.to);
    allowed = {};
    allowed[''] = true;
    allowed[dest.full] = true;
    allowed[dest.bare] = true;
    allowed[dest.domain] = true;
    allowed[self.jid.bare] = true;
    allowed[self.jid.domain] = true;

    respEvent = 'iq:id:' + data.id;
    request = new Promise(function (resolve, reject) {
        var handler = function (res) {
            // Only process result from the correct responder
            if (res.from && !allowed[res.from.full]) {
                console.log(res);
                return;
            }

            // Only process result or error responses, if the responder
            // happened to send us a request using the same ID value at
            // the same time.
            if (res.type !== 'result' && res.type !== 'error') {
                return;
            }

            self.off(respEvent, handler);
            if (!res.error) {
                resolve(res);
            } else {
                reject(res);
            }
        };
        self.on(respEvent, 'session', handler);
    });

    this.send(iq);


    return timeoutRequest(request, data.id, (self.config.timeout || 15) * 1000).then(function (result) {
        if (cb) {
            cb(null, result);
        }
        return result;
    }).catch(function (err) {
        if (cb) {
            return cb(err);
        } else {
            const stackError = new Error();
            console.warn('stanza.io/lib/client.js: timeoutRequest: err:', err, stackError);
            // throw err;
        }
    });
};

Client.prototype.sendStreamError = function (data) {
    data = data || {};

    var StreamError = this.stanzas.getStreamError();
    var error = new StreamError(data);

    this.emit('stream:error', error.toJSON());
    this.send(error);
    this.disconnect();
};


module.exports = Client;
