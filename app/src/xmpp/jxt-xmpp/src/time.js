import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let EntityTime = JXT.define({
        name: 'time',
        namespace: NS.TIME,
        element: 'time',
        fields: {
            utc: JXT.utils.dateSub(NS.TIME, 'utc'),
            tzo: JXT.utils.tzoSub(NS.TIME, 'tzo', 0)
        }
    });


    JXT.extendIQ(EntityTime);
}
