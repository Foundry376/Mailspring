import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let Bind = JXT.define({
        name: 'bind',
        namespace: NS.BIND,
        element: 'bind',
        fields: {
            resource: Utils.textSub(NS.BIND, 'resource'),
            jid: Utils.jidSub(NS.BIND, 'jid'),
            deviceId: Utils.textSub(_xmppConstants.Namespace.BIND, 'deviceId'),
            timestamp: Utils.textSub(_xmppConstants.Namespace.BIND, 'timestamp'),
            deviceType: Utils.textSub(_xmppConstants.Namespace.BIND, 'deviceType'),
            deviceModel: Utils.textSub(_xmppConstants.Namespace.BIND, 'deviceModel'),
            clientVerCode: Utils.textSub(_xmppConstants.Namespace.BIND, 'clientVerCode'),
            clientVerName: Utils.textSub(_xmppConstants.Namespace.BIND, 'clientVerName'),
            serverTimestamp: Utils.subAttribute(_xmppConstants.Namespace.BIND, 'timestamp', 'server')
        }
    });


    JXT.extendIQ(Bind);
    JXT.extendStreamFeatures(Bind);
}
