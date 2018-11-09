import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let SHIM = {
        get: function () {

            let headerSet = Utils.find(this.xml, NS.SHIM, 'headers');
            if (headerSet.length) {
                return Utils.getMultiSubText(headerSet[0], NS.SHIM, 'header', function (header) {

                    let name = Utils.getAttribute(header, 'name');
                    if (name) {
                        return {
                            name: name,
                            value: Utils.getText(header)
                        };
                    }
                });
            }
            return [];
        },
        set: function (values) {

            let headerSet = Utils.findOrCreate(this.xml, NS.SHIM, 'headers');
            JXT.setMultiSubText(headerSet, NS.SHIM, 'header', values, function (val) {

                let header = Utils.createElement(NS.SHIM, 'header', NS.SHIM);
                Utils.setAttribute(header, 'name', val.name);
                Utils.setText(header, val.value);
                headerSet.appendChild(header);
            });
        }
    };


    JXT.withMessage(function (Message) {

        JXT.add(Message, 'headers', SHIM);
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'headers', SHIM);
    });
}
