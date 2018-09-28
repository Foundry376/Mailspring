export const SET_REFERENCE_TIME = 'SET_REFERENCE_TIME';
export const UPDATE_REFERENCE_TIME = 'UPDATE_REFERENCE_TIME';

export const setReferenceTime = () => ({ type: SET_REFERENCE_TIME });

export const updateReferenceTime = time => ({ type: UPDATE_REFERENCE_TIME, payload: time });
