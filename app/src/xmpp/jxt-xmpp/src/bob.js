import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let BOB = JXT.define({
        name: 'bob',
        namespace: NS.BOB,
        element: 'data',
        fields: {
            cid: Utils.attribute('cid'),
            maxAge: Utils.numberAttribute('max-age'),
            type: Utils.attribute('type'),
            data: Utils.text()
        }
    });


    JXT.extendIQ(BOB);
    JXT.extendMessage(BOB);
    JXT.extendPresence(BOB);
}
