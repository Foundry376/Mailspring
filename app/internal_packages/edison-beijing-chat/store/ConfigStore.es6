import MailspringStore from 'mailspring-store';
import ConfigModel from '../model/Config';

class ConfigStore extends MailspringStore {
    constructor() {
        super();
        this.configs = null;
    }

    refreshConfigs = async () => {
        this.configs = {};
        const data = await ConfigModel.findAll();
        for (const item of data) {
            this.configs[item.key] = item;
        }
        this.trigger();
    }

    saveConfig(config) {
        if (config) {
            ConfigModel.upsert(config);
            this.configs[config.key] = config;
            // this.refreshConfigs();
        }
    }

    getConfigs = async () => {
        if (!this.configs) {
            await this.refreshConfigs();
        }
        return this.configs;
    }
    find = async (keys) => {
        if (!this.configs) {
            await this.refreshConfigs();
        }
        let items = [];
        if (keys) {
            for (const key of keys) {
                let item = this.configs[key];
                if (item) {
                    items.push(item);
                }
            }
        }
        return items;
    }
    findOne = async (key) => {
        if (!this.configs) {
            await this.refreshConfigs();
        }
        return this.configs[key];
    }
}

module.exports = new ConfigStore();
