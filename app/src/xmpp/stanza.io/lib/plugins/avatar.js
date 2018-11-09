'use strict';


module.exports = function (client) {

    client.disco.addFeature('urn:xmpp:avatar:metadata+notify');

    client.on('pubsub:event', function (msg) {
        if (!msg.event.updated) {
            return;
        }
        if (msg.event.updated.node !== 'urn:xmpp:avatar:metadata') {
            return;
        }

        client.emit('avatar', {
            jid: msg.from,
            source: 'pubsub',
            avatars: msg.event.updated.published[0].avatars
        });
    });

    client.on('presence', function (pres) {
        if (pres.avatarId) {
            client.emit('avatar', {
                jid: pres.from,
                source: 'vcard',
                avatars: [{
                    id: pres.avatarId
                }]
            });
        }
    });

    client.publishAvatar = function (id, data, cb) {
        return this.publish('', 'urn:xmpp:avatar:data', {
            id: id,
            avatarData: data
        }, cb);
    };

    client.useAvatars = function (info, cb) {
        return this.publish('', 'urn:xmpp:avatar:metadata', {
            id: 'current',
            avatars: info
        }, cb);
    };

    client.getAvatar = function (jid, id, cb) {
        return this.getItem(jid, 'urn:xmpp:avatar:data', id, cb);
    };
};
