import { Namespace as NS } from 'xmpp-constants';
import { JID } from 'xmpp-jid';


export default function (JXT) {

    JXT.withIQ(function (IQ) {

        JXT.add(IQ, 'jidPrep', {
            get: function () {

                let data = JXT.utils.getSubText(this.xml, NS.JID_PREP_0, 'jid');
                if (data) {
                    let jid = new JID(data);
                    jid.prepped = true;
                    return jid;
                }
            },
            set: function (value) {

                JXT.utils.setSubText(this.xml, NS.JID_PREP_0, 'jid', (value || '').toString());
            }
        });
    });
}
