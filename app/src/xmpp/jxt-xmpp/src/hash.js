import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    JXT.define({
        name: 'hash',
        namespace: NS.HASHES_1,
        element: 'hash',
        fields: {
            algo: JXT.utils.attribute('algo'),
            value: JXT.utils.text()
        }
    });
}
