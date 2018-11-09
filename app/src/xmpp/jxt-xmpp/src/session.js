import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Session = JXT.define({
        name: 'session',
        namespace: NS.SESSION,
        element: 'session',
        fields: {
            required: JXT.utils.boolSub(NS.SESSION, 'required'),
            optional: JXT.utils.boolSub(NS.SESSION, 'optional')
        }
    });


    JXT.extendIQ(Session);
    JXT.extendStreamFeatures(Session);
}
