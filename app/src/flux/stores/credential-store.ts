import MailspringStore from "mailspring-store";

const configCredentialsKey = 'credentials'

class _CredentialStore extends MailspringStore {
    private _cache: string;

    constructor() {
        super();
    }

    set = (credentials) => {
        this._cache = credentials;
        console.log('Stored Encrypted Credentials: ', credentials)
        AppEnv.config.set(configCredentialsKey, credentials);
    }

    get = () => {
        if (this._cache != undefined) {
            console.log('Returned Cached Credentials: ', this._cache);
            return this._cache
        }
        const credentials = AppEnv.config.get(configCredentialsKey);
        console.log('Retrieved Encrypted Credentials: ', credentials)
        return credentials
    }
}

export const CredentialStore = new _CredentialStore();