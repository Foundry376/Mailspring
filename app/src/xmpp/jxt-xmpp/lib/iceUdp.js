'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var ICE = JXT.define({
        name: '_iceUdp',
        namespace: _xmppConstants.Namespace.JINGLE_ICE_UDP_1,
        element: 'transport',
        tags: ['jingle-transport'],
        fields: {
            transportType: { value: 'iceUdp', writable: true },
            pwd: Utils.attribute('pwd'),
            ufrag: Utils.attribute('ufrag'),
            gatheringComplete: Utils.boolSub(_xmppConstants.Namespace.JINGLE_ICE_UDP_1, 'gathering-complete')
        }
    });

    var RemoteCandidate = JXT.define({
        name: 'remoteCandidate',
        namespace: _xmppConstants.Namespace.JINGLE_ICE_UDP_1,
        element: 'remote-candidate',
        fields: {
            component: Utils.attribute('component'),
            ip: Utils.attribute('ip'),
            port: Utils.attribute('port')
        }
    });

    var Candidate = JXT.define({
        name: '_iceUdpCandidate',
        namespace: _xmppConstants.Namespace.JINGLE_ICE_UDP_1,
        element: 'candidate',
        fields: {
            component: Utils.attribute('component'),
            foundation: Utils.attribute('foundation'),
            generation: Utils.attribute('generation'),
            id: Utils.attribute('id'),
            ip: Utils.attribute('ip'),
            network: Utils.attribute('network'),
            port: Utils.attribute('port'),
            priority: Utils.attribute('priority'),
            protocol: Utils.attribute('protocol'),
            relAddr: Utils.attribute('rel-addr'),
            relPort: Utils.attribute('rel-port'),
            tcpType: Utils.attribute('tcptype'),
            type: Utils.attribute('type')
        }
    });

    var Fingerprint = JXT.define({
        name: '_iceFingerprint',
        namespace: _xmppConstants.Namespace.JINGLE_DTLS_0,
        element: 'fingerprint',
        fields: {
            hash: Utils.attribute('hash'),
            setup: Utils.attribute('setup'),
            value: Utils.text(),
            required: Utils.boolAttribute('required')
        }
    });

    var SctpMap = JXT.define({
        name: '_sctpMap',
        namespace: _xmppConstants.Namespace.DTLS_SCTP_1,
        element: 'sctpmap',
        fields: {
            number: Utils.attribute('number'),
            protocol: Utils.attribute('protocol'),
            streams: Utils.attribute('streams')
        }
    });

    JXT.extend(ICE, Candidate, 'candidates');
    JXT.extend(ICE, RemoteCandidate);
    JXT.extend(ICE, Fingerprint, 'fingerprints');
    JXT.extend(ICE, SctpMap, 'sctp');

    JXT.withDefinition('content', _xmppConstants.Namespace.JINGLE_1, function (Content) {

        JXT.extend(Content, ICE);
    });
};

module.exports = exports['default'];
//# sourceMappingURL=iceUdp.js.map