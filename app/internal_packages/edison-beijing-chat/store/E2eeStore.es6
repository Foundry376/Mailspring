import MailspringStore from 'mailspring-store';
import E2eeModel from '../model/E2ee';
// import xmpp from '../chat-components/xmpp';

class E2eeStore extends MailspringStore {
    constructor() {
        super();
        this.e2ees = null;
    }

    refreshE2ees = async () => {
        this.e2ees = {};
        const data = await E2eeModel.findAll();
        for (const item of data) {
            item.devices = JSON.parse(item.devices);
            this.e2ees[item.jid] = item;
        }
        this.trigger();
    }

    saveE2ees = (e2ees) => {
        if (!e2ees || !e2ees.e2ee) { return; }
        let { e2ee: { users } } = e2ees;
        if (users) {
            for (const user of users) {
                E2eeModel.upsert({ jid: user.jid, devices: JSON.stringify(user.devices) });
            }
            this.refreshE2ees();
        }
    }

    getE2ees = async () => {
        if (!this.e2ees) {
            await this.refreshE2ees();
        }
        return this.e2ees;
    }
    find = async (jids) => {
        if (!this.e2ees) {
            await this.refreshE2ees();
        }
        let items = [];
        if (jids) {
            for (const jid of jids) {
                let item = this.e2ees[jid];
                if (item) {
                    items.push(item);
                }
            }
        }
        return items;
    }
    findOne = async (jid) => {
        if (!this.e2ees) {
            await this.refreshE2ees();
        }
        return this.e2ees[jid];
    }
}

module.exports = new E2eeStore();
