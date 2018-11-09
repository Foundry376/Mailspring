import { Namespace as NS } from 'xmpp-constants';
import { JID } from 'xmpp-jid';


export default function (JXT) {

    let Utils = JXT.utils;

    let MAMQuery = JXT.define({
        name: 'mam',
        namespace: NS.MAM_2,
        element: 'query',
        fields: {
            queryid: Utils.attribute('queryid'),
            node: Utils.attribute('node')
        }
    });

    let Result = JXT.define({
        name: 'mamItem',
        namespace: NS.MAM_2,
        element: 'result',
        fields: {
            queryid: Utils.attribute('queryid'),
            id: Utils.attribute('id')
        }
    });

    let Fin = JXT.define({
        name: 'mamResult',
        namespace: NS.MAM_2,
        element: 'fin',
        fields: {
            complete: Utils.boolAttribute('complete'),
            stable: Utils.boolAttribute('stable')
        }
    });

    let Prefs = JXT.define({
        name: 'mamPrefs',
        namespace: NS.MAM_2,
        element: 'prefs',
        fields: {
            defaultCondition: Utils.attribute('default'),
            always: {
                get: function () {

                    let results = [];
                    let container = Utils.find(this.xml, NS.MAM_2, 'always');
                    if (container.length === 0) {
                        return results;
                    }
                    container = container[0];
                    let jids = Utils.getMultiSubText(container, NS.MAM_2, 'jid');
                    jids.forEach(function (jid) {

                        results.push(new JID(jid.textContent));
                    });
                    return results;
                },
                set: function (value) {

                    if (value.length > 0) {
                        let container = Utils.findOrCreate(this.xml, NS.MAM_2, 'always');
                        Utils.setMultiSubText(container, NS.MAM_2, 'jid', value);
                    }
                }
            },
            never: {
                get: function () {

                    let results = [];
                    let container = Utils.find(this.xml, NS.MAM_2, 'always');
                    if (container.length === 0) {
                        return results;
                    }
                    container = container[0];
                    let jids = Utils.getMultiSubText(container, NS.MAM_2, 'jid');
                    jids.forEach(function (jid) {

                        results.push(new JID(jid.textContent));
                    });
                    return results;
                },
                set: function (value) {

                    if (value.length > 0) {
                        let container = Utils.findOrCreate(this.xml, NS.MAM_2, 'never');
                        Utils.setMultiSubText(container, NS.MAM_2, 'jid', value);
                    }
                }
            }
        }
    });


    JXT.extendMessage(Result);

    JXT.extendIQ(MAMQuery);
    JXT.extendIQ(Prefs);
    JXT.extendIQ(Fin);

    JXT.withDataForm(function (DataForm) {

        JXT.extend(MAMQuery, DataForm);
    });

    JXT.withDefinition('forwarded', NS.FORWARD_0, function (Forwarded) {

        JXT.extend(Result, Forwarded);
    });

    JXT.withDefinition('set', NS.RSM, function (RSM) {

        JXT.extend(MAMQuery, RSM);
        JXT.extend(Fin, RSM);
    });
}
