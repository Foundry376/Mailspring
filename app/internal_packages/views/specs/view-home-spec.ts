import fs from 'fs';
import os from 'os';
import path from 'path';
import { installedViews, VIEW_ID_REGEXP } from '../lib/view-registry';
import { hasDraft } from '../lib/authoring/drafts';
import { listStarters, installStarter, startersDir } from '../lib/home/starters';
import { newViewId } from '../lib/home/agent-adapter';
import { removeView } from '../lib/home/view-actions';
import { thumbnailPath } from '../lib/home/thumbnails';

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
      const view = installedViews().find((v) => v.id === viewId);
      expect(view.source).toBe('installed');
      expect(view.name).toBe('Board');
      expect(view.json.id).toBe(viewId);
      expect(view.json.starter).toEqual({ id: 'kanban', version: '1.0.0' });
      expect(fs.readFileSync(path.join(view.dir, 'View.jsx'), 'utf8')).toBe(
        fs.readFileSync(path.join(startersDir(), 'kanban', 'View.jsx'), 'utf8')
      );
      expect(hasDraft(viewId)).toBe(false);
    });

    it('can install as a draft to try before keeping', function () {
      const viewId = installStarter(listStarters()[0], { asDraft: true });
      expect(hasDraft(viewId)).toBe(true);
      expect(fs.existsSync(path.join(configDir, 'views', viewId))).toBe(false);
    });
  });

  describe('removeView', function () {
    let dialog;

    beforeEach(function () {
      dialog = require('@electron/remote').dialog;
    });

    it('removes the installed copy, draft and thumbnail once confirmed', function () {
      const viewId = installStarter(listStarters()[0]);
      installStarter(listStarters()[0], { asDraft: true });
      fs.mkdirSync(path.dirname(thumbnailPath(viewId)), { recursive: true });
      fs.writeFileSync(thumbnailPath(viewId), 'png');

      spyOn(dialog, 'showMessageBoxSync').andReturn(0);
      const view = installedViews().find((v) => v.id === viewId);
      expect(removeView(view)).toBe(true);
      expect(installedViews().find((v) => v.id === viewId)).toBeUndefined();
      expect(fs.existsSync(thumbnailPath(viewId))).toBe(false);
    });

    it('does nothing when cancelled', function () {
      const viewId = installStarter(listStarters()[0]);
      spyOn(dialog, 'showMessageBoxSync').andReturn(1);
      expect(removeView(installedViews().find((v) => v.id === viewId))).toBe(false);
      expect(installedViews().find((v) => v.id === viewId)).toBeDefined();
    });
  });
});
