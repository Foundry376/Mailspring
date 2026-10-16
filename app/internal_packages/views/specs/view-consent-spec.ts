import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeDraft, promoteDraft, discardDraft } from '../lib/authoring/drafts';
import {
  approveView,
  declineView,
  narrowApprovalToCurrent,
  unapprovedGrants,
  waitForConsent,
} from '../lib/consent';
import { grantForView } from '../lib/bridge/grant';
import { installedViews } from '../lib/view-registry';
import * as credentials from '../lib/credentials/store';

const APPROVALS = 'core.views.approvals';

function revision(permissions: string[], network: string[] = []) {
  return {
    manifest: { name: 'Spec View', permissions, network },
    files: { 'View.jsx': 'export default () => null;\n' },
  };
}

const view = () => installedViews().find((v) => v.id === 'spec-view');

describe('View consent', function () {
  let configDir: string;
  let config: { [key: string]: any };

  beforeEach(function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'views-consent-'));
    config = {};
    spyOn(AppEnv, 'getConfigDirPath').andReturn(configDir);
    spyOn(AppEnv, 'inDevMode').andReturn(false);
    spyOn(AppEnv.config, 'get').andCallFake((key) => config[key]);
    spyOn(AppEnv.config, 'set').andCallFake((key, value) => (config[key] = value));
    spyOn(credentials, 'removeAllCredentials').andReturn(Promise.resolve());
  });

  afterEach(function () {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('lets a View that asks for nothing beyond reading mail load without asking', function () {
    writeDraft('spec-view', revision([]));
    expect(unapprovedGrants(view())).toBe(null);
  });

  it('withholds declared permissions and hosts until the user allows them', function () {
    writeDraft('spec-view', revision(['mail.bodies'], ['api.example.com']));
    expect(unapprovedGrants(view())).toEqual({
      permissions: ['mail.bodies'],
      network: ['api.example.com'],
    });
    expect([...grantForView('spec-view').permissions]).toEqual([]);

    approveView('spec-view');
    expect(unapprovedGrants(view())).toBe(null);
    expect([...grantForView('spec-view').permissions]).toEqual(['mail.bodies']);
  });

  it('asks again when a later revision widens what the View can do', function () {
    writeDraft('spec-view', revision(['mail.bodies']));
    approveView('spec-view');
    promoteDraft('spec-view');

    writeDraft('spec-view', revision(['mail.bodies', 'mail.modify'], ['evil.example.com']));
    expect(unapprovedGrants(view())).toEqual({
      permissions: ['mail.modify'],
      network: ['evil.example.com'],
    });
    expect([...grantForView('spec-view').permissions]).toEqual(['mail.bodies']);
  });

  it('does not ask when a revision narrows what the View can do', function () {
    writeDraft('spec-view', revision(['mail.bodies', 'mail.modify']));
    approveView('spec-view');
    writeDraft('spec-view', revision(['mail.bodies']));
    expect(unapprovedGrants(view())).toBe(null);
  });

  it('withdraws what was allowed only for a draft when the draft is discarded', function () {
    writeDraft('spec-view', revision(['mail.bodies']));
    approveView('spec-view');
    promoteDraft('spec-view');
    writeDraft('spec-view', revision(['mail.bodies', 'mail.modify'], ['api.example.com']));
    approveView('spec-view');

    discardDraft('spec-view');
    expect(config[APPROVALS]['spec-view']).toEqual({ permissions: ['mail.bodies'], network: [] });

    writeDraft('spec-view', revision(['mail.bodies', 'mail.modify'], ['api.example.com']));
    expect(unapprovedGrants(view())).not.toBe(null);
  });

  it('forgets approvals and credentials when a draft with no installed copy is discarded', function () {
    writeDraft('spec-view', revision(['mail.bodies']));
    approveView('spec-view');
    discardDraft('spec-view');
    expect(config[APPROVALS]['spec-view']).toBe(undefined);
    expect(credentials.removeAllCredentials).toHaveBeenCalledWith('spec-view');
  });

  it('narrows nothing for a View the user never approved', function () {
    writeDraft('spec-view', revision(['mail.bodies']));
    narrowApprovalToCurrent('spec-view');
    expect(config[APPROVALS]).toBe(undefined);
  });

  describe('waitForConsent', function () {
    it('resolves when the user allows or declines', async function () {
      writeDraft('spec-view', revision(['mail.bodies']));
      const allowed = waitForConsent('spec-view', 10000);
      approveView('spec-view');
      expect(await allowed).toBe('approved');

      writeDraft('spec-view', revision(['mail.bodies', 'calendar.write']));
      const declined = waitForConsent('spec-view', 10000);
      declineView('spec-view');
      expect(await declined).toBe('declined');
    });

    it('resolves at once when nothing is pending', async function () {
      writeDraft('spec-view', revision([]));
      expect(await waitForConsent('spec-view', 10000)).toBe('approved');
    });
  });
});
