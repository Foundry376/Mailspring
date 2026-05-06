import fs from 'fs';
import * as Utils from './flux/models/utils';

export function atomicWriteFileSync(filepath: string, content: string) {
  const randomId = Utils.generateTempId();
  const backupPath = `${filepath}.${randomId}.bak`;
  fs.writeFileSync(backupPath, content);
  fs.renameSync(backupPath, filepath);
}
