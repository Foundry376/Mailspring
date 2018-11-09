import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Version = JXT.define({
        name: 'version',
        namespace: NS.VERSION,
        element: 'query',
        fields: {
            name: JXT.utils.textSub(NS.VERSION, 'name'),
            version: JXT.utils.textSub(NS.VERSION, 'version'),
            os: JXT.utils.textSub(NS.VERSION, 'os')
        }
    });

    JXT.extendIQ(Version);
}
