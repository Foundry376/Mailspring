import { Namespace as NS } from 'xmpp-constants';


const CONDITIONS = [
    'aborted',
    'account-disabled',
    'credentials-expired',
    'encryption-required',
    'incorrect-encoding',
    'invalid-authzid',
    'invalid-mechanism',
    'malformed-request',
    'mechanism-too-weak',
    'not-authorized',
    'temporary-auth-failure',
    'not-supported'
];


export default function (JXT) {

    let Utils = JXT.utils;

    let Mechanisms = JXT.define({
        name: 'sasl',
        namespace: NS.SASL,
        element: 'mechanisms',
        fields: {
            mechanisms: Utils.multiTextSub(NS.SASL, 'mechanism')
        }
    });

    JXT.define({
        name: 'saslAuth',
        eventName: 'sasl:auth',
        namespace: NS.SASL,
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
        namespace: NS.SASL,
        element: 'challenge',
        topLevel: true,
        fields: {
            value: Utils.text()
        }
    });

    JXT.define({
        name: 'saslResponse',
        eventName: 'sasl:response',
        namespace: NS.SASL,
        element: 'response',
        topLevel: true,
        fields: {
            value: Utils.text()
        }
    });

    JXT.define({
        name: 'saslAbort',
        eventName: 'sasl:abort',
        namespace: NS.SASL,
        element: 'abort',
        topLevel: true
    });

    JXT.define({
        name: 'saslSuccess',
        eventName: 'sasl:success',
        namespace: NS.SASL,
        element: 'success',
        topLevel: true,
        fields: {
            value: Utils.text()
        }
    });

    JXT.define({
        name: 'saslFailure',
        eventName: 'sasl:failure',
        namespace: NS.SASL,
        element: 'failure',
        topLevel: true,
        fields: {
            lang: {
                get: function () {

                    return this._lang || '';
                },
                set: function (value) {

                    this._lang = value;
                }
            },
            condition: Utils.enumSub(NS.SASL, CONDITIONS),
            $text: {
                get: function () {

                    return Utils.getSubLangText(this.xml, NS.SASL, 'text', this.lang);
                }
            },
            text: {
                get: function () {

                    let text = this.$text;
                    return text[this.lang] || '';
                },
                set: function (value) {

                    Utils.setSubLangText(this.xml, NS.SASL, 'text', value, this.lang);
                }
            }
        }
    });


    JXT.extendStreamFeatures(Mechanisms);
}
