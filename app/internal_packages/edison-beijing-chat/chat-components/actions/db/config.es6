// Config storage
export const BEGIN_STORE_CONFIG = 'BEGIN_STORE_CONFIG';
export const SUCCESS_STORE_CONFIG = 'SUCCESS_STORE_CONFIG';
export const FAIL_STORE_CONFIG = 'FAIL_STORE_CONFIG';

// Config storage
export const storeConfig = config => ({ type: BEGIN_STORE_CONFIG, payload: config });

export const successfullyStoredConfig = config =>
    ({ type: SUCCESS_STORE_CONFIG, payload: config });

export const failedStoringConfig = (error, config) =>
    ({ type: FAIL_STORE_CONFIG, payload: { error, config } });