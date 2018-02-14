import React from 'react';

export default class ComposerEditorToolbar extends React.Component {
  constructor(props) {
    super(props);
    this.state = { visible: false };
  }

  componentDidMount() {
    this._mounted = true;

    setTimeout(() => {
      if (!this._mounted) return;
      this.setState({ visible: true }, () => {
        if (!this._mounted) return;
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
      });
    }, 400);
  }

  componentDidUpdate() {
    if (this._el) {
      this._el.style.height = `${this._innerEl.clientHeight}px`;
      this._onScroll();
    }
  }

  componentWillUnmount() {
    this._mounted = false;
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

    if (!this.state.visible) {
      return (
        <div className="RichEditor-toolbar">
          <div className="inner display-deferrable deferred" />
        </div>
      );
    }

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
        <div ref={el => (this._innerEl = el)} className="inner display-deferrable">
          {sectionItems}
        </div>
      </div>
    );
  }
}
