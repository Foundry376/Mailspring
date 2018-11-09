import { Namespace as NS } from 'xmpp-constants';
import { JID } from 'xmpp-jid';


export default function (JXT) {

    let Utils = JXT.utils;

    let jidList = {
        get: function () {

            let result = [];
            let items = Utils.find(this.xml, NS.BLOCKING, 'item');
            if (!items.length) {
                return result;
            }

            items.forEach(function (item) {

                result.push(new JID(Utils.getAttribute(item, 'jid', '')));
            });

            return result;
        },
        set: function (values) {

            let self = this;
            values.forEach(function (value) {

                let item = Utils.createElement(NS.BLOCKING, 'item', NS.BLOCKING);
                Utils.setAttribute(item, 'jid', value.toString());
                self.xml.appendChild(item);
            });
        }
    };

    let Block = JXT.define({
        name: 'block',
        namespace: NS.BLOCKING,
        element: 'block',
        fields: {
            jids: jidList
        }
    });

    let Unblock = JXT.define({
        name: 'unblock',
        namespace: NS.BLOCKING,
        element: 'unblock',
        fields: {
            jids: jidList
        }
    });

    let BlockList = JXT.define({
        name: 'blockList',
        namespace: NS.BLOCKING,
        element: 'blocklist',
        fields: {
            jids: jidList
        }
    });


    JXT.extendIQ(Block);
    JXT.extendIQ(Unblock);
    JXT.extendIQ(BlockList);
}
