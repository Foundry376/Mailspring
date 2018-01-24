class TestItem {
  getUri() {
    return 'test';
  }
}

exports.activate = () => AppEnv.workspace.addOpener(() => new TestItem());
