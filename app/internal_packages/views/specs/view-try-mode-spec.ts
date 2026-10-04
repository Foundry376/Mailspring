import fs from 'fs';
import { AgentTransport } from '../lib/agent/client';
import { AgentSessionStore } from '../lib/agent/store';
import { AgentAPIError } from '../lib/agent/types';
import * as launch from '../lib/authoring-panel/launch';
import { openPanelForView } from '../lib/authoring-panel';
import { ViewManifest } from '../lib/view-registry';

const VIEW = 'daily-briefing-abc123';
const CURRENT = {
  manifest: { name: 'Daily Briefing', permissions: ['mail.read'] },
  files: { 'View.jsx': 'export default () => null;\n' },
};

// The spec runner fakes setTimeout, so drain the microtask queue instead.
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const manifest = (overrides: Partial<ViewManifest> = {}): ViewManifest =>
  ({
    id: VIEW,
    name: 'Daily Briefing',
    placement: 'page',
    permissions: ['mail.read'],
    source: 'draft',
    dir: '/tmp/none',
    json: { name: 'Daily Briefing', starter: { id: 'daily-briefing', version: null } },
    ...overrides,
  }) as any;

describe('Views try mode', function () {
  let transport: { [K in keyof AgentTransport]: jasmine.Spy };
  let promoteDraft: jasmine.Spy;
  let discardDraft: jasmine.Spy;

  const noSession = () =>
    Promise.reject(new AgentAPIError('No session', { statusCode: 404, code: 'no_session' }));
  const openStream = (viewId, onEvent, signal, onOpen) => {
    if (onOpen) onOpen();
    return new Promise(() => {});
  };

  beforeEach(() => {
    promoteDraft = jasmine.createSpy('promoteDraft');
    discardDraft = jasmine.createSpy('discardDraft');
    transport = {
      createSession: jasmine
        .createSpy('createSession')
        .andReturn(Promise.resolve({ viewId: VIEW, sessionId: 's', resumed: false })),
      sendMessage: jasmine.createSpy('sendMessage').andReturn(Promise.resolve()),
      sendToolResult: jasmine.createSpy('sendToolResult').andReturn(Promise.resolve()),
      interrupt: jasmine.createSpy('interrupt').andReturn(Promise.resolve()),
      budget: jasmine.createSpy('budget').andReturn(Promise.resolve({ maxListCostCents: 400 })),
      usage: jasmine.createSpy('usage').andCallFake(() => Promise.reject(new Error('offline'))),
      publicKey: jasmine.createSpy('publicKey').andReturn(Promise.resolve('')),
      streamEvents: jasmine.createSpy('streamEvents').andCallFake(noSession),
    };
    AgentSessionStore.configure({
      transport: transport as any,
      identityId: () => 'identity-1',
      configuredPublicKey: () => '',
      devMode: () => false,
      lastAcceptedRevision: () => 0,
      setAcceptedRevision: () => {},
      buildExamples: async () => [],
      currentBundle: () => CURRENT as any,
      promoteDraft,
      discardDraft,
      showUpgrade: jasmine.createSpy('showUpgrade'),
    });
  });

  afterEach(() => {
    AgentSessionStore.setActive(null);
  });

  const noNetwork = () => {
    expect(transport.createSession).not.toHaveBeenCalled();
    expect(transport.streamEvents).not.toHaveBeenCalled();
    expect(transport.sendMessage).not.toHaveBeenCalled();
  };

  describe('the agent store', function () {
    it('previews a starter without contacting the backend', () => {
      AgentSessionStore.preview(VIEW, 'Daily Briefing', 'try');
      const s = AgentSessionStore.session(VIEW);
      expect(AgentSessionStore.activeViewId()).toBe(VIEW);
      expect(s.intro).toBe('try');
      expect(s.status).toBe('idle');
      expect(s.transcript).toEqual([]);
      noNetwork();
    });

    it('moves to the composer on Chat and only reads the stream', async () => {
      AgentSessionStore.preview(VIEW, 'Daily Briefing', 'try');
      await AgentSessionStore.chat(VIEW);
      const s = AgentSessionStore.session(VIEW);
      expect(s.intro).toBe('edit');
      expect(s.error).toBe(null);
      expect(transport.streamEvents).toHaveBeenCalled();
      expect(transport.createSession).not.toHaveBeenCalled();
    });

    it('starts a session seeded with the current code on the first message', async () => {
      AgentSessionStore.preview(VIEW, 'Daily Briefing', 'try');
      await AgentSessionStore.chat(VIEW);
      transport.streamEvents.andCallFake(openStream);
      await AgentSessionStore.sendMessage(VIEW, 'Add a weather section');
      await flush();
      const args = transport.createSession.mostRecentCall.args[0];
      expect(args.request).toBe('Add a weather section');
      expect(args.current).toEqual(CURRENT);
      expect(transport.sendMessage).not.toHaveBeenCalled();
      expect(AgentSessionStore.session(VIEW).intro).toBe(null);
    });

    it('sends to the existing session when the stream opens for a View that has one', async () => {
      transport.streamEvents.andCallFake(openStream);
      AgentSessionStore.preview(VIEW, 'Daily Briefing', 'edit');
      await AgentSessionStore.chat(VIEW);
      await AgentSessionStore.sendMessage(VIEW, 'Make it blue');
      expect(transport.sendMessage).toHaveBeenCalled();
      expect(transport.createSession).not.toHaveBeenCalled();
    });

    it('keeps a conversation when previewed again', async () => {
      transport.streamEvents.andCallFake(openStream);
      await AgentSessionStore.start({ viewId: VIEW, name: 'Daily Briefing', request: 'Hi' });
      AgentSessionStore.setActive(null);
      AgentSessionStore.preview(VIEW, 'Daily Briefing', 'try');
      const s = AgentSessionStore.session(VIEW);
      expect(s.intro).toBe(null);
      expect(s.transcript.length).toBe(1);
      expect(AgentSessionStore.activeViewId()).toBe(VIEW);
    });

    it('installs and removes previews through the draft API and closes the panel', async () => {
      AgentSessionStore.preview(VIEW, 'Daily Briefing', 'try');
      await AgentSessionStore.install(VIEW);
      expect(promoteDraft).toHaveBeenCalledWith(VIEW);
      expect(AgentSessionStore.activeViewId()).toBe(null);
      expect(AgentSessionStore.session(VIEW)).toBe(null);

      AgentSessionStore.preview(VIEW, 'Daily Briefing', 'try');
      await AgentSessionStore.discard(VIEW);
      expect(discardDraft).toHaveBeenCalledWith(VIEW);
      expect(AgentSessionStore.session(VIEW)).toBe(null);
      noNetwork();
    });
  });

  describe('isTryDraft', function () {
    it('is true only for an uninstalled draft copied from a starter', () => {
      spyOn(fs, 'existsSync').andReturn(false);
      expect(launch.isTryDraft(manifest())).toBe(true);
      expect(launch.isTryDraft(manifest({ source: 'installed' }))).toBe(false);
      expect(launch.isTryDraft(manifest({ json: { name: 'Mine' } } as any))).toBe(false);
      expect(launch.isTryDraft(null)).toBe(false);
    });

    it('is false for a draft over an installed View', () => {
      spyOn(fs, 'existsSync').andReturn(true);
      expect(launch.isTryDraft(manifest())).toBe(false);
    });
  });

  describe('openPanelForView', function () {
    it('shows the preview card for a starter being tried, without network', async () => {
      spyOn(launch, 'viewById').andReturn(manifest());
      spyOn(launch, 'isTryDraft').andReturn(true);
      await openPanelForView(VIEW);
      expect(AgentSessionStore.session(VIEW).intro).toBe('try');
      noNetwork();
    });

    it('opens an installed View for editing and attaches to its history', async () => {
      spyOn(launch, 'viewById').andReturn(manifest({ source: 'installed' }));
      spyOn(launch, 'isTryDraft').andReturn(false);
      await openPanelForView(VIEW);
      const s = AgentSessionStore.session(VIEW);
      expect(s.intro).toBe('edit');
      expect(transport.streamEvents).toHaveBeenCalled();
      expect(transport.createSession).not.toHaveBeenCalled();
    });

    it('reopens a conversation this window already has', async () => {
      transport.streamEvents.andCallFake(openStream);
      await AgentSessionStore.start({ viewId: VIEW, name: 'Daily Briefing', request: 'Hi' });
      AgentSessionStore.setActive(null);
      transport.streamEvents.reset();
      await openPanelForView(VIEW);
      expect(AgentSessionStore.activeViewId()).toBe(VIEW);
      expect(transport.streamEvents).not.toHaveBeenCalled();
    });
  });
});
