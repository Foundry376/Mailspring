import { SUBMIT_AUTH, SUCCESS_AUTH, FAIL_AUTH, CONNECTION_BROKEN, CONNECTION_ESTABLISHED } from '../actions/auth';

const initialState = {
  isAuthenticating: false,
  currentUser: null
};

export default function authReducer(state = initialState, { type, payload }) {
  switch (type) {
    case SUBMIT_AUTH:
      return Object.assign({}, state, { isAuthenticating: true, currentUser: null });
    case SUCCESS_AUTH:
      return Object.assign({}, state, { isAuthenticating: false, currentUser: payload });
    case FAIL_AUTH:
      return Object.assign({}, state, { isAuthenticating: false, currentUser: null });
    case CONNECTION_BROKEN:
      return Object.assign({}, state, { online: false });
    case CONNECTION_ESTABLISHED:
      return Object.assign({}, state, { online: true });
    default:
      return state;
  }
}
