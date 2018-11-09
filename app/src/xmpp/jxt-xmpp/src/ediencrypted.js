'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

//var _xmppConstants = require('xmpp-constants');

exports['default'] = function (jxt) {

    var helpers = jxt.utils;
    const ns='edison.encrypted';
  
    var EdiEncrypted = jxt.define({
        name: 'ediEncrypted',
        element: 'edi-encrypted',
        namespace:ns,
        fields: {
            text:helpers.text(),
            payload:helpers.textSub('','payload')
        }
    });
jxt.extendMessage(EdiEncrypted);

var MsgHeader=jxt.define({
    name: 'header',
    element: 'header',
    fields: {
        sid:helpers.attribute('sid'),
        $key: {
            get: function getBodyext$() {
                return helpers.getSubLangText(this.xml, '', 'key', '');
            }
        },
        key: {
            get: function getKey() {
                var bodies = this.$key;
                return bodies[this.lang] || '';
            },
            set: function setKey(value) {
                //console.log(value);
                for(let i=0;i<value.length;i++){
                    const k=value[i];
                    helpers.setSubLangText(this.xml, '', 'key','', this.lang);
                    if(!this.xml.children[i]){
                        this.xml.children[i]=helpers.createElement('','key')
                    }
                    helpers.setAttribute(this.xml.children[i], 'rid', k['rid']);
                    helpers.setAttribute(this.xml.children[i], 'kid', '1');
                    helpers.setAttribute(this.xml.children[i], 'uid', k['uid']);
                    helpers.setText(this.xml.children[i], k['text']);
                }
            }
        }
    }
});

jxt.extend(EdiEncrypted,MsgHeader);

};

module.exports = exports['default'];
//# sourceMappingURL=ediencrypted.js.map