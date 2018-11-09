import { Namespace as NS } from 'xmpp-constants';

const CONDITIONS = [
    'out-of-order',
    'tie-break',
    'unknown-session',
    'unsupported-info'
];
const REASONS = [
    'alternative-session',
    'busy',
    'cancel',
    'connectivity-error',
    'decline',
    'expired',
    'failed-application',
    'failed-transport',
    'general-error',
    'gone',
    'incompatible-parameters',
    'media-error',
    'security-error',
    'success',
    'timeout',
    'unsupported-applications',
    'unsupported-transports'
];


export default function (JXT) {

    let Utils = JXT.utils;

    let Jingle = JXT.define({
        name: 'jingle',
        namespace: NS.JINGLE_1,
        element: 'jingle',
        fields: {
            action: Utils.attribute('action'),
            initiator: Utils.attribute('initiator'),
            responder: Utils.attribute('responder'),
            sid: Utils.attribute('sid'),
            info: {
                get: function () {

                    let opts = JXT.tagged('jingle-info').map(function (Info) {

                        return Info.prototype._name;
                    });
                    for (let i = 0, len = opts.length; i < len; i++) {
                        if (this._extensions[opts[i]]) {
                            return this._extensions[opts[i]];
                        }
                    }
                    if (Utils.getAttribute(this.xml, 'action') === 'session-info') {
                        if (this.xml.children.length === 0) {
                            return {
                                infoType: 'ping'
                            };
                        }
                        return {
                            infoType: 'unknown'
                        };
                    }
                },
                set: function (value) {

                    if (value.infoType === 'ping') {
                        return;
                    }

                    let ext = '_' + value.infoType;
                    this[ext] = value;
                }
            }
        }
    });

    let Content = JXT.define({
        name: '_jingleContent',
        namespace: NS.JINGLE_1,
        element: 'content',
        fields: {
            creator: Utils.attribute('creator'),
            disposition: Utils.attribute('disposition', 'session'),
            name: Utils.attribute('name'),
            senders: Utils.attribute('senders', 'both'),
            application: {
                get: function () {

                    let opts = JXT.tagged('jingle-application').map(function (Description) {

                        return Description.prototype._name;
                    });
                    for (let i = 0, len = opts.length; i < len; i++) {
                        if (this._extensions[opts[i]]) {
                            return this._extensions[opts[i]];
                        }
                    }
                },
                set: function (value) {

                    let ext = '_' + value.applicationType;
                    this[ext] = value;
                }
            },
            transport: {
                get: function () {

                    let opts = JXT.tagged('jingle-transport').map(function (Transport) {

                        return Transport.prototype._name;
                    });
                    for (let i = 0, len = opts.length; i < len; i++) {
                        if (this._extensions[opts[i]]) {
                            return this._extensions[opts[i]];
                        }
                    }
                },
                set: function (value) {

                    let ext = '_' + value.transportType;
                    this[ext] = value;
                }
            },
            security: {
                get: function () {

                    let opts = JXT.tagged('jingle-security').map(function (Info) {

                        return Security.prototype._name;
                    });
                    for (let i = 0, len = opts.length; i < len; i++) {
                        if (this._extensions[opts[i]]) {
                            return this._extensions[opts[i]];
                        }
                    }
                },
                set: function (value) {

                    let ext = '_' + value.securityType;
                    this[ext] = value;
                }
            }
        }
    });

    let Reason = JXT.define({
        name: 'reason',
        namespace: NS.JINGLE_1,
        element: 'reason',
        fields: {
            condition: Utils.enumSub(NS.JINGLE_1, REASONS),
            alternativeSession: {
                get: function () {

                    return Utils.getSubText(this.xml, NS.JINGLE_1, 'alternative-session');
                },
                set: function (value) {

                    this.condition = 'alternative-session';
                    Utils.setSubText(this.xml, NS.JINGLE_1, 'alternative-session', value);
                }
            },
            text: Utils.textSub(NS.JINGLE_1, 'text')
        }
    });


    JXT.extend(Jingle, Content, 'contents');
    JXT.extend(Jingle, Reason);

    JXT.extendIQ(Jingle);

    JXT.withStanzaError(function (StanzaError) {

        JXT.add(StanzaError, 'jingleCondition', Utils.enumSub(NS.JINGLE_ERRORS_1, CONDITIONS));
    });
}
