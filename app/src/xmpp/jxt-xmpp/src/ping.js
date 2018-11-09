import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Ping = JXT.define({
        name: 'ping',
        namespace: NS.PING,
        element: 'ping'
    });

    JXT.extendIQ(Ping);
}
