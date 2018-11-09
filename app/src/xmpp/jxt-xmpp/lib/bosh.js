'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    JXT.define({
        name: 'bosh',
        namespace: _xmppConstants.Namespace.BOSH,
        element: 'body',
        prefixes: {
            xmpp: _xmppConstants.Namespace.BOSH_XMPP
        },
        fields: {
            accept: Utils.attribute('accept'),
            ack: Utils.numberAttribute('ack'),
            authid: Utils.attribute('authid'),
            charsets: Utils.attribute('charsets'),
            condition: Utils.attribute('condition'),
            content: Utils.attribute('content'),
            from: Utils.jidAttribute('from', true),
            hold: Utils.numberAttribute('hold'),
            inactivity: Utils.numberAttribute('inactivity'),
            key: Utils.attribute('key'),
            maxpause: Utils.numberAttribute('maxpause'),
            newKey: Utils.attribute('newkey'),
            pause: Utils.numberAttribute('pause'),
            polling: Utils.numberAttribute('polling'),
            resport: Utils.numberAttribute('report'),
            requests: Utils.numberAttribute('requests'),
            rid: Utils.numberAttribute('rid'),
            sid: Utils.attribute('sid'),
            stream: Utils.attribute('stream'),
            time: Utils.attribute('time'),
            to: Utils.jidAttribute('to', true),
            type: Utils.attribute('type'),
            ver: Utils.attribute('ver'),
            wait: Utils.numberAttribute('wait'),
            uri: Utils.textSub(_xmppConstants.Namespace.BOSH, 'uri'),
            lang: Utils.langAttribute(),
            // These three should be using namespaced attributes, but browsers are stupid
            // when it comes to serializing attributes with namespaces
            version: Utils.attribute('xmpp:version', '1.0'),
            restart: Utils.attribute('xmpp:restart'),
            restartLogic: Utils.boolAttribute('xmpp:restartLogic'),
            payload: {
                get: function get() {

                    var results = [];
                    for (var i = 0, len = this.xml.childNodes.length; i < len; i++) {
                        var obj = JXT.build(this.xml.childNodes[i]);
                        if (obj !== undefined) {
                            results.push(obj);
                        }
                    }
                    return results;
                },
                set: function set(values) {
                    var _this = this;

                    values.forEach(function (types) {

                        _this.xml.appendChild(types.xml);
                    });
                }
            }
        }
    });
};

module.exports = exports['default'];
//# sourceMappingURL=bosh.js.map