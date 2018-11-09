'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var CONDITIONS = ['closed-node', 'configuration-required', 'invalid-jid', 'invalid-options', 'invalid-payload', 'invalid-subid', 'item-forbidden', 'item-required', 'jid-required', 'max-items-exceeded', 'max-nodes-exceeded', 'nodeid-required', 'not-in-roster-group', 'not-subscribed', 'payload-too-big', 'payload-required', 'pending-subscription', 'presence-subscription-required', 'subid-required', 'too-many-subscriptions', 'unsupported', 'unsupported-access-model'];

exports['default'] = function (JXT) {

    JXT.withStanzaError(function (StanzaError) {

        JXT.add(StanzaError, 'pubsubCondition', JXT.utils.enumSub(_xmppConstants.Namespace.PUBSUB_ERRORS, CONDITIONS));
        JXT.add(StanzaError, 'pubsubUnsupportedFeature', {
            get: function get() {

                return JXT.utils.getSubAttribute(this.xml, _xmppConstants.Namespace.PUBSUB_ERRORS, 'unsupported', 'feature');
            },
            set: function set(value) {

                if (value) {
                    this.pubsubCondition = 'unsupported';
                }
                JXT.utils.setSubAttribute(this.xml, _xmppConstants.Namespace.PUBSUB_ERRORS, 'unsupported', 'feature', value);
            }
        });
    });
};

module.exports = exports['default'];
//# sourceMappingURL=pubsubError.js.map