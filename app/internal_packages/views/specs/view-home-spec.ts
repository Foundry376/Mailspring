import fs from 'fs';
import os from 'os';
import path from 'path';
import { allViews, VIEW_ID_REGEXP } from '../lib/view-registry';
import { createUnbuiltView, saveCheckpoint } from '../lib/authoring/revisions';
import { isPinned, setPinned } from '../lib/nav/pins';
import { listStarters, installStarter, startersDir } from '../lib/home/starters';
import { newViewId } from '../lib/agent/store';
import { removeView } from '../lib/home/view-actions';
import { thumbnailPath } from '../lib/home/thumbnails';
import { AgentSessionStore } from '../lib/agent/store';

describe('Views home', function () {
  let configDir: string;

  beforeEach(function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'views-home-'));
    spyOn(AppEnv, 'getConfigDirPath').andReturn(configDir);
    spyOn(AppEnv, 'inDevMode').andReturn(false);
  });

  afterEach(function () {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  describe('newViewId', function () {
    it('derives a partition-safe id from the name, unique per call', function () {
      const a = newViewId('Uber & Lyft Rides!');
      const b = newViewId('Uber & Lyft Rides!');
      expect(VIEW_ID_REGEXP.test(a)).toBe(true);
      expect(a.startsWith('uber-lyft-rides')).toBe(true);
      expect(a).not.toEqual(b);
    });

    it('falls back to a generic slug for names with no usable characters', function () {
      expect(VIEW_ID_REGEXP.test(newViewId('✨✨'))).toBe(true);
    });
  });

  describe('starters', function () {
    it('ships the starters with descriptions, separate from dev examples', function () {
      const ids = listStarters().map((s) => s.id);
      ['kanban', 'newsletters', 'packages', 'people', 'rides'].forEach((id) =>
        expect(ids).toContain(id)
      );
      expect(ids).not.toContain('api-smoke');
      listStarters().forEach((s) => expect(s.description.length).toBeGreaterThan(0));
    });

    it('installs a copy under a new id that records where it came from', function () {
      const board = listStarters().find((s) => s.id === 'kanban');
      const viewId = installStarter(board);

      expect(viewId).not.toEqual('kanban');
      const view = allViews().find((v) => v.id === viewId);
      expect(view.source).toBe('user');
      expect(view.name).toBe('Board');
      expect(view.json.id).toBe(viewId);
      expect(view.json.starter).toEqual({ id: 'kanban', version: '1.0.0' });
      expect(fs.readFileSync(path.join(view.dir, 'View.jsx'), 'utf8')).toBe(
        fs.readFileSync(path.join(startersDir(), 'kanban', 'View.jsx'), 'utf8')
      );
      expect(isPinned(viewId)).toBe(false);
    });
  });

  describe('removeView', function () {
    let dialog;
    let clearStorageData: jasmine.Spy;

    beforeEach(function () {
      const remote = require('@electron/remote');
      dialog = remote.dialog;
      clearStorageData = jasmine.createSpy('clearStorageData').andReturn(Promise.resolve());
      spyOn(remote.session, 'fromPartition').andReturn({
        clearStorageData,
        clearCache: () => Promise.resolve(),
      });
      const config = {};
      spyOn(AppEnv.config, 'get').andCallFake((key) => config[key]);
      spyOn(AppEnv.config, 'set').andCallFake((key, value) => (config[key] = value));
      // Other specs leave the store configured with fakes.
      AgentSessionStore.configure({});
    });

    it("removes the View's files, checkpoints, thumbnail, pin and storage once confirmed", function () {
      const viewId = installStarter(listStarters()[0]);
      saveCheckpoint(viewId);
      setPinned(viewId, true);
      fs.mkdirSync(path.dirname(thumbnailPath(viewId)), { recursive: true });
      fs.writeFileSync(thumbnailPath(viewId), 'png');

      AppEnv.config.set('core.views.agentCode', { [viewId]: 'abc' });
      AppEnv.config.set('core.views.agentRevisions', { [viewId]: 4 });
      AppEnv.config.set('core.views.approvals', { [viewId]: { permissions: [], network: [] } });

      spyOn(dialog, 'showMessageBoxSync').andReturn(0);
      const view = allViews().find((v) => v.id === viewId);
      expect(removeView(view)).toBe(true);
      expect(AppEnv.config.get('core.views.agentCode')).toEqual({});
      expect(AppEnv.config.get('core.views.agentRevisions')).toEqual({});
      expect(AppEnv.config.get('core.views.approvals')).toEqual({});
      expect(allViews().find((v) => v.id === viewId)).toBeUndefined();
      expect(fs.existsSync(path.join(configDir, 'views-checkpoints', viewId))).toBe(false);
      expect(fs.existsSync(thumbnailPath(viewId))).toBe(false);
      expect(isPinned(viewId)).toBe(false);
      expect(clearStorageData).toHaveBeenCalled();
    });

    it('removes a View the agent never built', function () {
      const viewId = newViewId('Board');
      createUnbuiltView(viewId, 'Board');
      spyOn(dialog, 'showMessageBoxSync').andReturn(0);
      expect(removeView(allViews().find((v) => v.id === viewId))).toBe(true);
      expect(fs.existsSync(path.join(configDir, 'views', viewId))).toBe(false);
    });

    it('does nothing when cancelled', function () {
      const viewId = installStarter(listStarters()[0]);
      spyOn(dialog, 'showMessageBoxSync').andReturn(1);
      expect(removeView(allViews().find((v) => v.id === viewId))).toBe(false);
      expect(allViews().find((v) => v.id === viewId)).toBeDefined();
    });
  });
});
