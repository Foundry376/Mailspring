'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;

    var Feedback = {
        get: function get() {

            var existing = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb');
            var result = [];
            existing.forEach(function (xml) {

                result.push({
                    type: Utils.getAttribute(xml, 'type'),
                    subtype: Utils.getAttribute(xml, 'subtype')
                });
            });
            existing = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb-trr-int');
            existing.forEach(function (xml) {

                result.push({
                    type: Utils.getAttribute(xml, 'type'),
                    value: Utils.getAttribute(xml, 'value')
                });
            });
            return result;
        },
        set: function set(values) {

            var self = this;
            var existing = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb');
            existing.forEach(function (item) {

                self.xml.removeChild(item);
            });
            existing = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb-trr-int');
            existing.forEach(function (item) {

                self.xml.removeChild(item);
            });

            values.forEach(function (value) {

                var fb = undefined;
                if (value.type === 'trr-int') {
                    fb = Utils.createElement(_xmppConstants.Namespace.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb-trr-int', _xmppConstants.Namespace.JINGLE_RTP_1);
                    Utils.setAttribute(fb, 'type', value.type);
                    Utils.setAttribute(fb, 'value', value.value);
                } else {
                    fb = Utils.createElement(_xmppConstants.Namespace.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb', _xmppConstants.Namespace.JINGLE_RTP_1);
                    Utils.setAttribute(fb, 'type', value.type);
                    Utils.setAttribute(fb, 'subtype', value.subtype);
                }
                self.xml.appendChild(fb);
            });
        }
    };

    var Bandwidth = JXT.define({
        name: 'bandwidth',
        namespace: _xmppConstants.Namespace.JINGLE_RTP_1,
        element: 'bandwidth',
        fields: {
            type: Utils.attribute('type'),
            bandwidth: Utils.text()
        }
    });

    var RTP = JXT.define({
        name: '_rtp',
        namespace: _xmppConstants.Namespace.JINGLE_RTP_1,
        element: 'description',
        tags: ['jingle-application'],
        fields: {
            applicationType: { value: 'rtp', writable: true },
            media: Utils.attribute('media'),
            ssrc: Utils.attribute('ssrc'),
            mux: Utils.boolSub(_xmppConstants.Namespace.JINGLE_RTP_1, 'rtcp-mux'),
            encryption: {
                get: function get() {

                    var enc = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_1, 'encryption');
                    if (!enc.length) {
                        return [];
                    }
                    enc = enc[0];

                    var self = this;
                    var data = Utils.find(enc, _xmppConstants.Namespace.JINGLE_RTP_1, 'crypto');
                    var results = [];

                    data.forEach(function (xml) {

                        results.push(new Crypto({}, xml, self).toJSON());
                    });
                    return results;
                },
                set: function set(values) {

                    var enc = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_1, 'encryption');
                    if (enc.length) {
                        this.xml.removeChild(enc);
                    }

                    if (!values.length) {
                        return;
                    }

                    Utils.setBoolSubAttribute(this.xml, _xmppConstants.Namespace.JINGLE_RTP_1, 'encryption', 'required', true);
                    enc = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_1, 'encryption')[0];

                    var self = this;
                    values.forEach(function (value) {

                        var content = new Crypto(value, null, self);
                        enc.appendChild(content.xml);
                    });
                }
            },
            feedback: Feedback,
            headerExtensions: {
                get: function get() {

                    var existing = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_HDREXT_0, 'rtp-hdrext');
                    var result = [];
                    existing.forEach(function (xml) {

                        result.push({
                            id: Utils.getAttribute(xml, 'id'),
                            uri: Utils.getAttribute(xml, 'uri'),
                            senders: Utils.getAttribute(xml, 'senders')
                        });
                    });
                    return result;
                },
                set: function set(values) {

                    var self = this;
                    var existing = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_HDREXT_0, 'rtp-hdrext');
                    existing.forEach(function (item) {

                        self.xml.removeChild(item);
                    });

                    values.forEach(function (value) {

                        var hdr = Utils.createElement(_xmppConstants.Namespace.JINGLE_RTP_HDREXT_0, 'rtp-hdrext', _xmppConstants.Namespace.JINGLE_RTP_1);
                        Utils.setAttribute(hdr, 'id', value.id);
                        Utils.setAttribute(hdr, 'uri', value.uri);
                        Utils.setAttribute(hdr, 'senders', value.senders);
                        self.xml.appendChild(hdr);
                    });
                }
            }
        }
    });

    var PayloadType = JXT.define({
        name: '_payloadType',
        namespace: _xmppConstants.Namespace.JINGLE_RTP_1,
        element: 'payload-type',
        fields: {
            channels: Utils.attribute('channels'),
            clockrate: Utils.attribute('clockrate'),
            id: Utils.attribute('id'),
            maxptime: Utils.attribute('maxptime'),
            name: Utils.attribute('name'),
            ptime: Utils.attribute('ptime'),
            feedback: Feedback,
            parameters: {
                get: function get() {

                    var result = [];
                    var params = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_1, 'parameter');
                    params.forEach(function (param) {

                        result.push({
                            key: Utils.getAttribute(param, 'name'),
                            value: Utils.getAttribute(param, 'value')
                        });
                    });
                    return result;
                },
                set: function set(values) {

                    var self = this;
                    values.forEach(function (value) {

                        var param = Utils.createElement(_xmppConstants.Namespace.JINGLE_RTP_1, 'parameter');
                        Utils.setAttribute(param, 'name', value.key);
                        Utils.setAttribute(param, 'value', value.value);
                        self.xml.appendChild(param);
                    });
                }
            }
        }
    });

    var Crypto = JXT.define({
        name: 'crypto',
        namespace: _xmppConstants.Namespace.JINGLE_RTP_1,
        element: 'crypto',
        fields: {
            cipherSuite: Utils.attribute('crypto-suite'),
            keyParams: Utils.attribute('key-params'),
            sessionParams: Utils.attribute('session-params'),
            tag: Utils.attribute('tag')
        }
    });

    var ContentGroup = JXT.define({
        name: '_group',
        namespace: _xmppConstants.Namespace.JINGLE_GROUPING_0,
        element: 'group',
        fields: {
            semantics: Utils.attribute('semantics'),
            contents: Utils.multiSubAttribute(_xmppConstants.Namespace.JINGLE_GROUPING_0, 'content', 'name')
        }
    });

    var SourceGroup = JXT.define({
        name: '_sourceGroup',
        namespace: _xmppConstants.Namespace.JINGLE_RTP_SSMA_0,
        element: 'ssrc-group',
        fields: {
            semantics: Utils.attribute('semantics'),
            sources: Utils.multiSubAttribute(_xmppConstants.Namespace.JINGLE_RTP_SSMA_0, 'source', 'ssrc')
        }
    });

    var Source = JXT.define({
        name: '_source',
        namespace: _xmppConstants.Namespace.JINGLE_RTP_SSMA_0,
        element: 'source',
        fields: {
            ssrc: Utils.attribute('ssrc'),
            parameters: {
                get: function get() {

                    var result = [];
                    var params = Utils.find(this.xml, _xmppConstants.Namespace.JINGLE_RTP_SSMA_0, 'parameter');
                    params.forEach(function (param) {

                        result.push({
                            key: Utils.getAttribute(param, 'name'),
                            value: Utils.getAttribute(param, 'value')
                        });
                    });
                    return result;
                },
                set: function set(values) {

                    var self = this;
                    values.forEach(function (value) {

                        var param = Utils.createElement(_xmppConstants.Namespace.JINGLE_RTP_SSMA_0, 'parameter');
                        Utils.setAttribute(param, 'name', value.key);
                        Utils.setAttribute(param, 'value', value.value);
                        self.xml.appendChild(param);
                    });
                }
            }
        }
    });

    var Stream = JXT.define({
        name: '_stream',
        namespace: 'urn:xmpp:jingle:apps:rtp:msid:0',
        element: 'stream',
        fields: {
            id: Utils.attribute('id'),
            track: Utils.attribute('track')
        }
    });

    var Mute = JXT.define({
        name: 'mute',
        namespace: _xmppConstants.Namespace.JINGLE_RTP_INFO_1,
        element: 'mute',
        fields: {
            creator: Utils.attribute('creator'),
            name: Utils.attribute('name')
        }
    });

    var Unmute = JXT.define({
        name: 'unmute',
        namespace: _xmppConstants.Namespace.JINGLE_RTP_INFO_1,
        element: 'unmute',
        fields: {
            creator: Utils.attribute('creator'),
            name: Utils.attribute('name')
        }
    });

    JXT.extend(RTP, Bandwidth);
    JXT.extend(RTP, PayloadType, 'payloads');
    JXT.extend(RTP, Source, 'sources');
    JXT.extend(RTP, SourceGroup, 'sourceGroups');
    JXT.extend(RTP, Stream, 'streams');

    JXT.withDefinition('content', _xmppConstants.Namespace.JINGLE_1, function (Content) {

        JXT.extend(Content, RTP);
    });

    JXT.withDefinition('jingle', _xmppConstants.Namespace.JINGLE_1, function (Jingle) {

        JXT.extend(Jingle, Mute);
        JXT.extend(Jingle, Unmute);
        JXT.extend(Jingle, ContentGroup, 'groups');
        JXT.add(Jingle, 'ringing', Utils.boolSub(_xmppConstants.Namespace.JINGLE_RTP_INFO_1, 'ringing'));
        JXT.add(Jingle, 'hold', Utils.boolSub(_xmppConstants.Namespace.JINGLE_RTP_INFO_1, 'hold'));
        JXT.add(Jingle, 'active', Utils.boolSub(_xmppConstants.Namespace.JINGLE_RTP_INFO_1, 'active'));
    });
};

module.exports = exports['default'];
//# sourceMappingURL=rtp.js.map