import crypto from 'crypto';
import { canonicalJSON } from '../lib/agent/signing';

/** A throwaway Ed25519 pair that signs Views the way the backend does. */
export function keypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    sign: ({ manifest, files }: { manifest: object; files: object }) =>
      crypto
        .sign(null, Buffer.from(canonicalJSON({ manifest, files }), 'utf8'), privateKey)
        .toString('base64'),
  };
}
