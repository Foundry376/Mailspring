import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let Conference = JXT.define({
        name: '_conference',
        namespace: NS.BOOKMARKS,
        element: 'conference',
        fields: {
            name: Utils.attribute('name'),
            autoJoin: Utils.boolAttribute('autojoin'),
            jid: Utils.jidAttribute('jid'),
            nick: Utils.textSub(NS.BOOKMARKS, 'nick')
        }
    });

    let Bookmarks = JXT.define({
        name: 'bookmarks',
        namespace: NS.BOOKMARKS,
        element: 'storage'
    });


    JXT.extend(Bookmarks, Conference, 'conferences');

    JXT.withDefinition('query', NS.PRIVATE, function (PrivateStorage) {

        JXT.extend(PrivateStorage, Bookmarks);
    });
}
