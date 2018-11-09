import { Namespace as NS } from 'xmpp-constants';


let internals = {};


internals.definePresence = function (JXT, name, namespace) {

    let Utils = JXT.utils;

    JXT.define({
        name: name,
        namespace: namespace,
        element: 'presence',
        topLevel: true,
        fields: {
            lang: Utils.langAttribute(),
            id: Utils.attribute('id'),
            to: Utils.jidAttribute('to', true),
            from: Utils.jidAttribute('from', true),
            priority: Utils.numberSub(namespace, 'priority', false, 0),
            show: Utils.textSub(namespace, 'show'),
            type: {
                get: function () {

                    return Utils.getAttribute(this.xml, 'type', 'available');
                },
                set: function (value) {

                    if (value === 'available') {
                        value = false;
                    }
                    Utils.setAttribute(this.xml, 'type', value);
                }
            },
            $status: {
                get: function () {

                    return Utils.getSubLangText(this.xml, namespace, 'status', this.lang);
                }
            },
            status: {
                get: function () {

                    let statuses = this.$status;
                    return statuses[this.lang] || '';
                },
                set: function (value) {

                    Utils.setSubLangText(this.xml, namespace, 'status', value, this.lang);
                }
            },
            idleSince: Utils.dateSubAttribute(NS.IDLE_1, 'idle', 'since'),
            decloak: Utils.subAttribute(NS.DECLOAKING_0, 'decloak', 'reason'),
            avatarId: {
                get: function () {

                    let update = Utils.find(this.xml, NS.VCARD_TEMP_UPDATE, 'x');
                    if (!update.length) {
                        return '';
                    }
                    return Utils.getSubText(update[0], NS.VCARD_TEMP_UPDATE, 'photo');
                },
                set: function (value) {

                    let update = Utils.findOrCreate(this.xml, NS.VCARD_TEMP_UPDATE, 'x');

                    if (value === '') {
                        Utils.setBoolSub(update, NS.VCARD_TEMP_UPDATE, 'photo', true);
                    } else if (value === true) {
                        return;
                    } else if (value) {
                        Utils.setSubText(update, NS.VCARD_TEMP_UPDATE, 'photo', value);
                    } else {
                        this.xml.removeChild(update);
                    }
                }
            }
        }
    });
};


export default function (JXT) {

    internals.definePresence(JXT, 'presence', NS.CLIENT);
    internals.definePresence(JXT, 'serverPresence', NS.SERVER);
    internals.definePresence(JXT, 'componentPresence', NS.COMPONENT);
}
