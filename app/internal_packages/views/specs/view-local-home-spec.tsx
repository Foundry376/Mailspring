import fs from 'fs';
import os from 'os';
import path from 'path';
import React from 'react';
import ReactDOM from 'react-dom';
import { Simulate } from 'react-dom/test-utils';
import { LocalModelStore } from 'mailspring-exports';
import { ViewsHome } from '../lib/home/views-home';
import { allViews } from '../lib/view-registry';
import { ViewsNavStore } from '../lib/views-nav';
import { createUnbuiltView } from '../lib/authoring/revisions';
import { ViewHost } from '../lib/view-host';

describe('Local-only Views home', () => {
  let configDir: string;
  let container: HTMLDivElement;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'views-local-home-'));
    spyOn(AppEnv, 'getConfigDirPath').andReturn(configDir);
    spyOn(AppEnv, 'inDevMode').andReturn(false);
    spyOn(LocalModelStore, 'prepare');
    spyOn(LocalModelStore, 'status').andReturn(null);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  function expectNoHostedActions() {
    expect(container.querySelector('form, textarea, .views-home-create, .view-edit-button')).toBe(
      null
    );
    expect(container.textContent).not.toMatch(/Open Chat|Rebuild with AI|Start Building|Upgrade/);
  }

  it('keeps local model status and installs a starter from its Add button', () => {
    const showView = spyOn(ViewsNavStore, 'showView');
    ReactDOM.render(<ViewsHome />, container);
    expectNoHostedActions();
    expect(container.querySelector('.model-badge')).not.toBe(null);
    expect(container.querySelector('.views-home-empty').textContent).toContain('Add a starter');

    Simulate.click(container.querySelector('.starter button'));
    const installed = allViews();
    expect(installed.length).toBe(1);
    expect(installed[0].built).toBe(true);
    expect(fs.existsSync(path.join(installed[0].dir, 'View.jsx'))).toBe(true);
    expect(showView).toHaveBeenCalledWith(installed[0].id);
    expect(container.querySelector('.views-home-empty')).toBe(null);
    expectNoHostedActions();
  });

  it('explains incomplete local files without offering a remote chat', () => {
    createUnbuiltView('local-draft', 'Local draft');
    ReactDOM.render(<ViewsHome />, container);
    expect(container.textContent).toContain('Missing View.jsx');
    expect(container.textContent).toContain('local folder');
    const card = container.querySelector('.views-home-card:not(.starter)');
    expect(Array.from(card.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'Remove',
    ]);
    expectNoHostedActions();
  });

  it('offers local-file guidance, not hosted rebuilding, for an unsupported API', () => {
    const host = new ViewHost({ viewId: 'local-draft', placement: 'page' });
    host.state = { ...host.state, compat: { result: 'too-old', version: '2026-10-01' } };
    ReactDOM.render(host._renderVersionCard(), container);
    expect(container.textContent).toContain('local files');
    expect(container.querySelectorAll('button').length).toBe(1);
    expect(container.querySelector('button').textContent).toBe('Remove');
    expectNoHostedActions();
  });
});
