import React from 'react';

export default class ComposerEditorToolbar extends React.Component {
  componentDidMount() {
    for (const el of document.querySelectorAll('.scroll-region-content')) {
      el.addEventListener('scroll', this._onScroll);
    }

    const parentScrollRegion = this._el.closest('.scroll-region-content');
    if (parentScrollRegion) {
      this._topClip = parentScrollRegion.getBoundingClientRect().top;
    } else {
      this._topClip = 0;
    }

    this._el.style.height = `${this._innerEl.clientHeight}px`;
  }

  componentDidUpdate() {
    this._el.style.height = `${this._innerEl.clientHeight}px`;
    this._onScroll();
  }

  componentWillUnmount() {
    for (const el of document.querySelectorAll('.scroll-region-content')) {
      el.removeEventListener('scroll', this._onScroll);
    }
  }
  _onScroll = () => {
    if (!this._el) return;
    let { top, height } = this._el.getBoundingClientRect();
    const max = this._el.parentElement.clientHeight - height;

    if (top < this._topClip) {
      this._innerEl.style.position = 'absolute';
      this._innerEl.style.top = `${Math.min(max, this._topClip - top)}px`;
    } else {
      this._innerEl.style.position = 'relative';
      this._innerEl.style.top = '0px';
    }
  };

  render() {
    const { value, onChange, plugins } = this.props;
    let sectionItems = [];

    const pluginsWithToolbars = plugins.filter(
      (p, idx) => p.toolbarComponents && p.toolbarComponents.length
    );

    pluginsWithToolbars.forEach(({ toolbarComponents, toolbarSectionClass }, idx) => {
      sectionItems.push(
        ...toolbarComponents.map((Component, cdx) => (
          <Component
            key={`${idx}-${cdx}`}
            value={value}
            onChange={onChange}
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
        <div ref={el => (this._innerEl = el)} className="inner">
          {sectionItems}
        </div>
      </div>
    );
  }
}
