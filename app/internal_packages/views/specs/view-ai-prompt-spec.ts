import { LocalModelStore } from 'mailspring-exports';
import {
  ViewAIEvents,
  aiPromptDismissed,
  dismissAIPrompt,
  forgetAIPromptDismissal,
  localAIForViews,
} from '../lib/local-model/view-status';

describe('Views asking for AI', function () {
  let config: { [key: string]: any };
  let available: boolean;
  let wanted: string[];
  const onWanted = (viewId: string) => wanted.push(viewId);

  beforeEach(function () {
    config = {};
    available = false;
    wanted = [];
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => config[key]);
    spyOn(AppEnv.config, 'set').andCallFake((key: string, value: any) => {
      config[key] = value;
    });
    spyOn(LocalModelStore, 'availability').andCallFake(() => Promise.resolve({ available } as any));
    ViewAIEvents.on('wants-ai', onWanted);
  });

  afterEach(function () {
    ViewAIEvents.removeListener('wants-ai', onWanted);
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
});
