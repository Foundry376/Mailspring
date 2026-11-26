import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  LocalModelController,
  LocalModelProvider,
  MIN_FREE_BYTES_FOR_AUTO_DOWNLOAD,
  SystemModel,
  removeModelFiles,
} from '../src/browser/local-model';
import { ModelSpec } from '../src/browser/local-ai-model';

const spec: ModelSpec = {
  id: 'test',
  label: 'Test Model',
  fileName: 'test.gguf',
  url: 'https://example.invalid/test.gguf',
  size: 10,
  sha256: 'unused',
};

function setup(
  opts: {
    enabled?: boolean;
    backend?: 'local' | 'remote';
    provider?: LocalModelProvider;
    free?: number | null;
    override?: string;
    system?: SystemModel;
  } = {}
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-model-'));
  const config: any = {
    enabled: opts.enabled !== false,
    backend: opts.backend || 'local',
    provider: opts.provider || 'auto',
  };
  let system: SystemModel = opts.system || {
    available: false,
    reason: 'helperMissing',
    name: 'AI',
  };
  const downloads: { resolve: () => void; reject: (e: Error) => void; signal: AbortSignal }[] = [];
  const download = jasmine.createSpy('download').andCallFake((configDir, onProgress, o) => {
    return new Promise<string>((resolve, reject) => {
      downloads.push({
        signal: o.signal,
        resolve: () => {
          const models = path.join(configDir, 'models');
          fs.mkdirSync(models, { recursive: true });
          fs.writeFileSync(path.join(models, spec.fileName), Buffer.alloc(spec.size));
          resolve(path.join(models, spec.fileName));
        },
        reject,
      });
      o.signal.addEventListener('abort', () => reject(new Error('aborted')));
      onProgress({ received: 4, total: spec.size });
    });
  });
  const changes = [];
  const controller = new LocalModelController({
    configDirPath: dir,
    spec,
    isEnabled: () => config.enabled,
    isActive: () => config.enabled && config.backend === 'local',
    getProvider: () => config.provider,
    getOverridePath: () => opts.override,
    freeBytes: () => (opts.free === undefined ? 50e9 : opts.free),
    download: download as any,
    detectSystem: () => system,
    onChange: (s) => changes.push(s),
  });
  const setSystem = (s: SystemModel) => {
    system = s;
    controller.systemChanged();
  };
  const modelFile = path.join(dir, 'models', spec.fileName);
  const partialFile = `${modelFile}.partial`;
  const writeModel = () => {
    fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
    fs.writeFileSync(modelFile, Buffer.alloc(spec.size));
  };
  const writePartial = () => {
    fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
    fs.writeFileSync(partialFile, 'abc');
  };
  const change = (next: Partial<typeof config>) => {
    Object.assign(config, next);
    controller.reconcile({ startDownload: true });
  };
  return {
    dir,
    config,
    controller,
    download,
    downloads,
    changes,
    setSystem,
    writeModel,
    writePartial,
    modelFile,
    partialFile,
    change,
  };
}

describe('LocalModelController', () => {
  it('downloads nothing while AI is off', () => {
    const { controller, download } = setup({ enabled: false });
    controller.reconcile({ startDownload: true });
    controller.start({ force: true });
    expect(controller.state().kind).toBe('disabled');
    expect(download.callCount).toBe(0);
  });

  it('starts the download when AI is turned on, and only once', () => {
    const { controller, download, change } = setup({ enabled: false });
    change({ enabled: true });
    expect(download.callCount).toBe(1);
    const state = controller.state() as any;
    expect(state.kind).toBe('downloading');
    expect(state.receivedBytes).toBe(4);
    expect(state.totalBytes).toBe(spec.size);
    change({});
    expect(download.callCount).toBe(1);
  });

  it('becomes ready when the download finishes', async () => {
    const { controller, downloads, change } = setup({ enabled: false });
    change({ enabled: true });
    downloads[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.state().kind).toBe('ready');
    expect(controller.modelPath()).toContain(spec.fileName);
  });

  it('at launch, resumes a partial download but starts no new one', () => {
    const { controller, download, writePartial } = setup();
    controller.reconcile({ startDownload: false });
    expect(download.callCount).toBe(0);
    expect(controller.state().kind).toBe('not-downloaded');
    writePartial();
    controller.reconcile({ startDownload: false });
    expect(download.callCount).toBe(1);
  });

  it('cancels a download and deletes the partial file', () => {
    const { controller, change, writePartial, partialFile } = setup({ enabled: false });
    change({ enabled: true });
    writePartial();
    controller.cancel();
    expect(controller.state().kind).toBe('not-downloaded');
    expect(fs.existsSync(partialFile)).toBe(false);
  });

  it('turning AI off stops the download and deletes the model', () => {
    const { controller, change, writeModel, writePartial, modelFile, partialFile, downloads } =
      setup();
    writeModel();
    expect(controller.state().kind).toBe('ready');
    change({ enabled: false });
    expect(controller.state().kind).toBe('disabled');
    expect(controller.modelPath()).toBe(null);
    expect(fs.existsSync(modelFile)).toBe(false);

    change({ enabled: true });
    writePartial();
    change({ enabled: false });
    expect(downloads[0].signal.aborted).toBe(true);
    expect(fs.existsSync(partialFile)).toBe(false);
  });

  it('a remote backend stops the download but keeps a finished model', () => {
    const { controller, change, writeModel, modelFile, downloads } = setup({ enabled: false });
    change({ enabled: true });
    change({ backend: 'remote' });
    expect(downloads[0].signal.aborted).toBe(true);
    expect(controller.state().kind).toBe('disabled');
    writeModel();
    change({});
    expect(fs.existsSync(modelFile)).toBe(true);
  });

  it("doesn't start with little free disk, but Download Anyway does", () => {
    const { controller, download, change } = setup({
      enabled: false,
      free: MIN_FREE_BYTES_FOR_AUTO_DOWNLOAD - 1,
    });
    change({ enabled: true });
    expect(download.callCount).toBe(0);
    expect(controller.state().kind).toBe('insufficient-disk');
    controller.start({ force: true });
    expect(download.callCount).toBe(1);
  });

  it('treats a valid development override as ready and never downloads', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'override-')), 'm.gguf');
    fs.writeFileSync(file, Buffer.alloc(spec.size));
    const { controller, download, change } = setup({ override: file });
    const state = controller.state() as any;
    expect(state.kind).toBe('ready');
    expect(state.source).toBe('dev');
    change({});
    controller.start({ force: true });
    expect(download.callCount).toBe(0);
    expect(controller.modelPath()).toBe(file);
    change({ enabled: false });
    expect(fs.existsSync(file)).toBe(true);
  });

  it('reports a failed download and resumes on request', async () => {
    const { controller, downloads, download, change } = setup({ enabled: false });
    change({ enabled: true });
    downloads[0].reject(new Error('HTTP 503'));
    await Promise.resolve();
    const state = controller.state() as any;
    expect(state.kind).toBe('error');
    expect(state.message).toBe('HTTP 503');
    controller.start({ force: false });
    expect(download.callCount).toBe(2);
  });

  it('removeModelFiles deletes a model left on disk', () => {
    const { dir, writeModel, writePartial, modelFile, partialFile } = setup({ enabled: false });
    writeModel();
    writePartial();
    removeModelFiles(dir, spec);
    expect(fs.existsSync(modelFile)).toBe(false);
    expect(fs.existsSync(partialFile)).toBe(false);
  });

  describe('with a system model', () => {
    it('uses the system model and never downloads', () => {
      const { controller, download, change } = setup({
        enabled: false,
        system: { available: true, name: 'Apple Intelligence' },
      });
      change({ enabled: true });
      expect(controller.state()).toEqual({ kind: 'system', label: 'Apple Intelligence' });
      expect(download.callCount).toBe(0);
    });

    it('waits for the first availability check before deciding to download', () => {
      const { controller, download, setSystem, change } = setup({
        enabled: false,
        system: { available: false, reason: 'checking', name: 'AI' },
      });
      change({ enabled: true });
      expect(controller.state().kind).toBe('checking');
      expect(download.callCount).toBe(0);
      setSystem({ available: false, reason: 'unsupportedOS', name: 'AI' });
      expect(download.callCount).toBe(1);
    });

    it("doesn't download while the system model prepares, or when Apple Intelligence is off", () => {
      const preparing = setup({
        enabled: false,
        system: { available: false, reason: 'modelNotReady', name: 'AI' },
      });
      preparing.change({ enabled: true });
      expect(preparing.controller.state().kind).toBe('system-preparing');
      expect(preparing.download.callCount).toBe(0);

      const off = setup({
        enabled: false,
        system: { available: false, reason: 'appleIntelligenceNotEnabled', name: 'AI' },
      });
      off.change({ enabled: true });
      expect(off.controller.state().kind).toBe('system-disabled');
      expect(off.download.callCount).toBe(0);
      off.controller.start({ force: false });
      expect(off.download.callCount).toBe(1);
    });

    it('can switch to the downloadable model and back', () => {
      const { controller, download, change, writeModel } = setup({
        system: { available: true, name: 'Apple Intelligence' },
      });
      change({ provider: 'qwen' });
      expect(download.callCount).toBe(1);
      expect(controller.state().kind).toBe('downloading');
      change({ provider: 'auto' });
      expect(controller.state().kind).toBe('system');
      writeModel();
      expect(controller.deleteDownloaded()).toEqual({ bytesFreed: spec.size });
      expect(controller.status().bytesOnDisk).toBe(0);
    });
  });
});

describe('modelStatusForViews', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { modelStatusForViews } = require('../internal_packages/views/lib/local-model/view-status');
  const status = (state) => ({
    state,
    provider: 'auto',
    system: { available: false, name: 'AI' },
    bytesOnDisk: 0,
  });

  it('tells Views why AI results are missing', () => {
    expect(
      modelStatusForViews(status({ kind: 'ready', label: 'Q', sizeBytes: 1, source: 'downloaded' }))
    ).toEqual({
      modelStatus: 'ready',
    });
    expect(modelStatusForViews(status({ kind: 'system', label: 'AI' })).modelStatus).toBe('ready');
    expect(
      modelStatusForViews(
        status({ kind: 'downloading', label: 'Q', receivedBytes: 25, totalBytes: 100 })
      )
    ).toEqual({ modelStatus: 'model_downloading', modelProgress: 0.25 });
    expect(
      modelStatusForViews(status({ kind: 'disabled', label: 'Q', totalBytes: 1 })).modelStatus
    ).toBe('model_off');
    expect(modelStatusForViews(status({ kind: 'system-preparing', label: 'AI' })).modelStatus).toBe(
      'model_unavailable'
    );
    expect(modelStatusForViews(null).modelStatus).toBe('model_unavailable');
  });
});
