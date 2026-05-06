import Config from '../config';

export default class ConfigMigrator {
  config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  migrate() {}
}
