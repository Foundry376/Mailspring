import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let Enable = JXT.define({
        name: 'enablePush',
        element: 'enable',
        namespace: NS.PUSH_0,
        fields: {
            jid: Utils.jidAttribute('jid'),
            node: Utils.attribute('node')
        }
    });

    let Disable = JXT.define({
        name: 'disablePush',
        element: 'disable',
        namespace: NS.PUSH_0,
        fields: {
            jid: Utils.jidAttribute('jid'),
            node: Utils.attribute('node')
        }
    });

    let Notification = JXT.define({
        name: 'pushNotification',
        element: 'notification',
        namespace: NS.PUSH_0
    });


    JXT.withDataForm((DataForm) => {
        JXT.extend(Notification, DataForm);
        JXT.extend(Enable, DataForm);
    });

    JXT.extendIQ(Enable);
    JXT.extendIQ(Disable);
}
