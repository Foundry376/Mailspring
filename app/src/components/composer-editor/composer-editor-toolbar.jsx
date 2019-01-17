import React from 'react';

export default class ComposerEditorToolbar extends React.Component {
  static defaultProps = {
    readOnly: false
  };
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

        this._el.style.height = `${this._floatingEl.clientHeight}px`;
      });
    }, 400);
  }

  componentDidUpdate() {
    if (this._el) {
      this._el.style.height = `${this._floatingEl.clientHeight}px`;
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
      this._floatingEl.style.position = 'absolute';
      this._floatingEl.style.top = `${Math.min(max, this._topClip - top)}px`;
    } else {
      this._floatingEl.style.position = 'relative';
      this._floatingEl.style.top = '0px';
    }
  };

  render() {
    const { value, onChange, plugins, readOnly } = this.props;
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
            disabled={readOnly}
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
