import {
  connectionEstablished,
  connectionBroken
} from '../../../actions/auth';

export const disconnected = connectionBroken;
export const sessionStarted = data => connectionEstablished(data);

export default {
  'session:started': sessionStarted,
  disconnected
};
