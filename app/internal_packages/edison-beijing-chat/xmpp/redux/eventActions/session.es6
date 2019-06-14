import {
  connectionEstablished,
  connectionBroken
} from '../../../chat-components/actions/auth';

export const disconnected = connectionBroken;
export const sessionStarted = data => connectionEstablished(data);

export default {
  'session:started': sessionStarted,
  disconnected
};
