'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var CONDITIONS = ['bad-request', 'conflict', 'feature-not-implemented', 'forbidden', 'gone', 'internal-server-error', 'item-not-found', 'jid-malformed', 'not-acceptable', 'not-allowed', 'not-authorized', 'payment-required', 'recipient-unavailable', 'redirect', 'registration-required', 'remote-server-not-found', 'remote-server-timeout', 'resource-constraint', 'service-unavailable', 'subscription-required', 'undefined-condition', 'unexpected-request'];

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var StanzaError = JXT.define({
        name: 'error',
        namespace: _xmppConstants.Namespace.CLIENT,
        element: 'error',
        fields: {
            lang: {
                get: function get() {

                    return (this.parent || {}).lang || '';
                }
            },
            condition: Utils.enumSub(_xmppConstants.Namespace.STANZA_ERROR, CONDITIONS),
            gone: {
                get: function get() {

                    return Utils.getSubText(this.xml, _xmppConstants.Namespace.STANZA_ERROR, 'gone');
                },
                set: function set(value) {

                    this.condition = 'gone';
                    Utils.setSubText(this.xml, _xmppConstants.Namespace.STANZA_ERROR, 'gone', value);
                }
            },
            redirect: {
                get: function get() {

                    return Utils.getSubText(this.xml, _xmppConstants.Namespace.STANZA_ERROR, 'redirect');
                },
                set: function set(value) {

                    this.condition = 'redirect';
                    Utils.setSubText(this.xml, _xmppConstants.Namespace.STANZA_ERROR, 'redirect', value);
                }
            },
            code: Utils.attribute('code'),
            type: Utils.attribute('type'),
            by: Utils.jidAttribute('by'),
            $text: {
                get: function get() {

                    return Utils.getSubLangText(this.xml, _xmppConstants.Namespace.STANZA_ERROR, 'text', this.lang);
                }
            },
            text: {
                get: function get() {

                    var text = this.$text;
                    return text[this.lang] || '';
                },
                set: function set(value) {

                    Utils.setSubLangText(this.xml, _xmppConstants.Namespace.STANZA_ERROR, 'text', value, this.lang);
                }
            }
        }
    });

    JXT.extendMessage(StanzaError);
    JXT.extendPresence(StanzaError);
    JXT.extendIQ(StanzaError);
};

module.exports = exports['default'];
//# sourceMappingURL=error.js.map