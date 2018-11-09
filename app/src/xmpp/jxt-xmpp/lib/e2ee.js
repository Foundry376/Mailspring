'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

//var _xmppConstants = require('xmpp-constants');

exports['default'] = function (JXT) {

    var Utils = JXT.utils;
    const ns='edi-e2ee';
    var E2ee = JXT.define({
        name: 'e2ee',
        namespace: ns,
        element: 'edi-e2ee',
        fields: {
            ts:Utils.attribute('ts'),
            text:Utils.text(),
            //jidSub:Utils.multiSubAttribute('','user','jid')
            users:{
                get: function getUsers(){
                    const us=Utils.getElements(this.xml, ns, 'user');
                    let lst=[];
                    if (us.length){
                        for(let i=0;i<us.length;i++){
                            let u=us[i];
                            let user={jid: u.getAttribute('jid')};
                            let ds=Utils.getElements(u, ns, 'device');
                            user.devices=[];
                            if(ds.length){
                                for(let j=0;j<ds.length;j++){
                                    let d=ds[j];
                                    user.devices[j]={
                                        id:d.getAttribute('id'),
                                        key:Utils.getSubLangText(d, ns, 'key', 'key')['key']
                                    };
                                }
                            }

                            lst.push(user);
                        }
                    }
                    return lst;
                },
                set:function setUsers(value){
                    Utils.setSubAttribute(this.xml, ns, 'edi-e2ee');//,value, this.lang);
                    if(value){
                        let child=this.xml;
                        Utils.setSubAttribute(child, '', 'user','jid', value.jid);

                        child=child.children[0];
                        Utils.setSubAttribute(child, '', 'device','id', value.did);
                        
                        child=child.children[0];
                        Utils.setSubAttribute(child, '', 'key','id', '1');
                        child=child.children[0];
                        Utils.setText(child,value.key);
                    }
                }
            }
        }
    });
    JXT.extendIQ(E2ee);

    // var User=JXT.define({
    //     name: 'user',
    //     element: 'user',
    //     fields: {
    //         jid:Utils.attribute('jid'),
    //         text:Utils.text(),
    //     }
    // });
    // debugger;
    // JXT.extend(E2ee, User, 'items');
    // JXT.extendIQ(E2ee);
    
    // var Device = JXT.define({
    //     name:'device',
    //     element:'device',
    //     fields:{
    //         id:Utils.attribute('id'),
    //         text:Utils.text(),
    //     }
    // });
    // JXT.extend(User, Device);
    
    // var Key =JXT.define({
    //     name:'key',
    //     element:'key',
    //     fields:{
    //         id:Utils.attribute('id'),
    //         text:Utils.text(),
    //     }
    // });
    // JXT.extend(Device, Key);
};

module.exports = exports['default'];
//# sourceMappingURL=e2ee.js.map