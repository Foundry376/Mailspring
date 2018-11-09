import { Namespace as NS } from 'xmpp-constants';


const CONDITIONS = [
    'bad-format',
    'bad-namespace-prefix',
    'conflict',
    'connection-timeout',
    'host-gone',
    'host-unknown',
    'improper-addressing',
    'internal-server-error',
    'invalid-from',
    'invalid-namespace',
    'invalid-xml',
    'not-authorized',
    'not-well-formed',
    'policy-violation',
    'remote-connection-failed',
    'reset',
    'resource-constraint',
    'restricted-xml',
    'see-other-host',
    'system-shutdown',
    'undefined-condition',
    'unsupported-encoding',
    'unsupported-feature',
    'unsupported-stanza-type',
    'unsupported-version'
];


export default function (JXT) {

    let Utils = JXT.utils;

    JXT.define({
        name: 'streamError',
        namespace: NS.STREAM,
        element: 'error',
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
            condition: Utils.enumSub(NS.STREAM_ERROR, CONDITIONS),
            seeOtherHost: {
                get: function () {

                    return Utils.getSubText(this.xml, NS.STREAM_ERROR, 'see-other-host');
                },
                set: function (value) {

                    this.condition = 'see-other-host';
                    Utils.setSubText(this.xml, NS.STREAM_ERROR, 'see-other-host', value);
                }
            },
            $text: {
                get: function () {

                    return Utils.getSubLangText(this.xml, NS.STREAM_ERROR, 'text', this.lang);
                }
            },
            text: {
                get: function () {

                    let text = this.$text;
                    return text[this.lang] || '';
                },
                set: function (value) {

                    Utils.setSubLangText(this.xml, NS.STREAM_ERROR, 'text', value, this.lang);
                }
            }
        }
    });
}
