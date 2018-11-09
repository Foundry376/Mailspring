import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;


    let Pubsub = JXT.define({
        name: 'pubsub',
        namespace: NS.PUBSUB,
        element: 'pubsub',
        fields: {
            create: {
                get: function () {

                    let node = Utils.getSubAttribute(this.xml, NS.PUBSUB, 'create', 'node');
                    if (node) {
                        return node;
                    }
                    return Utils.getBoolSub(this.xml, NS.PUBSUB, 'create');
                },
                set: function (value) {

                    if (value === true || !value) {
                        Utils.setBoolSub(this.xml, NS.PUBSUB, 'create', value);
                    } else {
                        Utils.setSubAttribute(this.xml, NS.PUBSUB, 'create', 'node', value);
                    }
                }
            },
            publishOptions: {
                get: function () {

                    let DataForm = JXT.getDefinition('x', NS.DATAFORM);
                    let conf = Utils.find(this.xml, NS.PUBSUB, 'publish-options');
                    if (conf.length && conf[0].childNodes.length) {
                        return new DataForm({}, conf[0].childNodes[0]);
                    }
                },
                set: function (value) {

                    let DataForm = JXT.getDefinition('x', NS.DATAFORM);
                    let conf = Utils.findOrCreate(this.xml, NS.PUBSUB, 'publish-options');
                    if (value) {
                        let form = new DataForm(value);
                        conf.appendChild(form.xml);
                    }
                }
            }
        }
    });

    let Configure = JXT.define({
        name: 'config',
        namespace: NS.PUBSUB,
        element: 'configure'
    });

    let Subscribe = JXT.define({
        name: 'subscribe',
        namespace: NS.PUBSUB,
        element: 'subscribe',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid')
        }
    });

    let Subscription = JXT.define({
        name: 'subscription',
        namespace: NS.PUBSUB,
        element: 'subscription',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid'),
            subid: Utils.attribute('subid'),
            type: Utils.attribute('subscription'),
            configurable: Utils.boolSub('subscribe-options'),
            configurationRequired: {
                get: function () {

                    let options = Utils.find(this.xml, NS.PUBSUB, 'subscribe-options');
                    if (options.length) {
                        return Utils.getBoolSub(options[0], NS.PUBSUB, 'required');
                    }
                    return false;
                }
            }
        }
    });

    let Subscriptions = JXT.define({
        name: 'subscriptions',
        namespace: NS.PUBSUB,
        element: 'subscriptions',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid')
        }
    });

    let Affiliation = JXT.define({
        name: 'affiliation',
        namespace: NS.PUBSUB,
        element: 'affiliation',
        fields: {
            node: Utils.attribute('node'),
            type: Utils.attribute('affiliation')
        }
    });

    let Affiliations = JXT.define({
        name: 'affiliations',
        namespace: NS.PUBSUB,
        element: 'affiliations',
        fields: {
            node: Utils.attribute('node')
        }
    });

    let SubscriptionOptions = JXT.define({
        name: 'subscriptionOptions',
        namespace: NS.PUBSUB,
        element: 'options',
        fields: {
            node: Utils.attribute('node'),
            jid: Utils.jidAttribute('jid'),
            subid: Utils.attribute('subid')
        }
    });

    let Unsubscribe = JXT.define({
        name: 'unsubscribe',
        namespace: NS.PUBSUB,
        element: 'unsubscribe',
        fields: {
            node: Utils.attribute('node'),
            subid: Utils.attribute('subid'),
            jid: Utils.jidAttribute('jid')
        }
    });

    let Publish = JXT.define({
        name: 'publish',
        namespace: NS.PUBSUB,
        element: 'publish',
        fields: {
            node: Utils.attribute('node')
        }
    });

    let Retract = JXT.define({
        name: 'retract',
        namespace: NS.PUBSUB,
        element: 'retract',
        fields: {
            node: Utils.attribute('node'),
            notify: Utils.boolAttribute('notify'),
            id: Utils.subAttribute(NS.PUBSUB, 'item', 'id')
        }
    });

    let Retrieve = JXT.define({
        name: 'retrieve',
        namespace: NS.PUBSUB,
        element: 'items',
        fields: {
            node: Utils.attribute('node'),
            max: Utils.attribute('max_items')
        }
    });

    let Item = JXT.define({
        name: 'item',
        namespace: NS.PUBSUB,
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

    JXT.withDefinition('set', NS.RSM, function (RSM) {

        JXT.extend(Pubsub, RSM);
    });
}
