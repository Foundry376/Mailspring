'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var FT_NS = _xmppConstants.Namespace.FILE_TRANSFER_3;

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var File = JXT.define({
        name: '_file',
        namespace: FT_NS,
        element: 'file',
        fields: {
            name: Utils.textSub(FT_NS, 'name'),
            desc: Utils.textSub(FT_NS, 'desc'),
            size: Utils.numberSub(FT_NS, 'size'),
            date: Utils.dateSub(FT_NS, 'date')
        }
    });

    var Range = JXT.define({
        name: 'range',
        namespace: FT_NS,
        element: 'range',
        fields: {
            offset: Utils.numberAttribute('offset')
        }
    });

    var Thumbnail = JXT.define({
        name: 'thumbnail',
        namespace: _xmppConstants.Namespace.THUMBS_0,
        element: 'thumbnail',
        fields: {
            cid: Utils.attribute('cid'),
            mimeType: Utils.attribute('mime-type'),
            width: Utils.numberAttribute('width'),
            height: Utils.numberAttribute('height')
        }
    });

    var FileTransfer = JXT.define({
        name: '_filetransfer',
        namespace: FT_NS,
        element: 'description',
        tags: ['jingle-application'],
        fields: {
            applicationType: { value: 'filetransfer' },
            offer: Utils.subExtension('offer', FT_NS, 'offer', File),
            request: Utils.subExtension('request', FT_NS, 'request', File)
        }
    });

    JXT.extend(File, Range);
    JXT.extend(File, Thumbnail);

    JXT.withDefinition('hash', _xmppConstants.Namespace.HASHES_1, function (Hash) {

        JXT.extend(File, Hash, 'hashes');
    });

    JXT.withDefinition('content', _xmppConstants.Namespace.JINGLE_1, function (Content) {

        JXT.extend(Content, FileTransfer);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=file3.js.map