'use strict';

var util = require('util');
var WildEmitter = require('wildemitter');
var async = require('async');

var WS = (require('faye-websocket') && require('faye-websocket').Client) ?
    require('faye-websocket').Client :
    window.WebSocket;

var WS_OPEN = 1;

let feature1='<stream:features xmlns:stream="http://etherx.jabber.org/streams"><auth xmlns="http://jabber.org/features/iq-auth"/><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms><register xmlns="http://jabber.org/features/iq-register"/><ver xmlns="urn:xmpp:features:rosterver"/><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/><compression xmlns="http://jabber.org/features/compress"><method>zlib</method></compression></stream:features>';
let feature2='<stream:features xmlns:stream="http://etherx.jabber.org/streams"><register xmlns="http://jabber.org/features/iq-register"/><ver xmlns="urn:xmpp:features:rosterver"/><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/><compression xmlns="http://jabber.org/features/compress"><method>zlib</method></compression><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/><session xmlns="urn:ietf:params:xml:ns:xmpp-session"/></stream:features>';

function WSConnection(sm, stanzas) {
    var self = this;

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

            data = new Buffer(data, 'utf8').toString();

            self.emit('raw:outgoing', data);
            //debugger;
            if (self.conn.readyState === WS_OPEN) {
                console.log('websocket:raw:outgoing',data);
                self.conn.send(data);
            }
        }
        cb();
    }, 1);

    self.on('connected', function () {
        if(!self.isCache){
            self.send(self.startHeader(''));// yazz
        }
        else{
            self.send(self.startHeader(self.config.sessionId));// yazz
        }
    });

    self.on('raw:incoming', function (data) {
        var stanzaObj, err;
        console.log('websocket:raw:incoming',data);
        //debugger;
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
            // let xml=stanzas.parseXml(data);
            // if(xml&&xml.name=='iq'){
            //     if(xml.children.length>0&&xml.children[0].name=='edi-e2ee'){
            //         self.emit('iq:ext-e2ee', xml);
            //         return;
            //     }
            //     //self.emit('iq:ext', xml);
            // }
            return;
        }

        if (stanzaObj._name === 'openStream') {
            self.hasStream = true;// yazz
            self.stream = stanzaObj;
            //sessionId = stanzaObj.id;
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

WSConnection.prototype.connect = function (opts) {
    var self = this;
    self.config = opts;

    self.hasStream = false;
    self.closing = false;
    self.isCache=opts.wsURL.substring(opts.wsURL.indexOf(":",10)+1)=='5291';
    self.conn = new WS(opts.wsURL, 'xmpp', opts.wsOptions);
    self.conn.onerror = function (e) {
        e.preventDefault();
        self.emit('disconnected', self);
    };

    self.conn.onclose = function () {
        self.emit('disconnected', self);
    };

    self.conn.onopen = function () {
        self.sm.started = false;
        self.emit('connected', self);
    };

    self.conn.onmessage = function (wsMsg) {
        self.emit('raw:incoming', new Buffer(wsMsg.data, 'utf8').toString());
        if(!self.isCache){
            return;
        }
        if(wsMsg.data.indexOf('<open')>=0){ // yazz
            if(wsMsg.data.indexOf("serverTimestamp")>0){
                setTimeout(function(){self.emit('session:started')},20);
            }
            else if(wsMsg.data.indexOf("step='first'")>0){
                self.emit('raw:incoming', new Buffer(feature1, 'utf-8').toString());
            }
            else{
                self.emit('raw:incoming', new Buffer(feature2, 'utf-8').toString());
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
    if (this.conn && !this.closing && this.hasStream) {
        this.closing = true;
        this.send(this.closeHeader());
    } else {
        this.hasStream = false;
        this.stream = undefined;
        if (this.conn && this.conn.readyState === WS_OPEN) {
            this.conn.close();
        }
        this.conn = undefined;
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
