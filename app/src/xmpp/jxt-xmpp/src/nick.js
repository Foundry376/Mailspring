import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let nick = JXT.utils.textSub(NS.NICK, 'nick');


    JXT.withPubsubItem(function (Item) {

        JXT.add(Item, 'nick', nick);
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'nick', nick);
    });

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'nick', nick);
    });
}
