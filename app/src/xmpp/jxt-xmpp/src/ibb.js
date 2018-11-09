import { Namespace as NS } from 'xmpp-constants';

const NS_IBB = 'http://jabber.org/protocol/ibb';
const NS_JIBB = 'urn:xmpp:jingle:transports:ibb:1';


export default function (JXT) {

    let Utils = JXT.utils;

    let IBB = {
        get: function () {

            let data = Utils.find(this.xml, NS_IBB, 'data');
            if (data.length) {
                data = data[0];
                return {
                    action: 'data',
                    sid: Utils.getAttribute(data, 'sid'),
                    seq: parseInt(Utils.getAttribute(data, 'seq') || '0', 10),
                    data: new Buffer(Utils.getText(data), 'base64')
                };
            }

            let open = Utils.find(this.xml, NS_IBB, 'open');
            if (open.length) {
                open = open[0];
                let ack = Utils.getAttribute(open, 'stanza');
                if (ack === 'message') {
                    ack = false;
                } else {
                    ack = true;
                }

                return {
                    action: 'open',
                    sid: Utils.getAttribute(open, 'sid'),
                    blockSize: Utils.getAttribute(open, 'block-size'),
                    ack: ack
                };
            }

            let close = Utils.find(this.xml, NS_IBB, 'close');
            if (close.length) {
                return {
                    action: 'close',
                    sid: Utils.getAttribute(close[0], 'sid')
                };
            }
        },
        set: function (value) {

            if (value.action === 'data') {
                let data = Utils.createElement(NS_IBB, 'data');
                Utils.setAttribute(data, 'sid', value.sid);
                Utils.setAttribute(data, 'seq', value.seq.toString());
                Utils.setText(data, value.data.toString('base64'));
                this.xml.appendChild(data);
            }

            if (value.action === 'open') {
                let open = Utils.createElement(NS_IBB, 'open');
                Utils.setAttribute(open, 'sid', value.sid);
                Utils.setAttribute(open, 'block-size', (value.blockSize || '4096').toString());
                if (value.ack === false) {
                    Utils.setAttribute(open, 'stanza', 'message');
                } else {
                    Utils.setAttribute(open, 'stanza', 'iq');
                }
                this.xml.appendChild(open);
            }

            if (value.action === 'close') {
                let close = Utils.createElement(NS_IBB, 'close');
                Utils.setAttribute(close, 'sid', value.sid);
                this.xml.appendChild(close);
            }
        }
    };

    let JingleIBB = JXT.define({
        name: '_' + NS_JIBB,
        namespace: NS_JIBB,
        element: 'transport',
        tags: ['jingle-transport'],
        fields: {
            transportType: {
                value: NS_JIBB,
                writable: true,
            },
            sid: Utils.attribute('sid'),
            blockSize: Utils.numberAttribute('block-size'),
            ack: {
                get: function () {

                    let value = Utils.getAttribute(this.xml, 'stanza');
                    if (value === 'message') {
                        return false;
                    }
                    return true;
                },
                set: function (value) {

                    if (value.ack === false) {
                        Utils.setAttribute(this.xml, 'stanza', 'message');
                    } else {
                        Utils.setAttribute(this.xml, 'stanza', 'iq');
                    }
                }
            }
        }
    });

    JXT.withDefinition('content', NS.JINGLE_1, function (Content) {

        JXT.extend(Content, JingleIBB);
    });

    JXT.withIQ(function (IQ) {

        JXT.add(IQ, 'ibb', IBB);
    });

    JXT.withMessage(function (Message) {

        JXT.add(Message, 'ibb', IBB);
    });
}

