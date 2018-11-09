import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let PrivateStorage = JXT.define({
        name: 'privateStorage',
        namespace: NS.PRIVATE,
        element: 'query'
    });

    JXT.extendIQ(PrivateStorage);
}
