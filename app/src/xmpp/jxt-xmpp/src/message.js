import { Namespace as NS } from 'xmpp-constants';


let internals = {};


internals.defineMessage = function (JXT, name, namespace) {

    let Utils = JXT.utils;

    JXT.define({
        name: name,
        namespace: namespace,
        element: 'message',
        topLevel: true,
        fields: {
            lang: Utils.langAttribute(),
            id: Utils.attribute('id'),
            to: Utils.jidAttribute('to', true),
            from: Utils.jidAttribute('from', true),
            type: Utils.attribute('type', 'normal'),
            thread: Utils.textSub(namespace, 'thread'),
            parentThread: Utils.subAttribute(namespace, 'thread', 'parent'),
            subject: Utils.textSub(namespace, 'subject'),
            $body: {
                get: function getBody$ () {

                    return Utils.getSubLangText(this.xml, namespace, 'body', this.lang);
                }
            },
            body: {
                get: function getBody () {

                    let bodies = this.$body;
                    return bodies[this.lang] || '';
                },
                set: function setBody (value) {

                    Utils.setSubLangText(this.xml, namespace, 'body', value, this.lang);
                }
            },
            $keys: {
                get: function getKeys$() {
                    const ns='edison.encrypted';
                    const e2ee=Utils.getElements(this.xml,ns, 'edi-encrypted');
                    if (e2ee.length){
                        const header=Utils.getElements(e2ee[0],ns, 'header');
                        if(header.length){
                            const subs = Utils.find(header[0], ns, 'key');
                            if (subs.length) {
                                let uid,rid, sub;
                                let results = {};

                                for (var i = 0; i < subs.length; i++) {
                                    sub = subs[i];
                                    uid = sub.getAttribute('uid');
                                    rid = sub.getAttribute('rid');
                                    if(uid&&rid){
                                        if(!results[uid]){
                                            results[uid]={};
                                        }
                                        results[uid][rid] = sub.textContent || '';
                                    }
                                }
                                return results;
                            }
                        }
                    }
                    return {};
                }
            },
            keys: {
                get: function getKeys() {
                    const bodies = this.$keys;
                    return bodies;
                }
            },
            $payload: {
                get: function getPayload$() {
                    const e2ee=Utils.getElements(this.xml,'edison.encrypted', 'edi-encrypted');
                    if (e2ee.length){
                        const payload=Utils.getSubLangText(e2ee[0], 'edison.encrypted', 'payload','payload');
                        return payload;
                    }
                    return {};
                }
            },
            payload: {
                get: function getPayload() {
                    const bodies = this.$payload;
                    return bodies['payload'] || '';
                }
            },
            $bodyext: {
                get: function getBodyext$() {
                    return Utils.getSubLangText(this.xml, '', 'bodyext', '');
                }
            },
            bodyext: {
                get: function getBodyext() {
                    var bodies = this.$bodyext;
                    return bodies[this.lang] || '';
                },
                set: function setBodyext(value) {
                    Utils.setSubLangText(this.xml, namespace, 'bodyext','', this.lang);
                    for (var key in value){
                        Utils.setAttribute(this.xml.children[1], key, value[key]);
                    }
                }
            },
            $e2ee: {
                get: function getE2ee$() {
                    //yazz debugger;
                    const e2ee=Utils.getElements(this.xml,'edi-e2ee', 'edi-e2ee');
                    if (e2ee.length){
                        try{
                            let user=Utils.getElements(e2ee[0],'edi-e2ee', 'user')[0];
                            let device=Utils.getElements(user,'edi-e2ee', 'device')[0];
                            if(device){
                                let key=Utils.getElements(device,'edi-e2ee', 'key')[0];
                                return {id:this.xml.getAttribute('id'),user:user.attrs.jid,device:device.attrs.id,key:key.children[0]};
                            }
                        }catch(e){
                            console.log('error',e);
                        }
                    }
                }
            },
            $received: {
                get: function getReceived$() {
                    //yazz debugger;
                    const received=Utils.getElements(this.xml,'urn:xmpp:receipts', 'received');
                    if (received.length){
                        try{
                            return {
                                id:received[0].getAttribute('id'),
                                ts:received[0].getAttribute('ts'),
                                status:received[0].getAttribute('status')
                            };
                        }catch(e){
                            console.log('error',e);
                        }
                    }
                }
            },
            ts:{
                get: function getTs(){
                    let type=Utils.getAttribute(this.xml, 'type');
                    if(!type||type!='chat'){return '';}
                    const bext=Utils.getElements(this.xml, 'jabber:client', 'bodyext');
                    try{
                        return Utils.getAttribute(bext[0], 'ts');
                    }catch(e){
                        console.log('error data',e);
                    }
                }
            },
            attention: Utils.boolSub(NS.ATTENTION_0, 'attention'),
            chatState: Utils.enumSub(NS.CHAT_STATES, [
                'active', 'composing', 'paused', 'inactive', 'gone'
            ]),
            replace: Utils.subAttribute(NS.CORRECTION_0, 'replace', 'id'),
            requestReceipt: Utils.boolSub(NS.RECEIPTS, 'request'),
            receipt: Utils.subAttribute(NS.RECEIPTS, 'received', 'id')
        }
    });
};


export default function (JXT) {

    internals.defineMessage(JXT, 'message', NS.CLIENT);
    internals.defineMessage(JXT, 'serverMessage', NS.SERVER);
    internals.defineMessage(JXT, 'componentMessage', NS.COMPONENT);
}
