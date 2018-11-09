import { Namespace as NS } from 'xmpp-constants';


const CONDITIONS = [
    'closed-node',
    'configuration-required',
    'invalid-jid',
    'invalid-options',
    'invalid-payload',
    'invalid-subid',
    'item-forbidden',
    'item-required',
    'jid-required',
    'max-items-exceeded',
    'max-nodes-exceeded',
    'nodeid-required',
    'not-in-roster-group',
    'not-subscribed',
    'payload-too-big',
    'payload-required',
    'pending-subscription',
    'presence-subscription-required',
    'subid-required',
    'too-many-subscriptions',
    'unsupported',
    'unsupported-access-model'
];


export default function (JXT) {

    JXT.withStanzaError(function (StanzaError) {

        JXT.add(StanzaError, 'pubsubCondition', JXT.utils.enumSub(NS.PUBSUB_ERRORS, CONDITIONS));
        JXT.add(StanzaError, 'pubsubUnsupportedFeature', {
            get: function () {

                return JXT.utils.getSubAttribute(this.xml, NS.PUBSUB_ERRORS, 'unsupported', 'feature');
            },
            set: function (value) {

                if (value) {
                    this.pubsubCondition = 'unsupported';
                }
                JXT.utils.setSubAttribute(this.xml, NS.PUBSUB_ERRORS, 'unsupported', 'feature', value);
            }
        });
    });
}
