'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var CONDITIONS = ['bad-format', 'bad-namespace-prefix', 'conflict', 'connection-timeout', 'host-gone', 'host-unknown', 'improper-addressing', 'internal-server-error', 'invalid-from', 'invalid-namespace', 'invalid-xml', 'not-authorized', 'not-well-formed', 'policy-violation', 'remote-connection-failed', 'reset', 'resource-constraint', 'restricted-xml', 'see-other-host', 'system-shutdown', 'undefined-condition', 'unsupported-encoding', 'unsupported-feature', 'unsupported-stanza-type', 'unsupported-version'];

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    JXT.define({
        name: 'streamError',
        namespace: _xmppConstants.Namespace.STREAM,
        element: 'error',
        topLevel: true,
        fields: {
            lang: {
                get: function get() {

                    return this._lang || '';
                },
                set: function set(value) {

                    this._lang = value;
                }
            },
            condition: Utils.enumSub(_xmppConstants.Namespace.STREAM_ERROR, CONDITIONS),
            seeOtherHost: {
                get: function get() {

                    return Utils.getSubText(this.xml, _xmppConstants.Namespace.STREAM_ERROR, 'see-other-host');
                },
                set: function set(value) {

                    this.condition = 'see-other-host';
                    Utils.setSubText(this.xml, _xmppConstants.Namespace.STREAM_ERROR, 'see-other-host', value);
                }
            },
            $text: {
                get: function get() {

                    return Utils.getSubLangText(this.xml, _xmppConstants.Namespace.STREAM_ERROR, 'text', this.lang);
                }
            },
            text: {
                get: function get() {

                    var text = this.$text;
                    return text[this.lang] || '';
                },
                set: function set(value) {

                    Utils.setSubLangText(this.xml, _xmppConstants.Namespace.STREAM_ERROR, 'text', value, this.lang);
                }
            }
        }
    });
};

module.exports = exports['default'];
//# sourceMappingURL=streamError.js.map