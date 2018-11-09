import { Namespace as NS } from 'xmpp-constants';


const TYPE_MAP = {
    insert: 't',
    erase: 'e',
    wait: 'w'
};

const ACTION_MAP = {
    t: 'insert',
    e: 'erase',
    w: 'wait'
};


export default function (JXT) {

    let Utils = JXT.utils;

    let RTT = JXT.define({
        name: 'rtt',
        namespace: NS.RTT_0,
        element: 'rtt',
        fields: {
            id: Utils.attribute('id'),
            event: Utils.attribute('event', 'edit'),
            seq: Utils.numberAttribute('seq'),
            actions: {
                get: function () {

                    let results = [];
                    for (let i = 0, len = this.xml.childNodes.length; i < len; i++) {
                        let child = this.xml.childNodes[i];
                        let name = child.localName;
                        let action = {};

                        if (child.namespaceURI !== NS.RTT_0) {
                            continue;
                        }

                        if (ACTION_MAP[name]) {
                            action.type = ACTION_MAP[name];
                        } else {
                            continue;
                        }

                        let pos = Utils.getAttribute(child, 'p');
                        if (pos) {
                            action.pos = parseInt(pos, 10);
                        }

                        let n = Utils.getAttribute(child, 'n');
                        if (n) {
                            action.num = parseInt(n, 10);
                        }

                        let t = Utils.getText(child);
                        if (t && name === 't') {
                            action.text = t;
                        }

                        results.push(action);
                    }

                    return results;
                },
                set: function (actions) {

                    let self = this;

                    for (let i = 0, len = this.xml.childNodes.length; i < len; i++) {
                        this.xml.removeChild(this.xml.childNodes[i]);
                    }

                    actions.forEach(function (action ) {

                        if (!TYPE_MAP[action.type]) {
                            return;
                        }

                        let child = Utils.createElement(NS.RTT_0, TYPE_MAP[action.type], NS.RTT_0);

                        if (action.pos !== undefined) {
                            Utils.setAttribute(child, 'p', action.pos.toString());
                        }

                        if (action.num) {
                            Utils.setAttribute(child, 'n', action.num.toString());
                        }

                        if (action.text) {
                            Utils.setText(child, action.text);
                        }

                        self.xml.appendChild(child);
                    });
                }
            }
        }
    });


    JXT.extendMessage(RTT);
}
