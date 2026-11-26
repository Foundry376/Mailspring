import { LocalModelStore } from 'mailspring-exports';
import {
  ViewAIEvents,
  aiPromptDismissed,
  dismissAIPrompt,
  forgetAIPromptDismissal,
  localAIForViews,
  remoteAIDecision,
  setRemoteAIDecision,
} from '../lib/local-model/view-status';

describe('Views asking for AI', function () {
  let config: { [key: string]: any };
  let available: boolean;
  let remote: boolean;
  let wanted: string[];
  const onWanted = (viewId: string) => wanted.push(viewId);
  const onWantedRemote = (viewId: string) => wanted.push(`remote:${viewId}`);

  beforeEach(function () {
    config = {};
    available = false;
    remote = false;
    wanted = [];
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => config[key]);
    spyOn(AppEnv.config, 'set').andCallFake((key: string, value: any) => {
      config[key] = value;
    });
    spyOn(LocalModelStore, 'availability').andCallFake(() =>
      Promise.resolve({ available, remote } as any)
    );
    ViewAIEvents.on('wants-ai', onWanted);
    ViewAIEvents.on('wants-remote-ai', onWantedRemote);
  });

  afterEach(function () {
    ViewAIEvents.removeListener('wants-ai', onWanted);
    ViewAIEvents.removeListener('wants-remote-ai', onWantedRemote);
  });

  it('tells the host when a View gets no answers', async function () {
    await localAIForViews('rides');
    expect(wanted).toEqual(['rides']);
    available = true;
    await localAIForViews('rides');
    expect(wanted).toEqual(['rides']);
  });

  it('remembers Not Now per View until the View is removed', function () {
    dismissAIPrompt('rides');
    dismissAIPrompt('rides');
    expect(config['core.views.aiPromptDismissed']).toEqual(['rides']);
    expect(aiPromptDismissed('rides')).toBe(true);
    expect(aiPromptDismissed('packages')).toBe(false);
    forgetAIPromptDismissal('rides');
    expect(aiPromptDismissed('rides')).toBe(false);
  });

  it('sends nothing to OpenRouter for a View the user hasn’t allowed', async function () {
    available = true;
    remote = true;
    expect((await localAIForViews('rides')).available).toBe(false);
    expect(wanted).toEqual(['remote:rides']);

    setRemoteAIDecision('rides', 'declined');
    expect((await localAIForViews('rides')).available).toBe(false);
    expect(wanted).toEqual(['remote:rides']);

    setRemoteAIDecision('rides', 'allowed');
    expect((await localAIForViews('rides')).available).toBe(true);

    forgetAIPromptDismissal('rides');
    expect(remoteAIDecision('rides')).toBe(undefined);
  });
});
