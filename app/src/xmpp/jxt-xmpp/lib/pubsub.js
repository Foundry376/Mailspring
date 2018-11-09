'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Pubsub = JXT.define({
        name: 'pubsub',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'pubsub',
        fields: {
            create: {
                get: function get() {

                    var node = Utils.getSubAttribute(this.xml, _xmppConstants.Namespace.PUBSUB, 'create', 'node');
                    if (node) {
                        return node;
                    }
                    return Utils.getBoolSub(this.xml, _xmppConstants.Namespace.PUBSUB, 'create');
                },
                set: function set(value) {

                    if (value === true || !value) {
                        Utils.setBoolSub(this.xml, _xmppConstants.Namespace.PUBSUB, 'create', value);
                    } else {
                        Utils.setSubAttribute(this.xml, _xmppConstants.Namespace.PUBSUB, 'create', 'node', value);
                    }
                }
            },
            publishOptions: {
                get: function get() {

                    var DataForm = JXT.getDefinition('x', _xmppConstants.Namespace.DATAFORM);
                    var conf = Utils.find(this.xml, _xmppConstants.Namespace.PUBSUB, 'publish-options');
                    if (conf.length && conf[0].childNodes.length) {
                        return new DataForm({}, conf[0].childNodes[0]);
                    }
                },
                set: function set(value) {

                    var DataForm = JXT.getDefinition('x', _xmppConstants.Namespace.DATAFORM);
                    var conf = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.PUBSUB, 'publish-options');
                    if (value) {
                        var form = new DataForm(value);
                        conf.appendChild(form.xml);
                    }
                }
            }
        }
    });

    var Configure = JXT.define({
        name: 'config',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'configure'
    });

    var Subscribe = JXT.define({
        name: 'subscribe',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'subscribe',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid')
        }
    });

    var Subscription = JXT.define({
        name: 'subscription',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'subscription',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid'),
            subid: Utils.attribute('subid'),
            type: Utils.attribute('subscription'),
            configurable: Utils.boolSub('subscribe-options'),
            configurationRequired: {
                get: function get() {

                    var options = Utils.find(this.xml, _xmppConstants.Namespace.PUBSUB, 'subscribe-options');
                    if (options.length) {
                        return Utils.getBoolSub(options[0], _xmppConstants.Namespace.PUBSUB, 'required');
                    }
                    return false;
                }
            }
        }
    });

    var Subscriptions = JXT.define({
        name: 'subscriptions',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'subscriptions',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid')
        }
    });

    var Affiliation = JXT.define({
        name: 'affiliation',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'affiliation',
        fields: {
            node: Utils.attribute('node'),
            type: Utils.attribute('affiliation')
        }
    });

    var Affiliations = JXT.define({
        name: 'affiliations',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'affiliations',
        fields: {
            node: Utils.attribute('node')
        }
    });

    var SubscriptionOptions = JXT.define({
        name: 'subscriptionOptions',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'options',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid'),
            subid: Utils.attribute('subid')
        }
    });

    var Unsubscribe = JXT.define({
        name: 'unsubscribe',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'unsubscribe',
        fields: {
            node: Utils.attribute('node'),
            subid: Utils.attribute('subid'),
            jid: Utils.jidAttribute('jid')
        }
    });

    var Publish = JXT.define({
        name: 'publish',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'publish',
        fields: {
            node: Utils.attribute('node')
        }
    });

    var Retract = JXT.define({
        name: 'retract',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'retract',
        fields: {
            node: Utils.attribute('node'),
            notify: Utils.boolAttribute('notify'),
            id: Utils.subAttribute(_xmppConstants.Namespace.PUBSUB, 'item', 'id')
        }
    });

    var Retrieve = JXT.define({
        name: 'retrieve',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'items',
        fields: {
            node: Utils.attribute('node'),
            max: Utils.attribute('max_items')
        }
    });

    var Item = JXT.define({
        name: 'item',
        namespace: _xmppConstants.Namespace.PUBSUB,
        element: 'item',
        fields: {
            id: Utils.attribute('id'),
            publisher: Utils.jidAttribute('publisher')
        }
    });

    JXT.extend(Pubsub, Configure);
    JXT.extend(Pubsub, Subscribe);
    JXT.extend(Pubsub, Unsubscribe);
    JXT.extend(Pubsub, Publish);
    JXT.extend(Pubsub, Retract);
    JXT.extend(Pubsub, Retrieve);
    JXT.extend(Pubsub, Subscription);
    JXT.extend(Pubsub, SubscriptionOptions);
    JXT.extend(Pubsub, Subscriptions);
    JXT.extend(Pubsub, Affiliations);

    JXT.extend(Publish, Item, 'items');
    JXT.extend(Retrieve, Item, 'items');

    JXT.extend(Subscriptions, Subscription, 'list');
    JXT.extend(Affiliations, Affiliation, 'list');

    JXT.extendIQ(Pubsub);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(SubscriptionOptions, DataForm);
        JXT.extend(Item, DataForm);
        JXT.extend(Configure, DataForm);
    });

    JXT.withDefinition('set', _xmppConstants.Namespace.RSM, function (RSM) {

        JXT.extend(Pubsub, RSM);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=pubsub.js.map