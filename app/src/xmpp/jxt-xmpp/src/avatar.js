import { Namespace as NS } from 'xmpp-constants';
import each from 'lodash.foreach';


export default function (JXT) {

    let Utils = JXT.utils;

    let Avatar = JXT.define({
        name: 'avatar',
        namespace: NS.AVATAR_METADATA,
        element: 'info',
        fields: {
            id: Utils.attribute('id'),
            bytes: Utils.attribute('bytes'),
            height: Utils.attribute('height'),
            width: Utils.attribute('width'),
            type: Utils.attribute('type', 'image/png'),
            url: Utils.attribute('url')
        }
    });

    let avatars = {
        get: function () {

            let metadata = Utils.find(this.xml, NS.AVATAR_METADATA, 'metadata');
            let results = [];
            if (metadata.length) {
                let avatars = Utils.find(metadata[0], NS.AVATAR_METADATA, 'info');
                each(avatars, function (info) {

                    results.push(new Avatar({}, info));
                });
            }
            return results;
        },
        set: function (value) {

            let metadata = Utils.findOrCreate(this.xml, NS.AVATAR_METADATA, 'metadata');
            Utils.setAttribute(metadata, 'xmlns', NS.AVATAR_METADATA);
            each(value, function (info) {

                let avatar = new Avatar(info);
                metadata.appendChild(avatar.xml);
            });
        }
    };


    JXT.withPubsubItem(function (Item) {

        JXT.add(Item, 'avatars', avatars);
        JXT.add(Item, 'avatarData', Utils.textSub(NS.AVATAR_DATA, 'data'));
    });
}
