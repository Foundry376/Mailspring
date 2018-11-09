import { Namespace as NS } from 'xmpp-constants';


const FT_NS = NS.FILE_TRANSFER_4;


export default function (JXT) {

    let Utils = JXT.utils;

    let File = JXT.define({
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

    let Range = JXT.define({
        name: 'range',
        namespace: FT_NS,
        element: 'range',
        fields: {
            offset: Utils.numberAttribute('offset'),
            length: Utils.numberAttribute('length')
        }
    });

    let FileTransfer = JXT.define({
        name: '_' + FT_NS,
        namespace: FT_NS,
        element: 'description',
        tags: [ 'jingle-application' ],
        fields: {
            applicationType: { value: FT_NS, writable: true, }
        }
    });

    let Received = JXT.define({
        name: '_{' + FT_NS + '}received',
        namespace: FT_NS,
        element: 'received',
        tags: [ 'jingle-info' ],
        fields: {
            infoType: { value: '{' + FT_NS + '}received' },
            creator: Utils.attribute('creator'),
            name: Utils.attribute('name')
        }
    });

    let Checksum = JXT.define({
        name: '_{' + FT_NS + '}checksum',
        namespace: FT_NS,
        element: 'checksum',
        tags: [ 'jingle-info' ],
        fields: {
            infoType: { value: '{' + FT_NS + '}checksum' },
            creator: Utils.attribute('creator'),
            name: Utils.attribute('name')
        }
    });

    JXT.extend(File, Range);
    JXT.extend(Checksum, File);
    JXT.extend(FileTransfer, File);

    JXT.withDefinition('hash', NS.HASHES_1, function (Hash) {

        JXT.extend(File, Hash, 'hashes');
        JXT.extend(Range, Hash, 'hashes');
    });

    JXT.withDefinition('content', NS.JINGLE_1, function (Content) {

        JXT.extend(Content, FileTransfer);
    });

    JXT.withDefinition('jingle', NS.JINGLE_1, function (Jingle) {

        JXT.extend(Jingle, Received);
        JXT.extend(Jingle, Checksum);
    });
}

