import { Namespace as NS } from 'xmpp-constants';


export default function (JXT) {

    let Utils = JXT.utils;

    let Feedback = {
        get: function () {

            let existing = Utils.find(this.xml, NS.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb');
            let result = [];
            existing.forEach(function (xml) {

                result.push({
                    type: Utils.getAttribute(xml, 'type'),
                    subtype: Utils.getAttribute(xml, 'subtype')
                });
            });
            existing = Utils.find(this.xml, NS.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb-trr-int');
            existing.forEach(function (xml) {

                result.push({
                    type: Utils.getAttribute(xml, 'type'),
                    value: Utils.getAttribute(xml, 'value')
                });
            });
            return result;
        },
        set: function (values) {

            let self = this;
            let existing = Utils.find(this.xml, NS.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb');
            existing.forEach(function (item) {

                self.xml.removeChild(item);
            });
            existing = Utils.find(this.xml, NS.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb-trr-int');
            existing.forEach(function (item) {

                self.xml.removeChild(item);
            });

            values.forEach(function (value) {

                let fb;
                if (value.type === 'trr-int') {
                    fb = Utils.createElement(NS.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb-trr-int', NS.JINGLE_RTP_1);
                    Utils.setAttribute(fb, 'type', value.type);
                    Utils.setAttribute(fb, 'value', value.value);
                } else {
                    fb = Utils.createElement(NS.JINGLE_RTP_RTCP_FB_0, 'rtcp-fb', NS.JINGLE_RTP_1);
                    Utils.setAttribute(fb, 'type', value.type);
                    Utils.setAttribute(fb, 'subtype', value.subtype);
                }
                self.xml.appendChild(fb);
            });
        }
    };

    let Bandwidth = JXT.define({
        name: 'bandwidth',
        namespace: NS.JINGLE_RTP_1,
        element: 'bandwidth',
        fields: {
            type: Utils.attribute('type'),
            bandwidth: Utils.text()
        }
    });

    let RTP = JXT.define({
        name: '_rtp',
        namespace: NS.JINGLE_RTP_1,
        element: 'description',
        tags: ['jingle-application'],
        fields: {
            applicationType: {value: 'rtp', writable: true,},
            media: Utils.attribute('media'),
            ssrc: Utils.attribute('ssrc'),
            mux: Utils.boolSub(NS.JINGLE_RTP_1, 'rtcp-mux'),
            encryption: {
                get: function () {

                    let enc = Utils.find(this.xml, NS.JINGLE_RTP_1, 'encryption');
                    if (!enc.length) {
                        return [];
                    }
                    enc = enc[0];

                    let self = this;
                    let data = Utils.find(enc, NS.JINGLE_RTP_1, 'crypto');
                    let results = [];

                    data.forEach(function (xml) {

                        results.push(new Crypto({}, xml, self).toJSON());
                    });
                    return results;
                },
                set: function (values) {

                    let enc = Utils.find(this.xml, NS.JINGLE_RTP_1, 'encryption');
                    if (enc.length) {
                        this.xml.removeChild(enc);
                    }

                    if (!values.length) {
                        return;
                    }

                    Utils.setBoolSubAttribute(this.xml, NS.JINGLE_RTP_1, 'encryption', 'required', true);
                    enc = Utils.find(this.xml, NS.JINGLE_RTP_1, 'encryption')[0];

                    let self = this;
                    values.forEach(function (value) {

                        let content = new Crypto(value, null, self);
                        enc.appendChild(content.xml);
                    });
                }
            },
            feedback: Feedback,
            headerExtensions: {
                get: function () {

                    let existing = Utils.find(this.xml, NS.JINGLE_RTP_HDREXT_0, 'rtp-hdrext');
                    let result = [];
                    existing.forEach(function (xml) {

                        result.push({
                            id: Utils.getAttribute(xml, 'id'),
                            uri: Utils.getAttribute(xml, 'uri'),
                            senders: Utils.getAttribute(xml, 'senders')
                        });
                    });
                    return result;
                },
                set: function (values) {

                    let self = this;
                    let existing = Utils.find(this.xml, NS.JINGLE_RTP_HDREXT_0, 'rtp-hdrext');
                    existing.forEach(function (item) {

                        self.xml.removeChild(item);
                    });

                    values.forEach(function (value) {

                        let hdr = Utils.createElement(NS.JINGLE_RTP_HDREXT_0, 'rtp-hdrext', NS.JINGLE_RTP_1);
                        Utils.setAttribute(hdr, 'id', value.id);
                        Utils.setAttribute(hdr, 'uri', value.uri);
                        Utils.setAttribute(hdr, 'senders', value.senders);
                        self.xml.appendChild(hdr);
                    });
                }
            }
        }
    });

    let PayloadType = JXT.define({
        name: '_payloadType',
        namespace: NS.JINGLE_RTP_1,
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
                get: function () {

                    let result = [];
                    let params = Utils.find(this.xml, NS.JINGLE_RTP_1, 'parameter');
                    params.forEach(function (param) {

                        result.push({
                            key: Utils.getAttribute(param, 'name'),
                            value: Utils.getAttribute(param, 'value')
                        });
                    });
                    return result;
                },
                set: function (values) {

                    let self = this;
                    values.forEach(function (value) {

                        let param = Utils.createElement(NS.JINGLE_RTP_1, 'parameter');
                        Utils.setAttribute(param, 'name', value.key);
                        Utils.setAttribute(param, 'value', value.value);
                        self.xml.appendChild(param);
                    });
                }
            }
        }
    });

    let Crypto = JXT.define({
        name: 'crypto',
        namespace: NS.JINGLE_RTP_1,
        element: 'crypto',
        fields: {
            cipherSuite: Utils.attribute('crypto-suite'),
            keyParams: Utils.attribute('key-params'),
            sessionParams: Utils.attribute('session-params'),
            tag: Utils.attribute('tag')
        }
    });

    let ContentGroup = JXT.define({
        name: '_group',
        namespace: NS.JINGLE_GROUPING_0,
        element: 'group',
        fields: {
            semantics: Utils.attribute('semantics'),
            contents: Utils.multiSubAttribute(NS.JINGLE_GROUPING_0, 'content', 'name')
        }
    });

    let SourceGroup = JXT.define({
        name: '_sourceGroup',
        namespace: NS.JINGLE_RTP_SSMA_0,
        element: 'ssrc-group',
        fields: {
            semantics: Utils.attribute('semantics'),
            sources: Utils.multiSubAttribute(NS.JINGLE_RTP_SSMA_0, 'source', 'ssrc')
        }
    });

    let Source = JXT.define({
        name: '_source',
        namespace: NS.JINGLE_RTP_SSMA_0,
        element: 'source',
        fields: {
            ssrc: Utils.attribute('ssrc'),
            parameters: {
                get: function () {

                    let result = [];
                    let params = Utils.find(this.xml, NS.JINGLE_RTP_SSMA_0, 'parameter');
                    params.forEach(function (param) {

                        result.push({
                            key: Utils.getAttribute(param, 'name'),
                            value: Utils.getAttribute(param, 'value')
                        });
                    });
                    return result;
                },
                set: function (values) {

                    let self = this;
                    values.forEach(function (value) {

                        let param = Utils.createElement(NS.JINGLE_RTP_SSMA_0, 'parameter');
                        Utils.setAttribute(param, 'name', value.key);
                        Utils.setAttribute(param, 'value', value.value);
                        self.xml.appendChild(param);
                    });
                }
            }
        }
    });

    let Stream = JXT.define({
        name: '_stream',
        namespace: 'urn:xmpp:jingle:apps:rtp:msid:0',
        element: 'stream',
        fields: {
            id: Utils.attribute('id'),
            track: Utils.attribute('track')
        }
    });

    let Mute = JXT.define({
        name: 'mute',
        namespace: NS.JINGLE_RTP_INFO_1,
        element: 'mute',
        fields: {
            creator: Utils.attribute('creator'),
            name: Utils.attribute('name')
        }
    });

    let Unmute = JXT.define({
        name: 'unmute',
        namespace: NS.JINGLE_RTP_INFO_1,
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

    JXT.withDefinition('content', NS.JINGLE_1, function (Content) {

        JXT.extend(Content, RTP);
    });

    JXT.withDefinition('jingle', NS.JINGLE_1, function (Jingle) {

        JXT.extend(Jingle, Mute);
        JXT.extend(Jingle, Unmute);
        JXT.extend(Jingle, ContentGroup, 'groups');
        JXT.add(Jingle, 'ringing', Utils.boolSub(NS.JINGLE_RTP_INFO_1, 'ringing'));
        JXT.add(Jingle, 'hold', Utils.boolSub(NS.JINGLE_RTP_INFO_1, 'hold'));
        JXT.add(Jingle, 'active', Utils.boolSub(NS.JINGLE_RTP_INFO_1, 'active'));
    });
}
