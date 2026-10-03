import fs from 'fs';
import React from 'react';
import classnames from 'classnames';
import { localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { ViewManifest, ViewRegistryEvents, installedViews } from '../view-registry';
import { promoteDraft, discardDraft } from '../authoring/drafts';
import { openView } from '../authoring';
import { Starter, installStarter, listStarters } from './starters';
import { ThumbnailEvents, thumbnailPath } from './thumbnails';
import { removeView } from './view-actions';
import {
  editWithAI,
  isBuilding,
  listenToSessions,
  newViewId,
  startAuthoring,
} from './agent-adapter';

interface ViewsHomeState {
  views: ViewManifest[];
  starters: Starter[];
  thumbnailStamps: { [viewId: string]: number };
  creating: boolean;
  name: string;
  request: string;
  notice: string | null;
}

function thumbnailStamp(viewId: string) {
  try {
    return fs.statSync(thumbnailPath(viewId)).mtimeMs;
  } catch {
    return 0;
  }
}

function showError(err: Error) {
  AppEnv.showErrorDialog({ title: localized('Views'), message: err.message });
}

/**
 * The Views home: the user's Views, the starters that ship with the app, and the entry point
 * for building a new View with the authoring agent.
 */
export class ViewsHome extends React.Component<Record<string, never>, ViewsHomeState> {
  static displayName = 'ViewsHome';

  _unsubscribers: (() => void)[] = [];

  state: ViewsHomeState = {
    ...this._load(),
    creating: false,
    name: '',
    request: '',
    notice: null,
  };

  componentDidMount() {
    const reload = () => this.setState(this._load());
    ViewRegistryEvents.on('changed', reload);
    ThumbnailEvents.on('changed', reload);
    this._unsubscribers = [
      () => ViewRegistryEvents.removeListener('changed', reload),
      () => ThumbnailEvents.removeListener('changed', reload),
      listenToSessions(() => this.forceUpdate()),
    ];
  }

  componentWillUnmount() {
    this._unsubscribers.forEach((fn) => fn());
  }

  _load() {
    const views = installedViews();
    const thumbnailStamps = {};
    views.forEach((v) => (thumbnailStamps[v.id] = thumbnailStamp(v.id)));
    return { views, starters: listStarters(), thumbnailStamps };
  }

  _onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = this.state.name.trim();
    const request = this.state.request.trim();
    if (!name || !request) return;
    try {
      startAuthoring({ viewId: newViewId(name), name, request });
    } catch (err) {
      showError(err);
      return;
    }
    // The authoring panel that just opened is all the feedback this needs.
    this.setState({ creating: false, name: '', request: '', notice: null });
  };

  _onEditWithAI = async (view: ViewManifest) => {
    try {
      if (view.placement === 'page') openView(view.id);
      await editWithAI(view.id, view.name);
    } catch (err) {
      showError(err);
    }
  };

  _onAddStarter = (starter: Starter, asDraft: boolean) => {
    try {
      const viewId = installStarter(starter, { asDraft });
      if (starter.placement === 'page') {
        openView(viewId);
      } else {
        this.setState({
          notice: localized('“%@” appears beside conversations when you open one.', starter.name),
        });
      }
    } catch (err) {
      showError(err);
    }
  };

  _guard(fn: () => void) {
    try {
      fn();
    } catch (err) {
      showError(err);
    }
  }

  _renderCreate() {
    const { creating, name, request } = this.state;

    if (!creating) {
      return (
        <button
          className="views-home-create"
          onClick={() => this.setState({ creating: true, notice: null })}
        >
          <div className="views-home-create-plus">+</div>
          <div>
            <div className="views-home-create-title">{localized('Create a View')}</div>
            <div className="views-home-create-subtitle">
              {localized(
                'Describe the view of your mail you want, and Mailspring builds it with you.'
              )}
            </div>
          </div>
        </button>
      );
    }

    return (
      <form className="views-home-create-form" onSubmit={this._onCreate}>
        <div className="views-home-create-title">{localized('Create a View')}</div>
        <label>
          {localized('Name')}
          <input
            type="text"
            autoFocus
            maxLength={60}
            placeholder={localized('e.g. Receipts')}
            value={name}
            onChange={(e) => this.setState({ name: e.target.value })}
          />
        </label>
        <label>
          {localized('What should it show?')}
          <textarea
            rows={4}
            placeholder={localized(
              'e.g. Chart what I spend on Uber and Lyft each month, with a list of recent rides.'
            )}
            value={request}
            onChange={(e) => this.setState({ request: e.target.value })}
          />
        </label>
        <div className="views-home-create-hint">
          {localized(
            'Next, you will drag a few example emails into the authoring panel. Only the emails you add there are shared with the agent.'
          )}
        </div>
        <div className="views-home-create-actions">
          <button
            type="button"
            className="btn"
            onClick={() => this.setState({ creating: false, name: '', request: '' })}
          >
            {localized('Cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-emphasis"
            disabled={!name.trim() || !request.trim()}
          >
            {localized('Start Building')}
          </button>
        </div>
      </form>
    );
  }

  _renderThumbnail(view: ViewManifest) {
    const stamp = this.state.thumbnailStamps[view.id];
    if (stamp) {
      return (
        <div className="views-home-thumb">
          <img alt="" src={`file://${thumbnailPath(view.id)}?${stamp}`} />
        </div>
      );
    }
    return (
      <div className="views-home-thumb empty">
        <RetinaImg name="plugins.png" mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  _renderBadges(view: { placement: string; source?: string; id?: string }) {
    return (
      <div className="views-home-badges">
        <span className="views-home-badge">
          {view.placement === 'page' ? localized('Page') : localized('Sidebar')}
        </span>
        {view.source === 'draft' && (
          <span className="views-home-badge draft">{localized('Draft')}</span>
        )}
        {view.id && isBuilding(view.id) && (
          <span className="views-home-badge working">{localized('Building…')}</span>
        )}
      </div>
    );
  }

  _renderViewCard(view: ViewManifest) {
    const removable = view.source !== 'example';
    return (
      <div key={view.id} className="views-home-card">
        {this._renderThumbnail(view)}
        <div className="views-home-card-body">
          <div className="views-home-card-name">{view.name}</div>
          {this._renderBadges(view)}
          {view.placement === 'thread-sidebar' && (
            <div className="views-home-card-description">
              {localized('Shows beside conversations when you open one.')}
            </div>
          )}
        </div>
        <div className="views-home-card-actions">
          {view.placement === 'page' && (
            <button className="btn" onClick={() => this._guard(() => openView(view.id))}>
              {localized('Open')}
            </button>
          )}
          {view.source === 'draft' && (
            <button className="btn" onClick={() => this._guard(() => promoteDraft(view.id))}>
              {localized('Keep')}
            </button>
          )}
          {removable && (
            <button className="btn" onClick={() => this._onEditWithAI(view)}>
              {localized('Edit with AI')}
            </button>
          )}
          {view.source === 'draft' ? (
            <button className="btn" onClick={() => this._guard(() => discardDraft(view.id))}>
              {localized('Discard')}
            </button>
          ) : (
            removable && (
              <button className="btn" onClick={() => this._guard(() => removeView(view))}>
                {localized('Remove')}
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  _renderStarterCard(starter: Starter) {
    const added = this.state.views.filter(
      (v) => v.json && v.json.starter && v.json.starter.id === starter.id
    ).length;
    return (
      <div key={starter.id} className="views-home-card starter">
        <div className="views-home-card-body">
          <div className="views-home-card-name">{starter.name}</div>
          {this._renderBadges({ placement: starter.placement })}
          <div className="views-home-card-description">{starter.description}</div>
        </div>
        <div className="views-home-card-actions">
          <button className="btn btn-emphasis" onClick={() => this._onAddStarter(starter, false)}>
            {added ? localized('Add Another') : localized('Add')}
          </button>
          <button
            className="btn"
            title={localized('Preview it as a draft you can keep or discard')}
            onClick={() => this._onAddStarter(starter, true)}
          >
            {localized('Try')}
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { views, starters, notice } = this.state;
    const yours = views.filter((v) => v.source !== 'example');
    const examples = views.filter((v) => v.source === 'example');

    return (
      <div className="views-home">
        <div className="views-home-content">
          <h1>{localized('Views')}</h1>
          <p className="views-home-intro">
            {localized(
              'Views are custom perspectives on your mail. They run in a sandbox: they can read the mail you allow, but not your files or the internet.'
            )}
          </p>

          {this._renderCreate()}
          {notice && <div className="views-home-notice">{notice}</div>}

          <h2>{localized('Your Views')}</h2>
          {yours.length ? (
            <div className={classnames('views-home-grid')}>
              {yours.map((v) => this._renderViewCard(v))}
            </div>
          ) : (
            <div className="views-home-empty">
              {localized('You have no Views yet. Create one, or start from a starter below.')}
            </div>
          )}

          {starters.length > 0 && (
            <>
              <h2>{localized('Starters')}</h2>
              <div className="views-home-grid">
                {starters.map((s) => this._renderStarterCard(s))}
              </div>
            </>
          )}

          {examples.length > 0 && (
            <>
              <h2>{localized('Developer Examples')}</h2>
              <div className="views-home-grid">{examples.map((v) => this._renderViewCard(v))}</div>
            </>
          )}
        </div>
      </div>
    );
  }
}
