// Contact storage
export const BEGIN_STORE_CONTACTS = 'BEGIN_STORE_CONTACTS';
export const SUCCESS_STORE_CONTACTS = 'SUCCESS_STORE_CONTACTS';
export const FAIL_STORE_CONTACTS = 'FAIL_STORE_CONTACTS';

// Contact retrieval
export const RETRIEVE_STORED_CONTACTS = 'RETRIEVE_STORED_CONTACTS';
export const FAIL_RETRIEVE_STORED_CONTACTS = 'FAIL_RETRIEVE_STORED_CONTACTS';
export const UPDATE_STORED_CONTACTS = 'UPDATE_STORED_CONTACTS';

export const BEGIN_STORE_E2EES = 'BEGIN_STORE_E2EES';
export const SUCCESS_STORE_E2EES = 'SUCCESS_STORE_E2EES';
export const FAIL_STORE_E2EES = 'FAIL_STORE_E2EES';

// Contact storage
export const storeContacts = contacts => ({ type: BEGIN_STORE_CONTACTS, payload: contacts });

export const storeE2ees = e2ees => ({ type: BEGIN_STORE_E2EES, payload: e2ees });

export const successfullyStoredContacts = contacts =>
  ({ type: SUCCESS_STORE_CONTACTS, payload: contacts });

export const successfullyStoredE2ees = e2ees =>
  ({ type: SUCCESS_STORE_E2EES, payload: e2ees });

export const failedStoringContacts = (error, contacts) =>
  ({ type: FAIL_STORE_CONTACTS, payload: { error, contacts } });

export const failedStoringE2ees = (error, e2ees) =>
  ({ type: FAIL_STORE_E2EES, payload: { error, e2ees } });

// Contact retrieval
export const retrieveContacts = () => ({ type: RETRIEVE_STORED_CONTACTS });

export const failedRetrievingContacts = error =>
  ({ type: FAIL_RETRIEVE_STORED_CONTACTS, payload: error });

export const updateStoredContacts = contacts => {
  console.log('updateStoredContacts', contacts);
  return ({ type: UPDATE_STORED_CONTACTS, payload: contacts });
}

