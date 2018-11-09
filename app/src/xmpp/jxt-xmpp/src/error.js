import { Namespace as NS } from 'xmpp-constants';


const CONDITIONS = [
    'bad-request',
    'conflict',
    'feature-not-implemented',
    'forbidden',
    'gone',
    'internal-server-error',
    'item-not-found',
    'jid-malformed',
    'not-acceptable',
    'not-allowed',
    'not-authorized',
    'payment-required',
    'recipient-unavailable',
    'redirect',
    'registration-required',
    'remote-server-not-found',
    'remote-server-timeout',
    'resource-constraint',
    'service-unavailable',
    'subscription-required',
    'undefined-condition',
    'unexpected-request'
];


export default function (JXT) {

    let Utils = JXT.utils;

    let StanzaError = JXT.define({
        name: 'error',
        namespace: NS.CLIENT,
        element: 'error',
        fields: {
            lang: {
                get: function () {

                    return (this.parent || {}).lang || '';
                }
            },
            condition: Utils.enumSub(NS.STANZA_ERROR, CONDITIONS),
            gone: {
                get: function () {

                    return Utils.getSubText(this.xml, NS.STANZA_ERROR, 'gone');
                },
                set: function (value) {

                    this.condition = 'gone';
                    Utils.setSubText(this.xml, NS.STANZA_ERROR, 'gone', value);
                }
            },
            redirect: {
                get: function () {

                    return Utils.getSubText(this.xml, NS.STANZA_ERROR, 'redirect');
                },
                set: function (value) {

                    this.condition = 'redirect';
                    Utils.setSubText(this.xml, NS.STANZA_ERROR, 'redirect', value);
                }
            },
            code: Utils.attribute('code'),
            type: Utils.attribute('type'),
            by: Utils.jidAttribute('by'),
            $text: {
                get: function () {

                    return Utils.getSubLangText(this.xml, NS.STANZA_ERROR, 'text', this.lang);
                }
            },
            text: {
                get: function () {

                    let text = this.$text;
                    return text[this.lang] || '';
                },
                set: function (value) {

                    Utils.setSubLangText(this.xml, NS.STANZA_ERROR, 'text', value, this.lang);
                }
            }
        }
    });


    JXT.extendMessage(StanzaError);
    JXT.extendPresence(StanzaError);
    JXT.extendIQ(StanzaError);
}
