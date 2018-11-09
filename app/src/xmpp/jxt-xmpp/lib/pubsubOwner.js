'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var PubsubOwner = JXT.define({
        name: 'pubsubOwner',
        namespace: _xmppConstants.Namespace.PUBSUB_OWNER,
        element: 'pubsub',
        fields: {
            purge: Utils.subAttribute(_xmppConstants.Namespace.PUBSUB_OWNER, 'purge', 'node'),
            del: Utils.subAttribute(_xmppConstants.Namespace.PUBSUB_OWNER, 'delete', 'node'),
            redirect: {
                get: function get() {

                    var del = Utils.find(this.xml, _xmppConstants.Namespace.PUBSUB_OWNER, 'delete');
                    if (del.length) {
                        return Utils.getSubAttribute(del[0], _xmppConstants.Namespace.PUBSUB_OWNER, 'redirect', 'uri');
                    }
                    return '';
                },
                set: function set(value) {

                    var del = Utils.findOrCreate(this.xml, _xmppConstants.Namespace.PUBSUB_OWNER, 'delete');
                    Utils.setSubAttribute(del, _xmppConstants.Namespace.PUBSUB_OWNER, 'redirect', 'uri', value);
                }
            }
        }
    });

    var Subscription = JXT.define({
        name: 'subscription',
        namespace: _xmppConstants.Namespace.PUBSUB_OWNER,
        element: 'subscription',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid'),
            subid: Utils.attribute('subid'),
            type: Utils.attribute('subscription'),
            configurable: Utils.boolSub('subscribe-options'),
            configurationRequired: {
                get: function get() {

                    var options = Utils.find(this.xml, _xmppConstants.Namespace.PUBSUB_OWNER, 'subscribe-options');
                    if (options.length) {
                        return Utils.getBoolSub(options[0], _xmppConstants.Namespace.PUBSUB_OWNER, 'required');
                    }
                    return false;
                }
            }
        }
    });

    var Subscriptions = JXT.define({
        name: 'subscriptions',
        namespace: _xmppConstants.Namespace.PUBSUB_OWNER,
        element: 'subscriptions',
        fields: {
            node: Utils.attribute('node')
        }
    });

    var Affiliation = JXT.define({
        name: 'affiliation',
        namespace: _xmppConstants.Namespace.PUBSUB_OWNER,
        element: 'affiliation',
        fields: {
            jid: Utils.jidAttribute('jid'),
            type: Utils.attribute('affiliation')
        }
    });

    var Affiliations = JXT.define({
        name: 'affiliations',
        namespace: _xmppConstants.Namespace.PUBSUB_OWNER,
        element: 'affiliations',
        fields: {
            node: Utils.attribute('node')
        }
    });

    var Configure = JXT.define({
        name: 'config',
        namespace: _xmppConstants.Namespace.PUBSUB_OWNER,
        element: 'configure',
        fields: {
            node: Utils.attribute('node')
        }
    });

    var Default = JXT.define({
        name: 'default',
        namespace: _xmppConstants.Namespace.PUBSUB_OWNER,
        element: 'default'
    });

    JXT.extend(PubsubOwner, Configure);
    JXT.extend(PubsubOwner, Subscriptions);
    JXT.extend(PubsubOwner, Affiliations);
    JXT.extend(PubsubOwner, Default);

    JXT.extend(Subscriptions, Subscription, 'list');
    JXT.extend(Affiliations, Affiliation, 'list');

    JXT.extendIQ(PubsubOwner);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(Configure, DataForm);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=pubsubOwner.js.map