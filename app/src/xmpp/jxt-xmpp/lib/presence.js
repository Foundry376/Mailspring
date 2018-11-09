'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var internals = {};

internals.definePresence = function (JXT, name, namespace) {

    var Utils = JXT.utils;

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
                get: function get() {

                    return Utils.getAttribute(this.xml, 'type', 'available');
                },
                set: function set(value) {

                    if (value === 'available') {
                        value = false;
                    }
                    Utils.setAttribute(this.xml, 'type', value);
                }
            },
            $status: {
                get: function get() {

                    return Utils.getSubLangText(this.xml, namespace, 'status', this.lang);
                }
            },
            status: {
                get: function get() {

                    var statuses = this.$status;
                    return statuses[this.lang] || '';
                },
                set: function set(value) {

                    Utils.setSubLangText(this.xml, namespace, 'status', value, this.lang);
                }
            },
            idleSince: Utils.dateSubAttribute(_xmppConstants.Namespace.IDLE_1, 'idle', 'since'),
            decloak: Utils.subAttribute(_xmppConstants.Namespace.DECLOAKING_0, 'decloak', 'reason'),
            avatarId: {
                get: function get() {

                    var update = Utils.find(this.xml, _xmppConstants.Namespace.VCARD_TEMP_UPDATE, 'x');
                    if (!update.length) {
                        return '';
                    }
                    return Utils.getSubText(update[0], _xmppConstants.Namespace.VCARD_TEMP_UPDATE, 'photo');
                },
                set: function set(value) {

                    var update = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.VCARD_TEMP_UPDATE, 'x');

                    if (value === '') {
                        Utils.setBoolSub(update, _xmppConstants.Namespace.VCARD_TEMP_UPDATE, 'photo', true);
                    } else if (value === true) {
                        return;
                    } else if (value) {
                        Utils.setSubText(update, _xmppConstants.Namespace.VCARD_TEMP_UPDATE, 'photo', value);
                    } else {
                        this.xml.removeChild(update);
                    }
                }
            }
        }
    });
};

exports['default'] = function (JXT) {

    internals.definePresence(JXT, 'presence', _xmppConstants.Namespace.CLIENT);
    internals.definePresence(JXT, 'serverPresence', _xmppConstants.Namespace.SERVER);
    internals.definePresence(JXT, 'componentPresence', _xmppConstants.Namespace.COMPONENT);
};

module.exports = exports['default'];
//# sourceMappingURL=presence.js.map