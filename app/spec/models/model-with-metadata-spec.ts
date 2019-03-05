import { ModelWithMetadata } from '../../src/flux/models/model-with-metadata';

class TestModel extends ModelWithMetadata {}

describe('ModelWithMetadata', function modelWithMetadata() {
  it('should initialize pluginMetadata to an empty array', () => {
    const model = new TestModel();
    expect(model.pluginMetadata).toEqual([]);
  });

  describe('metadataForPluginId', () => {
    beforeEach(() => {
      this.model = new TestModel();
      this.model.directlyAttachMetadata('plugin-id-a', { a: true });
      this.model.directlyAttachMetadata('plugin-id-b', { b: false });
    });
    it('returns the metadata value for the provided pluginId', () => {
      expect(this.model.metadataForPluginId('plugin-id-b')).toEqual({ b: false });
    });
    it('returns null if no value is found', () => {
      expect(this.model.metadataForPluginId('plugin-id-c')).toEqual(null);
    });
  });

  describe('metadataObjectForPluginId', () => {
    it('returns the metadata object for the provided pluginId', () => {
      const model = new TestModel();
      model.directlyAttachMetadata('plugin-id-a', { a: true });
      model.directlyAttachMetadata('plugin-id-b', { b: false });
      expect(model.metadataObjectForPluginId('plugin-id-a')).toEqual(model.pluginMetadata[0]);
      expect(model.metadataObjectForPluginId('plugin-id-b')).toEqual(model.pluginMetadata[1]);
      expect(model.metadataObjectForPluginId('plugin-id-c')).toEqual(undefined);
    });
  });

  describe('directlyAttachMetadata', () => {
    it('creates or updates the appropriate metadata object', () => {
      const model = new TestModel();
      expect(model.pluginMetadata.length).toEqual(0);

      // create new metadata object with correct value
      model.directlyAttachMetadata('plugin-id-a', { a: true });
      let obj = model.metadataObjectForPluginId('plugin-id-a');
      expect(model.pluginMetadata.length).toEqual(1);
      expect(obj.pluginId).toBe('plugin-id-a');
      expect(obj.id).toBe('plugin-id-a');
      expect(obj.version).toBe(1);
      expect(obj.value.a).toBe(true);

      // update existing metadata object
      model.directlyAttachMetadata('plugin-id-a', { a: false });
      obj = model.metadataObjectForPluginId('plugin-id-a');
      expect(obj.version).toBe(2);
      expect(obj.value.a).toBe(false);
    });
  });
});
