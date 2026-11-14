import AIStore, { AIBackend, LocalBackend } from '../../src/flux/stores/ai-store';
import LocalModelStore from '../../src/flux/stores/local-model-store';

const SUMMARIES = {
  id: 'spec-summaries',
  displayName: 'Summaries',
  description: 'One line per message',
  requires: ['summarize' as const],
};

const DRAFTING = {
  id: 'spec-drafting',
  displayName: 'Drafting',
  description: 'Write replies',
  requires: ['draft' as const],
};

function remoteBackend(): AIBackend {
  return {
    id: 'spec-remote',
    displayName: 'Remote',
    remote: true,
    capabilities: new Set(['summarize', 'draft'] as const),
    prepare: jasmine.createSpy('prepare'),
    run: () => Promise.resolve([]),
    cancel: () => Promise.resolve(0),
  };
}

describe('AIStore', function () {
  let config: { [key: string]: any };
  let backend: AIBackend;

  beforeEach(function () {
    config = {};
    backend = remoteBackend();
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => config[key]);
    spyOn(AppEnv.config, 'set').andCallFake((key: string, value: any) => {
      config[key] = value;
    });
    spyOn(LocalModelStore, 'prepare').andReturn(Promise.resolve());
    AIStore.registerFeature(SUMMARIES);
    AIStore.registerFeature(DRAFTING);
  });

  afterEach(function () {
    AIStore.unregisterFeature(SUMMARIES.id);
    AIStore.unregisterFeature(DRAFTING.id);
    AIStore.unregisterBackend(backend.id);
  });

  describe('isFeatureOn', function () {
    it('is off until the user turns AI features on', function () {
      expect(AIStore.isFeatureOn(SUMMARIES.id)).toBe(false);
      AIStore.setEnabled(true);
      expect(AIStore.isFeatureOn(SUMMARIES.id)).toBe(true);
    });

    it('respects the switch for a single feature', function () {
      AIStore.setEnabled(true);
      AIStore.setFeatureEnabled(SUMMARIES.id, false);
      expect(AIStore.isFeatureOn(SUMMARIES.id)).toBe(false);
    });

    it("is off when the selected backend can't do what the feature needs", function () {
      AIStore.setEnabled(true);
      expect(AIStore.isFeatureOn(DRAFTING.id)).toBe(false);
      expect(AIStore.features().map((f) => f.id)).not.toContain(DRAFTING.id);

      AIStore.registerBackend(backend);
      AIStore.setBackend(backend.id);
      expect(AIStore.isFeatureOn(DRAFTING.id)).toBe(true);
      expect(AIStore.features().map((f) => f.id)).toContain(DRAFTING.id);
    });

    it('is off for features nobody registered', function () {
      AIStore.setEnabled(true);
      expect(AIStore.isFeatureOn('not-registered')).toBe(false);
    });
  });

  describe('backend', function () {
    it('falls back to the on-device backend when the selected one is not installed', function () {
      config['core.ai.backend'] = 'uninstalled';
      expect(AIStore.backend()).toBe(LocalBackend);
    });

    it('prepares the backend when AI features are turned on', function () {
      AIStore.registerBackend(backend);
      AIStore.setBackend(backend.id);
      expect(backend.prepare).not.toHaveBeenCalled();
      AIStore.setEnabled(true);
      expect(backend.prepare).toHaveBeenCalled();
    });

    it('keeps the on-device backend registered', function () {
      AIStore.unregisterBackend(LocalBackend.id);
      expect(AIStore.backends()).toContain(LocalBackend);
    });
  });

  describe('run on the on-device backend', function () {
    it('renders each item as a chat prompt for the local model', function () {
      spyOn(LocalModelStore, 'run').andReturn(Promise.resolve([]));
      AIStore.run({
        ownerId: 'spec',
        priority: 1,
        promptKey: 'spec-v1',
        system: 'Summarize.',
        jsonSchema: null,
        items: [{ id: 'm1', user: 'Hello' }],
      });
      const req = (LocalModelStore.run as jasmine.Spy).mostRecentCall.args[0];
      expect(req.ownerId).toBe('spec');
      expect(req.promptKey).toBe('spec-v1');
      expect(req.items[0].id).toBe('m1');
      expect(req.items[0].prompt).toContain('<|im_start|>system\nSummarize.<|im_end|>');
      expect(req.items[0].prompt).toContain('<|im_start|>user\nHello<|im_end|>');
    });
  });
});
