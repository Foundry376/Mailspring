import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;


    let Address = JXT.define({
        name: '_address',
        namespace: NS.ADDRESS,
        element: 'address',
        fields: {
            jid: Utils.jidAttribute('jid'),
            uri: Utils.attribute('uri'),
            node: Utils.attribute('node'),
            description: Utils.attribute('desc'),
            delivered: Utils.boolAttribute('delivered'),
            type: Utils.attribute('type')
        }
    });

    let Addresses = Utils.subMultiExtension(NS.ADDRESS, 'addresses', Address);


    JXT.withMessage(function (Message) {

        JXT.add(Message, 'addresses', Addresses);
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'addresses', Addresses);
    });
}

