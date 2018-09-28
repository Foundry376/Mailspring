import { UPDATE_REFERENCE_TIME } from '../actions/time';

const initialState = new Date().getTime();

export default function timeReducer(state = initialState, { type, payload }) {
  switch (type) {
    case UPDATE_REFERENCE_TIME:
      return payload;
    default:
      return state;
  }
}
