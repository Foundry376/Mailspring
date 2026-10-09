import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  LocalModelController,
  LocalModelMode,
  LocalModelProvider,
  MIN_FREE_BYTES_FOR_AUTO_DOWNLOAD,
  SystemModel,
} from '../src/browser/local-model';
import { ModelSpec } from '../src/browser/extraction-model';

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
    mode?: LocalModelMode;
    provider?: LocalModelProvider;
    autoStarted?: boolean;
    free?: number | null;
    override?: string;
    system?: SystemModel;
  } = {}
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-model-'));
  const config: any = {
    mode: opts.mode || 'auto',
    provider: opts.provider || 'auto',
    autoStarted: !!opts.autoStarted,
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
    getMode: () => config.mode,
    setMode: (m) => (config.mode = m),
    getProvider: () => config.provider,
    setProvider: (p) => (config.provider = p),
    getAutoStarted: () => config.autoStarted,
    setAutoStarted: () => (config.autoStarted = true),
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
  const writePartial = () => {
    fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'models', `${spec.fileName}.partial`), 'abc');
  };
  return { dir, config, controller, download, downloads, changes, setSystem, writePartial };
}

describe('LocalModelController', () => {
  it('starts the download the first time Views open, and only once', () => {
    const { controller, download, config } = setup();
    expect(controller.state().kind).toBe('not-downloaded');
    controller.viewsOpened();
    expect(download.callCount).toBe(1);
    expect(config.autoStarted).toBe(true);
    const state = controller.state() as any;
    expect(state.kind).toBe('downloading');
    expect(state.receivedBytes).toBe(4);
    expect(state.totalBytes).toBe(spec.size);
    controller.viewsOpened();
    expect(download.callCount).toBe(1);
  });

  it('becomes ready when the download finishes', async () => {
    const { controller, downloads } = setup();
    controller.viewsOpened();
    downloads[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.state().kind).toBe('ready');
    expect(controller.modelPath()).toContain(spec.fileName);
  });

  it("doesn't auto-start again after the user cancels, but resumes a partial download", () => {
    const { controller, download, writePartial } = setup({ autoStarted: true });
    controller.viewsOpened();
    expect(download.callCount).toBe(0);
    writePartial();
    controller.viewsOpened();
    expect(download.callCount).toBe(1);
  });

  it('cancels a download and deletes the partial file', () => {
    const { controller, dir, writePartial } = setup();
    controller.viewsOpened();
    writePartial();
    controller.cancel();
    expect(controller.state().kind).toBe('not-downloaded');
    expect(fs.existsSync(path.join(dir, 'models', `${spec.fileName}.partial`))).toBe(false);
  });

  it('turning it off persists, deletes files, reports bytes freed and blocks downloads', () => {
    const { controller, config, dir, download } = setup();
    fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'models', spec.fileName), Buffer.alloc(spec.size));
    expect(controller.state().kind).toBe('ready');
    expect(controller.setEnabled(false)).toEqual({ bytesFreed: spec.size });
    expect(config.mode).toBe('off');
    expect(controller.state().kind).toBe('disabled');
    expect(controller.modelPath()).toBe(null);
    controller.viewsOpened();
    controller.start({ force: true });
    expect(download.callCount).toBe(0);
    controller.setEnabled(true);
    expect(config.mode).toBe('auto');
    expect(download.callCount).toBe(1);
  });

  it("doesn't auto-start with little free disk, but Download Anyway does", () => {
    const { controller, download } = setup({ free: MIN_FREE_BYTES_FOR_AUTO_DOWNLOAD - 1 });
    controller.viewsOpened();
    expect(download.callCount).toBe(0);
    expect(controller.state().kind).toBe('insufficient-disk');
    controller.start({ force: true });
    expect(download.callCount).toBe(1);
  });

  it('treats a valid development override as ready and never downloads', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'override-')), 'm.gguf');
    fs.writeFileSync(file, Buffer.alloc(spec.size));
    const { controller, download } = setup({ override: file });
    const state = controller.state() as any;
    expect(state.kind).toBe('ready');
    expect(state.source).toBe('dev');
    controller.viewsOpened();
    controller.start({ force: true });
    expect(download.callCount).toBe(0);
    expect(controller.modelPath()).toBe(file);
  });

  it('reports a failed download and resumes on request', async () => {
    const { controller, downloads, download } = setup();
    controller.viewsOpened();
    downloads[0].reject(new Error('HTTP 503'));
    await Promise.resolve();
    const state = controller.state() as any;
    expect(state.kind).toBe('error');
    expect(state.message).toBe('HTTP 503');
    controller.start({ force: false });
    expect(download.callCount).toBe(2);
  });

  describe('with a system model', () => {
    it('uses the system model and never downloads', () => {
      const { controller, download } = setup({
        system: { available: true, name: 'Apple Intelligence' },
      });
      controller.viewsOpened();
      expect(controller.state()).toEqual({ kind: 'system', label: 'Apple Intelligence' });
      expect(download.callCount).toBe(0);
    });

    it('waits for the first availability check before deciding to download', () => {
      const { controller, download, setSystem } = setup({
        system: { available: false, reason: 'checking', name: 'AI' },
      });
      controller.viewsOpened();
      expect(controller.state().kind).toBe('checking');
      expect(download.callCount).toBe(0);
      setSystem({ available: false, reason: 'unsupportedOS', name: 'AI' });
      expect(download.callCount).toBe(1);
    });

    it("doesn't download while the system model prepares, or when Apple Intelligence is off", () => {
      const preparing = setup({
        system: { available: false, reason: 'modelNotReady', name: 'AI' },
      });
      preparing.controller.viewsOpened();
      expect(preparing.controller.state().kind).toBe('system-preparing');
      expect(preparing.download.callCount).toBe(0);

      const off = setup({
        system: { available: false, reason: 'appleIntelligenceNotEnabled', name: 'AI' },
      });
      off.controller.viewsOpened();
      expect(off.controller.state().kind).toBe('system-disabled');
      expect(off.download.callCount).toBe(0);
      off.controller.start({ force: false });
      expect(off.download.callCount).toBe(1);
    });

    it('can switch to the downloadable model and back', () => {
      const { controller, download, config, dir } = setup({
        system: { available: true, name: 'Apple Intelligence' },
      });
      controller.setProvider('qwen');
      expect(config.provider).toBe('qwen');
      expect(download.callCount).toBe(1);
      expect(controller.state().kind).toBe('downloading');
      controller.setProvider('auto');
      expect(controller.state().kind).toBe('system');
      fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'models', spec.fileName), Buffer.alloc(spec.size));
      expect(controller.deleteDownloaded()).toEqual({ bytesFreed: spec.size });
      expect(controller.status().bytesOnDisk).toBe(0);
    });
  });
});

describe('modelStatusForViews', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { modelStatusForViews } = require('../internal_packages/views/lib/local-model/store');
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
