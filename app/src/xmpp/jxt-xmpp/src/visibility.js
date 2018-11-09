import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    JXT.withIQ(function (IQ) {

        JXT.add(IQ, 'visible', JXT.utils.boolSub(NS.INVISIBLE_0, 'visible'));
        JXT.add(IQ, 'invisible', JXT.utils.boolSub(NS.INVISIBLE_0, 'invisible'));
    });
}
