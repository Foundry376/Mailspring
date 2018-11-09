import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Forwarded = JXT.define({
        name: 'forwarded',
        namespace: NS.FORWARD_0,
        element: 'forwarded'
    });


    JXT.withMessage(function (Message) {

        JXT.extend(Message, Forwarded);
        JXT.extend(Forwarded, Message);
    });

    JXT.withPresence(function (Presence) {

        JXT.extend(Presence, Forwarded);
        JXT.extend(Forwarded, Presence);
    });

    JXT.withIQ(function (IQ) {

        JXT.extend(IQ, Forwarded);
        JXT.extend(Forwarded, IQ);
    });

    JXT.withDefinition('delay', NS.DELAY, function (Delayed) {

        JXT.extend(Forwarded, Delayed);
    });
}
