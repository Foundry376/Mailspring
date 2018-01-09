import React from 'react';

export default class ComposerEditorToolbar extends React.Component {
  componentDidMount() {
    for (const el of document.querySelectorAll('.scroll-region-content')) {
      el.addEventListener('scroll', this._onScroll);
    }

    const toolbar = document.querySelector('.sheet-toolbar');
    if (toolbar) {
      this._topClip = toolbar.getBoundingClientRect().bottom;
    } else {
      this._topClip = 0;
    }

    this._el.style.height = `${this._innerEl.clientHeight}px`;
  }

  componentWillUnmount() {
    for (const el of document.querySelectorAll('.scroll-region-content')) {
      el.removeEventListener('scroll', this._onScroll);
    }
  }

  componentDidUpdate() {
    this._el.style.height = `${this._innerEl.clientHeight}px`;
    this._onScroll();
  }

  _onScroll = () => {
    if (!this._el) return;
    let { top } = this._el.getBoundingClientRect();

    if (top < this._topClip) {
      this._innerEl.style.position = 'absolute';
      this._innerEl.style.top = `${this._topClip - top}px`;
    } else {
      this._innerEl.style.position = 'relative';
      this._innerEl.style.top = '0px';
    }
  };

  render() {
    const { value, onChange, plugins } = this.props;
    const pluginItems = [];

    plugins.forEach((plugin, idx) => {
      if (plugin.toolbarComponents && plugin.toolbarComponents.length) {
        if (pluginItems.length) {
          pluginItems.push(<div key={idx} className="divider" />);
        }
        plugin.toolbarComponents.forEach((Component, cdx) => {
          pluginItems.push(<Component key={`${idx}-${cdx}`} value={value} onChange={onChange} />);
        });
      }
    });

    return (
      <div ref={el => (this._el = el)} className="RichEditor-toolbar">
        <div ref={el => (this._innerEl = el)} className="inner">
          {pluginItems}
        </div>
      </div>
    );
  }
}
