'use strict';

var each = require('lodash.foreach');

var WSConnection = require('./websocket');
var util = require('util');



function OldWSConnection(sm, stanzas) {
    WSConnection.call(this, sm, stanzas);

    var self = this;


    function wrap(data) {
        return [self.streamStart, data, self.streamEnd].join('');
    }


    self.on('connected', function () {
        self.streamStart = '<stream:stream xmlns:stream="http://etherx.jabber.org/streams">';
        self.streamEnd = '</stream:stream>';
    });

    self.off('raw:incoming');
    self.on('raw:incoming', function (data) {
        var streamData, ended, err;

        data = data.trim();
        data = data.replace(/^(\s*<\?.*\?>\s*)*/, '');
        if (data === '') {
            return;
        }

        if (data.match(self.streamEnd)) {
            return self.disconnect();
        } else if (self.hasStream) {
            try {
                streamData = stanzas.parse(wrap(data));
            } catch (e) {
                err = new this.stanzas.StreamError({
                    condition: 'invalid-xml'
                });
                self.emit('stream:error', err, e);
                self.send(err);
                return self.disconnect();
            }
        } else {
            // Inspect start of stream element to get NS prefix name
            var parts = data.trim().split(' ')[0].slice(1).split(':');
            self.streamStart = data;
            self.streamEnd = '</' + parts[0] + (parts[1] ? ':' + parts[1] : '') + '>';

            ended = false;
            try {
                streamData = stanzas.parse(data + self.streamEnd);
            } catch (e) {
                try {
                    streamData = stanzas.parse(data);
                    ended = true;
                } catch (e2) {
                    err = new this.stanzas.StreamError({
                        condition: 'invalid-xml'
                    });
                    self.emit('stream:error', err, e2);
                    self.send(err);
                    return self.disconnect();
                }
            }

            self.hasStream = true;
            self.stream = streamData;
            self.emit('stream:start', streamData);
        }

        each(streamData._extensions, function (stanzaObj) {
            if (!stanzaObj.lang && self.stream) {
                stanzaObj.lang = self.stream.lang;
            }

            self.emit('stream:data', stanzaObj);
        });

        if (ended) {
            self.emit('stream:end');
        }
    });
}

util.inherits(OldWSConnection, WSConnection);


OldWSConnection.prototype.startHeader = function () {
    return [
        '<stream:stream',
        'xmlns:stream="http://etherx.jabber.org/streams"',
        'xmlns="jabber:client"',
        'version="' + (this.config.version || '1.0') + '"',
        'xml:lang="' + (this.config.lang || 'en') + '"',
        'to="' + this.config.server + '">'
    ].join(' ');
};

OldWSConnection.prototype.closeHeader = function () {
    return '</stream:stream>';
};


module.exports = OldWSConnection;
