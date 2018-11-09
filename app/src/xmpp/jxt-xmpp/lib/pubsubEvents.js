'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Event = JXT.define({
        name: 'event',
        namespace: _xmppConstants.Namespace.PUBSUB_EVENT,
        element: 'event'
    });

    var EventPurge = JXT.define({
        name: 'purged',
        namespace: _xmppConstants.Namespace.PUBSUB_EVENT,
        element: 'purge',
        fields: {
            node: Utils.attribute('node')
        }
    });

    var EventDelete = JXT.define({
        name: 'deleted',
        namespace: _xmppConstants.Namespace.PUBSUB_EVENT,
        element: 'delete',
        fields: {
            node: Utils.attribute('node'),
            redirect: Utils.subAttribute(_xmppConstants.Namespace.PUBSUB_EVENT, 'redirect', 'uri')
        }
    });

    var EventSubscription = JXT.define({
        name: 'subscriptionChanged',
        namespace: _xmppConstants.Namespace.PUBSUB_EVENT,
        element: 'subscription',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid'),
            type: Utils.attribute('subscription'),
            subid: Utils.attribute('subid'),
            expiry: {
                get: function get() {

                    var text = Utils.getAttribute(this.xml, 'expiry');
                    if (text === 'presence') {
                        return text;
                    } else if (text) {
                        return new Date(text);
                    }
                },
                set: function set(value) {

                    if (!value) {
                        return;
                    }

                    if (typeof value !== 'string') {
                        value = value.toISOString();
                    }

                    Utils.setAttribute(this.xml, 'expiry', value);
                }
            }
        }
    });

    var EventConfiguration = JXT.define({
        name: 'configurationChanged',
        namespace: _xmppConstants.Namespace.PUBSUB_EVENT,
        element: 'configuration',
        fields: {
            node: Utils.attribute('node')
        }
    });

    var EventItems = JXT.define({
        name: 'updated',
        namespace: _xmppConstants.Namespace.PUBSUB_EVENT,
        element: 'items',
        fields: {
            node: Utils.attribute('node'),
            retracted: {
                get: function get() {

                    var results = [];
                    var retracted = Utils.find(this.xml, _xmppConstants.Namespace.PUBSUB_EVENT, 'retract');

                    retracted.forEach(function (xml) {

                        results.push(xml.getAttribute('id'));
                    });
                    return results;
                },
                set: function set(value) {

                    var self = this;
                    value.forEach(function (id) {

                        var retracted = Utils.createElement(_xmppConstants.Namespace.PUBSUB_EVENT, 'retract', _xmppConstants.Namespace.PUBSUB_EVENT);
                        retracted.setAttribute('id', id);
                        this.xml.appendChild(retracted);
                    });
                }
            }
        }
    });

    var EventItem = JXT.define({
        name: '_eventItem',
        namespace: _xmppConstants.Namespace.PUBSUB_EVENT,
        element: 'item',
        fields: {
            id: Utils.attribute('id'),
            node: Utils.attribute('node'),
            publisher: Utils.jidAttribute('publisher')
        }
    });

    JXT.extend(EventItems, EventItem, 'published');

    JXT.extend(Event, EventItems);
    JXT.extend(Event, EventSubscription);
    JXT.extend(Event, EventConfiguration);
    JXT.extend(Event, EventDelete);
    JXT.extend(Event, EventPurge);

    JXT.extendMessage(Event);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(EventConfiguration, DataForm);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=pubsubEvents.js.map