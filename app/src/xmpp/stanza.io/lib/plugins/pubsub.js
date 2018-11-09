'use strict';


module.exports = function (client) {

    client.on('message', function (msg) {
        if (msg.event) {
            client.emit('pubsub:event', msg);
            client.emit('pubsubEvent', msg);

            if (msg.event.updated) {
                var published = msg.event.updated.published;
                var retracted = msg.event.updated.retracted;


                if (published && published.length) {
                    client.emit('pubsub:published', msg);
                }

                if (retracted && retracted.length) {
                    client.emit('pubsub:retracted', msg);
                }
            }

            if (msg.event.purged) {
                client.emit('pubsub:purged', msg);
            }

            if (msg.event.deleted) {
                client.emit('pubsub:deleted', msg);
            }

            if (msg.event.subscriptionChanged) {
                client.emit('pubsub:subscription', msg);
            }

            if (msg.event.configurationChanged) {
                client.emit('pubsub:config', msg);
            }
        }

        if (msg.pubsub && msg.pubsub.affiliations) {
            client.emit('pubsub:affiliation', msg);
        }
    });

    client.subscribeToNode = function (jid, opts, cb) {
        if (typeof opts === 'string') {
            opts = {
                node: opts
            };
        }
        opts.jid = opts.jid || client.jid;

        return this.sendIq({
            type: 'set',
            to: jid,
            pubsub: {
                subscribe: opts
            }
        }, cb);
    };

    client.unsubscribeFromNode = function (jid, opts, cb) {
        if (typeof opts === 'string') {
            opts = {
                node: opts
            };
        }
        opts.jid = opts.jid || client.jid.bare;

        return this.sendIq({
            type: 'set',
            to: jid,
            pubsub: {
                unsubscribe: opts
            }
        }, cb);
    };

    client.publish = function (jid, node, item, cb) {
        return this.sendIq({
            type: 'set',
            to: jid,
            pubsub: {
                publish: {
                    node: node,
                    item: item
                }
            }
        }, cb);
    };

    client.getItem = function (jid, node, id, cb) {
        return this.sendIq({
            type: 'get',
            to: jid,
            pubsub: {
                retrieve: {
                    node: node,
                    item: id
                }
            }
        }, cb);
    };

    client.getItems = function (jid, node, opts, cb) {
        opts = opts || {};
        opts.node = node;
        return this.sendIq({
            type: 'get',
            to: jid,
            pubsub: {
                retrieve: {
                    node: node,
                    max: opts.max
                },
                rsm: opts.rsm
            }
        }, cb);
    };

    client.retract = function (jid, node, id, notify, cb) {
        return this.sendIq({
            type: 'set',
            to: jid,
            pubsub: {
                retract: {
                    node: node,
                    notify: notify,
                    id: id
                }
            }
        }, cb);
    };

    client.purgeNode = function (jid, node, cb) {
        return this.sendIq({
            type: 'set',
            to: jid,
            pubsubOwner: {
                purge: node
            }
        }, cb);
    };

    client.deleteNode = function (jid, node, cb) {
        return this.sendIq({
            type: 'set',
            to: jid,
            pubsubOwner: {
                del: node
            }
        }, cb);
    };

    client.createNode = function (jid, node, config, cb) {
        var cmd = {
            type: 'set',
            to: jid,
            pubsub: {
                create: node
            }
        };

        if (config) {
            cmd.pubsub.config = {form: config};
        }

        return this.sendIq(cmd, cb);
    };

    client.getSubscriptions = function (jid, opts, cb) {
        opts = opts || {};

        return this.sendIq({
            type: 'get',
            to: jid,
            pubsub: {
                subscriptions: opts
            }
        }, cb);
    };

    client.getAffiliations = function (jid, opts, cb) {
        opts = opts || {};

        return this.sendIq({
            type: 'get',
            to: jid,
            pubsub: {
                affiliations: opts
            }
        }, cb);
    };

    client.getNodeSubscribers = function (jid, node, opts, cb) {
        opts = opts || {};
        opts.node = node;

        return this.sendIq({
            type: 'get',
            to: jid,
            pubsubOwner: {
                subscriptions: opts
            }
        }, cb);
    };

    client.updateNodeSubscriptions = function (jid, node, delta, cb) {
        return this.sendIq({
            type: 'set',
            to: jid,
            pubsubOwner: {
                subscriptions: {
                    node: node,
                    list: delta
                }
            }
        }, cb);
    };

    client.getNodeAffiliations = function (jid, node, opts, cb) {
        opts = opts || {};
        opts.node = node;

        return this.sendIq({
            type: 'get',
            to: jid,
            pubsubOwner: {
                affiliations: opts
            }
        }, cb);
    };

    client.updateNodeAffiliations = function (jid, node, delta, cb) {
        return this.sendIq({
            type: 'set',
            to: jid,
            pubsubOwner: {
                affiliations: {
                    node: node,
                    list: delta
                }
            }
        }, cb);
    };
};
