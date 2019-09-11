'use strict';

var util = require('util');
var WildEmitter = require('wildemitter');
var async = require('async');

// var WS = (require('faye-websocket') && require('faye-websocket').Client) ?
//     require('faye-websocket').Client :
//     window.WebSocket;

var WS = window.WebSocket;
var WS_OPEN = 1;

let feature1 = '<stream:features xmlns:stream="http://etherx.jabber.org/streams"><auth xmlns="http://jabber.org/features/iq-auth"/><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms><register xmlns="http://jabber.org/features/iq-register"/><ver xmlns="urn:xmpp:features:rosterver"/><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/><compression xmlns="http://jabber.org/features/compress"><method>zlib</method></compression></stream:features>';
let feature2 = '<stream:features xmlns:stream="http://etherx.jabber.org/streams"><register xmlns="http://jabber.org/features/iq-register"/><ver xmlns="urn:xmpp:features:rosterver"/><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/><compression xmlns="http://jabber.org/features/compress"><method>zlib</method></compression><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/><session xmlns="urn:ietf:params:xml:ns:xmpp-session"/></stream:features>';

function WSConnection(sm, stanzas) {
    var self = this;
    self.ts = new Date().getTime();
    WildEmitter.call(this);

    self.sm = sm;
    self.closing = false;

    self.stanzas = {
        Open: stanzas.getDefinition('open', 'urn:ietf:params:xml:ns:xmpp-framing', true),
        Close: stanzas.getDefinition('close', 'urn:ietf:params:xml:ns:xmpp-framing', true),
        StreamError: stanzas.getStreamError()
    };

    self.sendQueue = async.queue(function (data, cb) {
        if (self.conn) {
            if (typeof data !== 'string') {
                data = data.toString();
            }

            data = Buffer.from(data, 'utf8').toString();
            self.emit('raw:outgoing', data);
            if (self.conn.readyState === WS_OPEN) {
                self.conn.send(data);
            }
        }
        cb();
    }, 1);

    self.on('connected', function () {
        if (!self.isCache) {
            self.send(self.startHeader(''));// yazz
        }
        else {
            self.send(self.startHeader(self.config.sessionId));// yazz
        }
    });

    self.on('raw:incoming', function (data) {
        var stanzaObj, err;
        data = data.trim();
        if (data === '') {
            return;
        }

        try {
            stanzaObj = stanzas.parse(data);
        } catch (e) {
            err = new self.stanzas.StreamError({
                condition: 'invalid-xml'
            });
            self.emit('stream:error', err, e);
            self.send(err);
            return self.disconnect();
        }

        if (!stanzaObj) {
            return;
        }

        if (stanzaObj._name === 'openStream') {
            self.hasStream = true;// yazz
            self.stream = stanzaObj;
            window.localStorage['sessionId' + self.config.jid.local] = stanzaObj.id;

            return self.emit('stream:start', stanzaObj.toJSON());
        }
        if (stanzaObj._name === 'closeStream') {
            self.emit('stream:end');
            return self.disconnect();
        }

        if (!stanzaObj.lang && self.stream) {
            stanzaObj.lang = self.stream.lang;
        }

        self.emit('stream:data', stanzaObj);
    });
}

util.inherits(WSConnection, WildEmitter);
// WSConnection.prototype.reconnect = () => {
//     if (this.conn) {

//     }
// };
WSConnection.prototype.ts = 0;
WSConnection.prototype.connect = function (opts) {
    var self = this;
    self.config = opts;
    self.hasStream = false;
    self.closing = false;
    self.isCache = true;
    if (self.conn) {
        // console.log('ws.10', self.conn.readyState, self.conn);
        self.conn.close();
    }
    self.conn = new WS(opts.wsURL, 'xmpp', opts.wsOptions);
    // console.log('ws.11', self.conn, opts.wsOptions);
    self.conn.onerror = function (e) {
        e.preventDefault();
        // console.warn(`websocket error:${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()},`, e);
        //self.emit('disconnected', self);
    };

    self.conn.onclose = function () {
        // console.warn(`websocket onclose,ts:${self.ts},${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}`);
        self.emit('disconnected', self);
    };

    self.conn.onopen = function () {
        self.sm.started = false;
        // console.warn(`websocket onopen,ts:${self.ts},${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}`);
        self.emit('connected', self);
    };

    self.conn.onmessage = function (wsMsg) {
        self.emit('raw:incoming', Buffer.from(wsMsg.data, 'utf8').toString());
        if (!self.isCache) {
            return;
        }
        if (wsMsg.data.indexOf('<open') >= 0) { // yazz
            let index = wsMsg.data.indexOf("clientTimestamp=");
            if (index > 0) {
                index = index + "clientTimestamp=".length + 1;
                let end = wsMsg.data.indexOf("'", index);
                let timestamp = wsMsg.data.substring(index, end);
                index = wsMsg.data.indexOf("serverTimestamp=", index);
                index = index + "serverTimestamp=".length + 1;
                end = wsMsg.data.indexOf("'", index);
                let serverTimestamp = wsMsg.data.substring(index, end);
                self.emit('session:prebind', { serverTimestamp, timestamp });
                setTimeout(function () { self.emit('session:started', self.config.jid) }, 20);
            }
            else if (wsMsg.data.indexOf("step='first'") > 0) {
                self.emit('raw:incoming', Buffer.from(feature1, 'utf-8').toString());
            }
            else {
                self.emit('raw:incoming', Buffer.from(feature2, 'utf-8').toString());
            }
        }
    };
};

WSConnection.prototype.startHeader = function (id) {
    return new this.stanzas.Open({
        version: this.config.version || '1.0',
        lang: this.config.lang || 'en',
        to: this.config.server,
        timestamp: new Date().getTime(),
        id: id// yazz
    });
};

WSConnection.prototype.closeHeader = function () {
    return new this.stanzas.Close();
};

WSConnection.prototype.disconnect = function () {
    // console.log('disconnect.web', this.conn, this.closing, new Error().stack);
    if (this.conn && !this.closing && this.hasStream) {
        this.closing = true;
        this.send(this.closeHeader());
    } else {
        this.hasStream = false;
        this.stream = undefined;
        if (this.conn && this.conn.readyState === WS_OPEN) {
            // console.log('ws.12', this.conn.readyState, this.conn);
            this.conn.close();
        }
        // this.conn = undefined;
    }
};

WSConnection.prototype.restart = function () {
    var self = this;
    self.hasStream = false;
    self.send(this.startHeader());
};

WSConnection.prototype.send = function (data) {
    this.sendQueue.push(data);
};


module.exports = WSConnection;
