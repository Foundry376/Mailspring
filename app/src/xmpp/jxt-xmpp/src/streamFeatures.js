import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let StreamFeatures = JXT.define({
        name: 'streamFeatures',
        namespace: NS.STREAM,
        element: 'features',
        topLevel: true
    });

    let RosterVerFeature = JXT.define({
        name: 'rosterVersioning',
        namespace: NS.ROSTER_VERSIONING,
        element: 'ver'
    });

    let SubscriptionPreApprovalFeature = JXT.define({
        name: 'subscriptionPreApproval',
        namespace: NS.SUBSCRIPTION_PREAPPROVAL,
        element: 'sub'
    });


    JXT.extendStreamFeatures(RosterVerFeature);
    JXT.extendStreamFeatures(SubscriptionPreApprovalFeature);
}
