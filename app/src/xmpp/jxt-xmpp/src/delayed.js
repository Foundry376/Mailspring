import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let DelayedDelivery = JXT.define({
        name: 'delay',
        namespace: NS.DELAY,
        element: 'delay',
        fields: {
            from: Utils.jidAttribute('from'),
            stamp: Utils.dateAttribute('stamp'),
            reason: Utils.text()
        }
    });

    JXT.extendMessage(DelayedDelivery);
    JXT.extendPresence(DelayedDelivery);
}
