import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let PubsubOwner = JXT.define({
        name: 'pubsubOwner',
        namespace: NS.PUBSUB_OWNER,
        element: 'pubsub',
        fields: {
            purge: Utils.subAttribute(NS.PUBSUB_OWNER, 'purge', 'node'),
            del: Utils.subAttribute(NS.PUBSUB_OWNER, 'delete', 'node'),
            redirect: {
                get: function () {

                    let del = Utils.find(this.xml, NS.PUBSUB_OWNER, 'delete');
                    if (del.length) {
                        return Utils.getSubAttribute(del[0], NS.PUBSUB_OWNER, 'redirect', 'uri');
                    }
                    return '';
                },
                set: function (value) {

                    let del = Utils.findOrCreate(this.xml, NS.PUBSUB_OWNER, 'delete');
                    Utils.setSubAttribute(del, NS.PUBSUB_OWNER, 'redirect', 'uri', value);
                }
            }
        }
    });

    let Subscription = JXT.define({
        name: 'subscription',
        namespace: NS.PUBSUB_OWNER,
        element: 'subscription',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid'),
            subid: Utils.attribute('subid'),
            type: Utils.attribute('subscription'),
            configurable: Utils.boolSub('subscribe-options'),
            configurationRequired: {
                get: function () {

                    let options = Utils.find(this.xml, NS.PUBSUB_OWNER, 'subscribe-options');
                    if (options.length) {
                        return Utils.getBoolSub(options[0], NS.PUBSUB_OWNER, 'required');
                    }
                    return false;
                }
            }
        }
    });

    let Subscriptions = JXT.define({
        name: 'subscriptions',
        namespace: NS.PUBSUB_OWNER,
        element: 'subscriptions',
        fields: {
            node: Utils.attribute('node')
        }
    });

    let Affiliation = JXT.define({
        name: 'affiliation',
        namespace: NS.PUBSUB_OWNER,
        element: 'affiliation',
        fields: {
            jid: Utils.jidAttribute('jid'),
            type: Utils.attribute('affiliation')
        }
    });

    let Affiliations = JXT.define({
        name: 'affiliations',
        namespace: NS.PUBSUB_OWNER,
        element: 'affiliations',
        fields: {
            node: Utils.attribute('node')
        }
    });

    let Configure = JXT.define({
        name: 'config',
        namespace: NS.PUBSUB_OWNER,
        element: 'configure',
        fields: {
            node: Utils.attribute('node')
        }
    });

    let Default = JXT.define({
        name: 'default',
        namespace: NS.PUBSUB_OWNER,
        element: 'default'
    });

    JXT.extend(PubsubOwner, Configure);
    JXT.extend(PubsubOwner, Subscriptions);
    JXT.extend(PubsubOwner, Affiliations);
    JXT.extend(PubSubOwner, Default);

    JXT.extend(Subscriptions, Subscription, 'list');
    JXT.extend(Affiliations, Affiliation, 'list');

    JXT.extendIQ(PubsubOwner);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(Configure, DataForm);
    });
}
