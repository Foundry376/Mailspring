// File operations (like traversing directory trees) are extremely
// expensive. If any window traverses a tree once, we keep a cache of it
// on the backend process. That way any new windows don't need to spend
// their precious load time performing the same expensive operation.
export default class FileListCache {
  public imageData = '{}'; // A JSON stringified hash
  public packagePaths = [];
}
