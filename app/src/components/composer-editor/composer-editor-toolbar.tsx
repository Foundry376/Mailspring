import React from 'react';
import { Editor, Value } from 'slate';
import { ComposerEditorPlugin } from './types';

interface ComposerEditorToolbarProps {
  editor: Editor;
  value: Value;
  plugins: ComposerEditorPlugin[];
}

export interface ComposerEditorToolbarState {
  visible: boolean;
}

export default class ComposerEditorToolbar extends React.Component<
  ComposerEditorToolbarProps,
  ComposerEditorToolbarState
> {
  _mounted: boolean = false;
  _topClip: number = 0;
  _el: HTMLElement;
  _floatingEl: HTMLElement;
  _heightObserver: ResizeObserver;

  state = { visible: false };

  componentDidMount() {
    this._mounted = true;
    setTimeout(() => {
      if (!this._mounted) return;
      this.setState({ visible: true }, () => {
        if (!this._mounted) return;
        for (const el of Array.from(document.querySelectorAll('.scroll-region-content'))) {
          el.addEventListener('scroll', this._onScroll);
        }

        const parentScrollRegion = this._el.closest('.scroll-region-content');
        if (parentScrollRegion) {
          this._topClip = parentScrollRegion.getBoundingClientRect().top;
        } else {
          this._topClip = 0;
        }

        this._el.style.height = `${this._floatingEl.clientHeight}px`;
        this._heightObserver = new window.ResizeObserver(entries => {
          this._el.style.height = `${this._floatingEl.clientHeight}px`;
          this._onScroll();
        });
        this._heightObserver.observe(this._floatingEl);
      });
    }, 400);
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._heightObserver) {
      this._heightObserver.disconnect();
    }
    for (const el of Array.from(document.querySelectorAll('.scroll-region-content'))) {
      el.removeEventListener('scroll', this._onScroll);
    }
  }

  _onScroll = () => {
    if (!this._el) return;
    let { top, height } = this._el.getBoundingClientRect();
    const max = this._el.parentElement.clientHeight - height;

    if (top < this._topClip) {
      this._floatingEl.style.position = 'absolute';
      this._floatingEl.style.top = `${Math.min(max, this._topClip - top)}px`;
    } else {
      this._floatingEl.style.position = 'relative';
      this._floatingEl.style.top = '0px';
    }
  };

  render() {
    const { editor, plugins, value } = this.props;

    let sectionItems = [];

    if (!this.state.visible) {
      return (
        <div className="RichEditor-toolbar">
          <div className="floating-container">
            <div className="inner display-deferrable deferred" />
          </div>
        </div>
      );
    }

    const pluginsWithToolbars = plugins.filter(
      p => p.toolbarComponents && p.toolbarComponents.length
    );

    pluginsWithToolbars.forEach(({ toolbarComponents, toolbarSectionClass }, idx) => {
      sectionItems.push(
        ...toolbarComponents.map((Component, cdx) => (
          <Component
            key={`${idx}-${cdx}`}
            editor={editor}
            value={value}
            className={toolbarSectionClass}
          />
        ))
      );
      if (idx < pluginsWithToolbars.length - 1) {
        sectionItems.push(
          <div key={`${idx}-divider`} className={`divider ${toolbarSectionClass}`} />
        );
      }
    });

    return (
      <div ref={el => (this._el = el)} className="RichEditor-toolbar">
        <div ref={el => (this._floatingEl = el)} className="floating-container">
          <div className="inner display-deferrable">{sectionItems}</div>
        </div>
      </div>
    );
  }
}
