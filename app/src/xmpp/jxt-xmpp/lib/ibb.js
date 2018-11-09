'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var NS_IBB = 'http://jabber.org/protocol/ibb';
var NS_JIBB = 'urn:xmpp:jingle:transports:ibb:1';

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var IBB = {
        get: function get() {

            var data = Utils.find(this.xml, NS_IBB, 'data');
            if (data.length) {
                data = data[0];
                return {
                    action: 'data',
                    sid: Utils.getAttribute(data, 'sid'),
                    seq: parseInt(Utils.getAttribute(data, 'seq') || '0', 10),
                    data: new Buffer(Utils.getText(data), 'base64')
                };
            }

            var open = Utils.find(this.xml, NS_IBB, 'open');
            if (open.length) {
                open = open[0];
                var ack = Utils.getAttribute(open, 'stanza');
                if (ack === 'message') {
                    ack = false;
                } else {
                    ack = true;
                }

                return {
                    action: 'open',
                    sid: Utils.getAttribute(open, 'sid'),
                    blockSize: Utils.getAttribute(open, 'block-size'),
                    ack: ack
                };
            }

            var close = Utils.find(this.xml, NS_IBB, 'close');
            if (close.length) {
                return {
                    action: 'close',
                    sid: Utils.getAttribute(close[0], 'sid')
                };
            }
        },
        set: function set(value) {

            if (value.action === 'data') {
                var data = Utils.createElement(NS_IBB, 'data');
                Utils.setAttribute(data, 'sid', value.sid);
                Utils.setAttribute(data, 'seq', value.seq.toString());
                Utils.setText(data, value.data.toString('base64'));
                this.xml.appendChild(data);
            }

            if (value.action === 'open') {
                var _open = Utils.createElement(NS_IBB, 'open');
                Utils.setAttribute(_open, 'sid', value.sid);
                Utils.setAttribute(_open, 'block-size', (value.blockSize || '4096').toString());
                if (value.ack === false) {
                    Utils.setAttribute(_open, 'stanza', 'message');
                } else {
                    Utils.setAttribute(_open, 'stanza', 'iq');
                }
                this.xml.appendChild(_open);
            }

            if (value.action === 'close') {
                var _close = Utils.createElement(NS_IBB, 'close');
                Utils.setAttribute(_close, 'sid', value.sid);
                this.xml.appendChild(_close);
            }
        }
    };

    var JingleIBB = JXT.define({
        name: '_' + NS_JIBB,
        namespace: NS_JIBB,
        element: 'transport',
        tags: ['jingle-transport'],
        fields: {
            transportType: {
                value: NS_JIBB,
                writable: true
            },
            sid: Utils.attribute('sid'),
            blockSize: Utils.numberAttribute('block-size'),
            ack: {
                get: function get() {

                    var value = Utils.getAttribute(this.xml, 'stanza');
                    if (value === 'message') {
                        return false;
                    }
                    return true;
                },
                set: function set(value) {

                    if (value.ack === false) {
                        Utils.setAttribute(this.xml, 'stanza', 'message');
                    } else {
                        Utils.setAttribute(this.xml, 'stanza', 'iq');
                    }
                }
            }
        }
    });

    JXT.withDefinition('content', _xmppConstants.Namespace.JINGLE_1, function (Content) {

        JXT.extend(Content, JingleIBB);
    });

    JXT.withIQ(function (IQ) {

        JXT.add(IQ, 'ibb', IBB);
    });

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'ibb', IBB);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=ibb.js.map