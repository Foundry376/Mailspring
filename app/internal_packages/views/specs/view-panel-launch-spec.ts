import { AgentTransport } from '../lib/agent/client';
import { AgentSessionStore } from '../lib/agent/store';
import { AgentAPIError } from '../lib/agent/types';
import * as launch from '../lib/authoring-panel/launch';
import { openPanelForView } from '../lib/authoring-panel';
import { ViewManifest } from '../lib/view-registry';

const VIEW = 'daily-briefing-abc123';
const CURRENT = {
  manifest: { name: 'Daily Briefing', permissions: [] },
  files: { 'View.jsx': 'export default () => null;\n' },
};

// The spec runner fakes setTimeout, so drain the microtask queue instead.
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const manifest = (): ViewManifest =>
  ({
    id: VIEW,
    name: 'Daily Briefing',
    placement: 'page',
    permissions: [],
    source: 'user',
    dir: '/tmp/none',
    json: { name: 'Daily Briefing', starter: { id: 'daily-briefing', version: null } },
  }) as any;

describe('Opening the authoring panel for a View', function () {
  let transport: { [K in keyof AgentTransport]: jasmine.Spy };

  const noSession = () =>
    Promise.reject(new AgentAPIError('No session', { statusCode: 404, code: 'no_session' }));
  const openStream = (viewId, onEvent, signal, onOpen) => {
    if (onOpen) onOpen();
    return new Promise(() => {});
  };

  beforeEach(() => {
    transport = {
      createSession: jasmine
        .createSpy('createSession')
        .andReturn(Promise.resolve({ viewId: VIEW, sessionId: 's', resumed: false })),
      sendMessage: jasmine.createSpy('sendMessage').andReturn(Promise.resolve()),
      sendToolResult: jasmine.createSpy('sendToolResult').andReturn(Promise.resolve()),
      interrupt: jasmine.createSpy('interrupt').andReturn(Promise.resolve()),
      budget: jasmine.createSpy('budget').andReturn(Promise.resolve({ maxListCostCents: 400 })),
      usage: jasmine.createSpy('usage').andCallFake(() => Promise.reject(new Error('offline'))),
      streamEvents: jasmine.createSpy('streamEvents').andCallFake(noSession),
    };
    AgentSessionStore.configure({
      transport: transport as any,
      publicKey: () => '',
      lastAcceptedRevision: () => 0,
      setAcceptedRevision: () => {},
      buildExamples: async () => [],
      currentBundle: () => CURRENT as any,
      currentRevision: () => 'abc',
      agentCode: () => null,
      setAgentCode: () => {},
      saveCheckpoint: () => false,
      hasCheckpoint: () => false,
      showView: () => {},
      onScreen: () => false,
      listenToScreen: () => () => {},
      revertView: () => {},
      showUpgrade: jasmine.createSpy('showUpgrade'),
    });
    spyOn(launch, 'viewById').andReturn(manifest());
  });

  afterEach(() => {
    AgentSessionStore.setActive(null);
  });

  it('shows the composer without creating a session, and attaches to its history', async () => {
    await openPanelForView(VIEW);
    const s = AgentSessionStore.session(VIEW);
    expect(AgentSessionStore.activeViewId()).toBe(VIEW);
    expect(s.intro).toBe(true);
    expect(s.error).toBe(null);
    expect(transport.streamEvents).toHaveBeenCalled();
    expect(transport.createSession).not.toHaveBeenCalled();
  });

  it('starts a session seeded with the current code on the first message', async () => {
    await openPanelForView(VIEW);
    transport.streamEvents.andCallFake(openStream);
    await AgentSessionStore.sendMessage(VIEW, 'Add a weather section');
    await flush();
    const args = transport.createSession.mostRecentCall.args[0];
    expect(args.request).toBe('Add a weather section');
    expect(args.current).toEqual(CURRENT);
    expect(transport.sendMessage).not.toHaveBeenCalled();
    expect(AgentSessionStore.session(VIEW).intro).toBe(false);
  });

  it('sends to the existing session when the stream opens for a View that has one', async () => {
    transport.streamEvents.andCallFake(openStream);
    await openPanelForView(VIEW);
    await AgentSessionStore.sendMessage(VIEW, 'Make it blue');
    expect(transport.sendMessage).toHaveBeenCalled();
    expect(transport.createSession).not.toHaveBeenCalled();
  });

  it('reopens a conversation this window already has', async () => {
    transport.streamEvents.andCallFake(openStream);
    await AgentSessionStore.start({ viewId: VIEW, name: 'Daily Briefing', request: 'Hi' });
    AgentSessionStore.setActive(null);
    transport.streamEvents.reset();
    await openPanelForView(VIEW);
    expect(AgentSessionStore.activeViewId()).toBe(VIEW);
    expect(AgentSessionStore.session(VIEW).transcript.length).toBe(1);
    expect(transport.streamEvents).not.toHaveBeenCalled();
  });
});
