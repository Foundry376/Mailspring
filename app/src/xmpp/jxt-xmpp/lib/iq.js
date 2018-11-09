'use strict';

var _Object$assign = require('babel-runtime/core-js/object/assign')['default'];

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var internals = {};

internals.defineIQ = function (JXT, name, namespace) {

    var Utils = JXT.utils;

    var IQ = JXT.define({
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

    var _toJSON = IQ.prototype.toJSON;

    _Object$assign(IQ.prototype, {
        toJSON: function toJSON() {

            var result = _toJSON.call(this);
            result.resultReply = this.resultReply;
            result.errorReply = this.errorReply;
            return result;
        },

        resultReply: function resultReply(data) {

            data = data || {};
            data.to = this.from;
            data.id = this.id;
            data.type = 'result';
            return new IQ(data);
        },

        errorReply: function errorReply(data) {

            data = data || {};
            data.to = this.from;
            data.id = this.id;
            data.type = 'error';
            return new IQ(data);
        }
    });
};

exports['default'] = function (JXT) {

    internals.defineIQ(JXT, 'iq', _xmppConstants.Namespace.CLIENT);
    internals.defineIQ(JXT, 'serverIQ', _xmppConstants.Namespace.SERVER);
    internals.defineIQ(JXT, 'componentIQ', _xmppConstants.Namespace.COMPONENT);
};

module.exports = exports['default'];
//# sourceMappingURL=iq.js.map