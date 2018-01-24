const ExtensionRegistry = require('../../src/registries/extension-registry');

class TestExtension {}

describe('ExtensionRegistry', function() {
  beforeEach(function() {
    this.registry = new ExtensionRegistry.Registry('Test');
    spyOn(this.registry, 'triggerDebounced');
  });

  describe('Registry', function() {
    it('has trigger and listen to defined', function() {
      expect(this.registry.trigger).toBeDefined();
      expect(this.registry.listen).toBeDefined();
      expect(this.registry.listenTo).toBeDefined();
    });

    describe('register', function() {
      it('throws an exception if extension not passed', function() {
        expect(() => this.registry.register(null)).toThrow();
      });

      it('throws an exception if extension does not have a name', function() {
        expect(() => this.registry.register({})).toThrow();
      });

      it('throws an exception if extension is array', function() {
        expect(() => this.registry.register([])).toThrow();
      });

      it('throws an exception if extension is string', function() {
        expect(() => this.registry.register('')).toThrow();
      });

      it('returns itself', function() {
        expect(this.registry.register(TestExtension)).toBe(this.registry);
      });

      it('registers extension and triggers', function() {
        this.registry.register(TestExtension);
        expect(this.registry.extensions().length).toEqual(1);
        expect(this.registry.triggerDebounced).toHaveBeenCalled();
      });

      it('does not add extensions with the same name', function() {
        expect(this.registry.extensions().length).toEqual(0);
        this.registry.register(TestExtension);
        expect(() => this.registry.register({ name: 'TestExtension' })).toThrow();
      });
    });

    describe('unregister', function() {
      it('unregisters the extension if it exists', function() {
        this.registry.register(TestExtension);
        this.registry.unregister(TestExtension);
        expect(this.registry.extensions().length).toEqual(0);
      });

      it('throws if invalid extension passed', function() {
        expect(() => this.registry.unregister('Test')).toThrow();
        expect(() => this.registry.unregister(null)).toThrow();
        expect(() => this.registry.unregister([])).toThrow();
        expect(() => this.registry.unregister({})).toThrow();
      });
    });
  });
});
