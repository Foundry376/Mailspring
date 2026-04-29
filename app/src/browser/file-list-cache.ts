// Image data from expensive directory traversals is cached here in the main
// process so renderer windows don't repeat the same work on load.
export default class FileListCache {
  public imageData = '{}'; // A JSON stringified hash
}
