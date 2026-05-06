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
      this.loadPaths.push(path.resolve(path.join(configDirPath, 'dev', 'packages')));
    }
    this.loadPaths.push(path.resolve(path.join(configDirPath, 'packages')));
    this.loadPaths.push(path.resolve(path.join(resourcePath, 'internal_packages')));

    this.registerProtocol();
  }

  // Creates the 'Mailspring' custom protocol handler.
  registerProtocol() {
    const scheme = 'mailspring';

    protocol.handle(scheme, (request) => {
      const relativePath = path.normalize(request.url.substr(scheme.length + 1));

      let filePath = null;
      for (const loadPath of this.loadPaths) {
        // Use path.join (not path.resolve) so absolute-looking inputs like
        // "/foo" stay anchored to the load path instead of replacing it.
        const candidate = path.resolve(path.join(loadPath, relativePath));
        // Ensure the resolved path is contained within the load path.
        // Append path.sep to prevent prefix-matching attacks (e.g. /packages-evil/).
        if (candidate !== loadPath && !candidate.startsWith(loadPath + path.sep)) {
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

      if (filePath) {
        return new Response(fs.readFileSync(filePath), { status: 200 });
      } else {
        return new Response('Not Found', { status: 404 });
      }
    });
  }
}
