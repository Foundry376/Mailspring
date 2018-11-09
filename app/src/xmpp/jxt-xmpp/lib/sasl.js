'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var CONDITIONS = ['aborted', 'account-disabled', 'credentials-expired', 'encryption-required', 'incorrect-encoding', 'invalid-authzid', 'invalid-mechanism', 'malformed-request', 'mechanism-too-weak', 'not-authorized', 'temporary-auth-failure', 'not-supported'];

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Mechanisms = JXT.define({
        name: 'sasl',
        namespace: _xmppConstants.Namespace.SASL,
        element: 'mechanisms',
        fields: {
            mechanisms: Utils.multiTextSub(_xmppConstants.Namespace.SASL, 'mechanism')
        }
    });

    JXT.define({
        name: 'saslAuth',
        eventName: 'sasl:auth',
        namespace: _xmppConstants.Namespace.SASL,
        element: 'auth',
        topLevel: true,
        fields: {
            value: Utils.text(),
            mechanism: Utils.attribute('mechanism')
        }
    });

    JXT.define({
        name: 'saslChallenge',
        eventName: 'sasl:challenge',
        namespace: _xmppConstants.Namespace.SASL,
        element: 'challenge',
        topLevel: true,
        fields: {
            value: Utils.text()
        }
    });

    JXT.define({
        name: 'saslResponse',
        eventName: 'sasl:response',
        namespace: _xmppConstants.Namespace.SASL,
        element: 'response',
        topLevel: true,
        fields: {
            value: Utils.text()
        }
    });

    JXT.define({
        name: 'saslAbort',
        eventName: 'sasl:abort',
        namespace: _xmppConstants.Namespace.SASL,
        element: 'abort',
        topLevel: true
    });

    JXT.define({
        name: 'saslSuccess',
        eventName: 'sasl:success',
        namespace: _xmppConstants.Namespace.SASL,
        element: 'success',
        topLevel: true,
        fields: {
            value: Utils.text()
        }
    });

    JXT.define({
        name: 'saslFailure',
        eventName: 'sasl:failure',
        namespace: _xmppConstants.Namespace.SASL,
        element: 'failure',
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
            condition: Utils.enumSub(_xmppConstants.Namespace.SASL, CONDITIONS),
            $text: {
                get: function get() {

                    return Utils.getSubLangText(this.xml, _xmppConstants.Namespace.SASL, 'text', this.lang);
                }
            },
            text: {
                get: function get() {

                    var text = this.$text;
                    return text[this.lang] || '';
                },
                set: function set(value) {

                    Utils.setSubLangText(this.xml, _xmppConstants.Namespace.SASL, 'text', value, this.lang);
                }
            }
        }
    });

    JXT.extendStreamFeatures(Mechanisms);
};

module.exports = exports['default'];
//# sourceMappingURL=sasl.js.map