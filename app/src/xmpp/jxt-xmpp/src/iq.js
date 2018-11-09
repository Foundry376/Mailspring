import { Namespace as NS } from 'xmpp-constants';


let internals = {};


internals.defineIQ = function (JXT, name, namespace) {

    let Utils = JXT.utils;

    let IQ = JXT.define({
        name: name,
        namespace: namespace,
        element: 'iq',
        topLevel: true,
        fields: {
            lang: Utils.langAttribute(),
            id: Utils.attribute('id'),
            to: Utils.jidAttribute('to', true),
            from: Utils.jidAttribute('from', true),
            type: Utils.attribute('type')
        }
    });

    const toJSON = IQ.prototype.toJSON;

    Object.assign(IQ.prototype, {
        toJSON () {

            let result = toJSON.call(this);
            result.resultReply = this.resultReply;
            result.errorReply = this.errorReply;
            return result;
        },

        resultReply (data) {

            data = data || {};
            data.to = this.from;
            data.id = this.id;
            data.type = 'result';
            return new IQ(data);
        },

        errorReply (data) {

            data = data || {};
            data.to = this.from;
            data.id = this.id;
            data.type = 'error';
            return new IQ(data);
        }
    });
};


export default function (JXT) {

    internals.defineIQ(JXT, 'iq', NS.CLIENT);
    internals.defineIQ(JXT, 'serverIQ', NS.SERVER);
    internals.defineIQ(JXT, 'componentIQ', NS.COMPONENT);
}
