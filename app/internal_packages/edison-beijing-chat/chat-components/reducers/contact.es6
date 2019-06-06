import { CONNECTION_BROKEN } from '../actions/auth';
import _ from 'underscore';

const initialState = {
  availableUsers: [],
};

export default function contactReducer(state = initialState, { type, payload }) {
  switch (type) {
    case CONNECTION_BROKEN:
      return Object.assign({}, state, { availableUsers: [] });
    default:
      return state;
  }
}
