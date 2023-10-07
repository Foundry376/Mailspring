import MailspringStore from "mailspring-store";

const configCredentialsKey = 'credentials';
const configCredentialsMigratedKey = 'credentialsMigratedFromKeytar';

class _CredentialStore extends MailspringStore {
    constructor() {
        super();
    }

    set = (credentials) => {
        AppEnv.config.set(configCredentialsKey, credentials);
    }

    get = () => {
        const credentials = AppEnv.config.get(configCredentialsKey);
        return credentials
    }

    isMigrated = () => {
        const result = AppEnv.config.get(configCredentialsMigratedKey) || false
        return result;
    }

    setMigrated = () => {
        AppEnv.config.set(configCredentialsMigratedKey, 'true');
    }
}

export const CredentialStore = new _CredentialStore();