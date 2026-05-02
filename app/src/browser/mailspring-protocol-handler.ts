import { protocol } from 'electron';
import fs from 'fs';
import path from 'path';

// Handles requests with 'mailspring' protocol.
//
// It's created by {Application} upon instantiation and is used to create a
// custom resource loader for 'mailspring://' URLs.
//
// The following directories are searched in order:
//   * <config-dir>/assets
//   * <config-dir>/dev/packages (unless in safe mode)
//   * <config-dir>/packages
//   * RESOURCE_PATH/node_modules
//
export default class MailspringProtocolHandler {
  loadPaths: string[] = [];

  constructor({ configDirPath, resourcePath, safeMode }) {
    if (!safeMode) {
      this.loadPaths.push(path.join(configDirPath, 'dev', 'packages'));
    }
    this.loadPaths.push(path.join(configDirPath, 'packages'));
    this.loadPaths.push(path.join(resourcePath, 'internal_packages'));

    this.registerProtocol();
  }

  // Creates the 'Mailspring' custom protocol handler.
  registerProtocol() {
    const scheme = 'mailspring';
    protocol.registerFileProtocol(scheme, (request, callback) => {
      const relativePath = path.normalize(request.url.substr(scheme.length + 1));

      let filePath = null;
      for (const loadPath of this.loadPaths) {
        const resolvedBase = path.resolve(loadPath);
        // Use path.join (not path.resolve) so absolute-looking inputs like
        // "/foo" stay anchored to the load path instead of replacing it.
        const candidate = path.resolve(path.join(resolvedBase, relativePath));
        // Ensure the resolved path is contained within the load path.
        // Append path.sep to prevent prefix-matching attacks (e.g. /packages-evil/).
        if (candidate !== resolvedBase && !candidate.startsWith(resolvedBase + path.sep)) {
          continue;
        }
        let fileStats: fs.Stats | false = false;
        try {
          fileStats = fs.statSync(candidate);
        } catch (e) {
          // path doesn't exist
        }
        if (fileStats && fileStats.isFile && fileStats.isFile()) {
          filePath = candidate;
          break;
        }
      }

      callback(filePath);
    });
  }
}
