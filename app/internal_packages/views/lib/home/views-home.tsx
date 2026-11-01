import fs from 'fs';
import { declaredCredentials } from '../credentials/store';
import { openManageCredentials } from '../credentials/credential-sheet';
import React from 'react';
import classnames from 'classnames';
import { localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { ViewManifest, ViewRegistryEvents, allViews } from '../view-registry';
import { isPinned, onPinsChanged, setPinned } from '../nav/pins';
import { ViewBadgeEvents, badgeFor } from '../nav/badges';
import { openView } from '../authoring';
import { Starter, installStarter, listStarters } from './starters';
import { ThumbnailEvents, thumbnailPath } from './thumbnails';
import { removeView } from './view-actions';
import { ModelBadge } from '../local-model/model-badge';

// The header's grid-paper backdrop. Alternatives are defined in views-home.less:
// 'grid-major' (24px with stronger lines every 96px) and 'grid-accent' (the same in the
// accent color).
const BACKDROP_VARIANT = 'grid-fine';

interface ViewsHomeState {
  views: ViewManifest[];
  starters: Starter[];
  thumbnailStamps: { [viewId: string]: number };
  notice: string | null;
}

function thumbnailStamp(viewId: string) {
  try {
    return fs.statSync(thumbnailPath(viewId)).mtimeMs;
  } catch {
    return 0;
  }
}

function manifestDescription(view: ViewManifest): string {
  const { description } = view.json || {};
  return typeof description === 'string' ? description.trim() : '';
}

function showError(err: Error) {
  AppEnv.showErrorDialog({ title: localized('Views'), message: err.message });
}

/** The user's local Views and the starters that ship with the app. */
export class ViewsHome extends React.Component<Record<string, never>, ViewsHomeState> {
  static displayName = 'ViewsHome';

  _unsubscribers: (() => void)[] = [];

  state: ViewsHomeState = {
    ...this._load(),
    notice: null,
  };

  componentDidMount() {
    const reload = () => this.setState(this._load());
    const rerender = () => this.forceUpdate();
    ViewRegistryEvents.on('changed', reload);
    ThumbnailEvents.on('changed', reload);
    ViewBadgeEvents.on('changed', rerender);
    this._unsubscribers = [
      () => ViewRegistryEvents.removeListener('changed', reload),
      () => ThumbnailEvents.removeListener('changed', reload),
      () => ViewBadgeEvents.removeListener('changed', rerender),
      onPinsChanged(() => this.forceUpdate()),
    ];
  }

  componentWillUnmount() {
    this._unsubscribers.forEach((fn) => fn());
  }

  _load() {
    const views = allViews();
    const thumbnailStamps = {};
    views.forEach((v) => (thumbnailStamps[v.id] = thumbnailStamp(v.id)));
    return { views, starters: listStarters(), thumbnailStamps };
  }

  _onAddStarter = (starter: Starter) => {
    try {
      const viewId = installStarter(starter);
      if (starter.placement === 'page') {
        openView(viewId);
      } else {
        this.setState({
          notice: localized(
            'Added “%@”. It appears beside conversations when you open one.',
            starter.name
          ),
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

  _renderBadges(view: { placement: string; id?: string; built?: boolean }) {
    return (
      <div className="views-home-badges">
        {view.built !== false && (
          <span className="views-home-badge">
            {view.placement === 'page' ? localized('Page') : localized('Sidebar')}
          </span>
        )}
        {view.id && badgeFor(view.id) && (
          <span className="views-home-badge count">{badgeFor(view.id)}</span>
        )}
        {view.built === false && (
          <span className="views-home-badge">{localized('Missing View.jsx')}</span>
        )}
      </div>
    );
  }

  _renderViewCard(view: ViewManifest) {
    if (!view.built) return this._renderUnbuiltCard(view);
    const removable = view.source !== 'example';
    return (
      <div key={view.id} className="views-home-card">
        {this._renderThumbnail(view)}
        <div className="views-home-card-body">
          <div className="views-home-card-header">
            <div className="views-home-card-name">{view.name}</div>
            {this._renderBadges(view)}
          </div>
          {manifestDescription(view) ? (
            <div className="views-home-card-description clamped">{manifestDescription(view)}</div>
          ) : (
            view.placement === 'thread-sidebar' && (
              <div className="views-home-card-description">
                {localized('Shows beside conversations when you open one.')}
              </div>
            )
          )}
        </div>
        <div className="views-home-card-actions">
          {view.placement === 'page' && (
            <button className="btn" onClick={() => this._guard(() => openView(view.id))}>
              {localized('Open')}
            </button>
          )}
          {view.placement === 'page' && (
            <button className="btn" onClick={() => setPinned(view.id, !isPinned(view.id))}>
              {isPinned(view.id) ? localized('Unpin') : localized('Pin')}
            </button>
          )}
          {declaredCredentials(view.id).length > 0 && (
            <button className="btn" onClick={() => openManageCredentials(view.id)}>
              {localized('Credentials')}
            </button>
          )}
          {removable && (
            <button className="btn" onClick={() => this._guard(() => removeView(view))}>
              {localized('Remove')}
            </button>
          )}
        </div>
      </div>
    );
  }

  _renderUnbuiltCard(view: ViewManifest) {
    return (
      <div key={view.id} className="views-home-card">
        {this._renderThumbnail(view)}
        <div className="views-home-card-body">
          <div className="views-home-card-header">
            <div className="views-home-card-name">{view.name}</div>
            {this._renderBadges(view)}
          </div>
          <div className="views-home-card-description">
            {localized('Add View.jsx to this View’s local folder to use it.')}
          </div>
        </div>
        <div className="views-home-card-actions">
          <button className="btn" onClick={() => this._guard(() => removeView(view))}>
            {localized('Remove')}
          </button>
        </div>
      </div>
    );
  }

  _renderStarterCard(starter: Starter) {
    return (
      <div key={starter.id} className="views-home-card starter">
        <div className={starter.poster ? 'views-home-thumb' : 'views-home-thumb empty'}>
          {starter.poster ? (
            <img alt="" src={`file://${starter.poster}`} />
          ) : (
            <RetinaImg name="plugins.png" mode={RetinaImg.Mode.ContentIsMask} />
          )}
        </div>
        <div className="views-home-card-body">
          <div className="views-home-card-header">
            <div className="views-home-card-name">{starter.name}</div>
            {this._renderBadges({ placement: starter.placement })}
          </div>
          <div className="views-home-card-description">{starter.description}</div>
        </div>
        <div className="views-home-card-actions">
          <button
            className="btn btn-emphasis"
            title={localized('Add it to your Views')}
            onClick={() => this._onAddStarter(starter)}
          >
            {localized('Add')}
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
        <div className={`views-home-backdrop ${BACKDROP_VARIANT}`} aria-hidden="true" />
        <div className="views-home-content">
          <div className="views-home-header">
            <h1>{localized('Views')}</h1>
            <ModelBadge />
          </div>
          <p className="views-home-intro">
            {localized(
              'Custom, live dashboards built from your mail — track packages, chart spending, organize work projects and more.'
            )}
          </p>

          {notice && <div className="views-home-notice">{notice}</div>}

          <h2>{localized('Your Views')}</h2>
          {yours.length ? (
            <div className={classnames('views-home-grid')}>
              {yours.map((v) => this._renderViewCard(v))}
            </div>
          ) : (
            <div className="views-home-empty">
              {localized('You have no Views yet. Add a starter below to get started.')}
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
