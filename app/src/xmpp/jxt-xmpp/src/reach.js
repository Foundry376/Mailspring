import { Namespace as NS } from 'xmpp-constants';
import each from 'lodash.foreach';


export default function (JXT) {

    let Utils = JXT.utils;

    let ReachURI = JXT.define({
        name: '_reachAddr',
        namespace: NS.REACH_0,
        element: 'addr',
        fields: {
            uri: Utils.attribute('uri'),
            $desc: {
                get: function () {

                    return Utils.getSubLangText(this.xml, NS.REACH_0, 'desc', this.lang);
                }
            },
            desc: {
                get: function () {

                    let descs = this.$desc;
                    return descs[this.lang] || '';
                },
                set: function (value) {

                    Utils.setSubLangText(this.xml, NS.REACH_0, 'desc', value, this.lang);
                }
            }
        }
    });

    let reachability = {
        get: function () {

            let reach = Utils.find(this.xml, NS.REACH_0, 'reach');
            let results = [];
            if (reach.length) {
                let addrs = Utils.find(reach[0], NS.REACH_0, 'addr');
                each(addrs, function (addr) {

                    results.push(new ReachURI({}, addr));
                });
            }
            return results;
        },
        set: function (value) {

            let reach = Utils.findOrCreate(this.xml, NS.REACH_0, 'reach');
            Utils.setAttribute(reach, 'xmlns', NS.REACH_0);
            each(value, function (info) {

                let addr = new ReachURI(info);
                reach.appendChild(addr.xml);
            });
        }
    };


    JXT.withPubsubItem(function (Item) {

        JXT.add(Item, 'reach', reachability);
    });

    JXT.withPresence(function (Presence) {

        JXT.add(Presence, 'reach', reachability);
    });
}
