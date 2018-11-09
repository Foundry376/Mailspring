'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

var FT_NS = _xmppConstants.Namespace.FILE_TRANSFER_4;

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var File = JXT.define({
        name: 'file',
        namespace: FT_NS,
        element: 'file',
        fields: {
            name: Utils.textSub(FT_NS, 'name'),
            description: Utils.textSub(FT_NS, 'desc'),
            mediaType: Utils.textSub(FT_NS, 'media-type'),
            size: Utils.numberSub(FT_NS, 'size'),
            date: Utils.dateSub(FT_NS, 'date')
        }
    });

    var Range = JXT.define({
        name: 'range',
        namespace: FT_NS,
        element: 'range',
        fields: {
            offset: Utils.numberAttribute('offset'),
            length: Utils.numberAttribute('length')
        }
    });

    var FileTransfer = JXT.define({
        name: '_' + FT_NS,
        namespace: FT_NS,
        element: 'description',
        tags: ['jingle-application'],
        fields: {
            applicationType: { value: FT_NS, writable: true }
        }
    });

    var Received = JXT.define({
        name: '_{' + FT_NS + '}received',
        namespace: FT_NS,
        element: 'received',
        tags: ['jingle-info'],
        fields: {
            infoType: { value: '{' + FT_NS + '}received' },
            creator: Utils.attribute('creator'),
            name: Utils.attribute('name')
        }
    });

    var Checksum = JXT.define({
        name: '_{' + FT_NS + '}checksum',
        namespace: FT_NS,
        element: 'checksum',
        tags: ['jingle-info'],
        fields: {
            infoType: { value: '{' + FT_NS + '}checksum' },
            creator: Utils.attribute('creator'),
            name: Utils.attribute('name')
        }
    });

    JXT.extend(File, Range);
    JXT.extend(Checksum, File);
    JXT.extend(FileTransfer, File);

    JXT.withDefinition('hash', _xmppConstants.Namespace.HASHES_1, function (Hash) {

        JXT.extend(File, Hash, 'hashes');
        JXT.extend(Range, Hash, 'hashes');
    });

    JXT.withDefinition('content', _xmppConstants.Namespace.JINGLE_1, function (Content) {

        JXT.extend(Content, FileTransfer);
    });

    JXT.withDefinition('jingle', _xmppConstants.Namespace.JINGLE_1, function (Jingle) {

        JXT.extend(Jingle, Received);
        JXT.extend(Jingle, Checksum);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=file.js.map