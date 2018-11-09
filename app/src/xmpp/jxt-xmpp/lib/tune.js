'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Tune = JXT.define({
        name: 'tune',
        namespace: _xmppConstants.Namespace.TUNE,
        element: 'tune',
        fields: {
            artist: Utils.textSub(_xmppConstants.Namespace.TUNE, 'artist'),
            length: Utils.numberSub(_xmppConstants.Namespace.TUNE, 'length'),
            rating: Utils.numberSub(_xmppConstants.Namespace.TUNE, 'rating'),
            source: Utils.textSub(_xmppConstants.Namespace.TUNE, 'source'),
            title: Utils.textSub(_xmppConstants.Namespace.TUNE, 'title'),
            track: Utils.textSub(_xmppConstants.Namespace.TUNE, 'track'),
            uri: Utils.textSub(_xmppConstants.Namespace.TUNE, 'uri')
        }
    });

    JXT.extendPubsubItem(Tune);
    JXT.extendMessage(Tune);
};

module.exports = exports['default'];
//# sourceMappingURL=tune.js.map