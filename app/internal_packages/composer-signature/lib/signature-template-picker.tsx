import React from 'react';
import { localized, PropTypes } from 'mailspring-exports';
import Templates from './templates';

export default class SignatureTemplatePicker extends React.Component<{
  resolvedData: any;
  onChange: (e: { target: { id: string; value: string } }) => void;
}> {
  static propTypes = {
    resolvedData: PropTypes.object,
    onChange: PropTypes.func,
  };

  _el: HTMLElement;

  _onClickItem = event => {
    const value = event.currentTarget.dataset.value;
    this.props.onChange({ target: { id: 'templateName', value } });
  };

  componentDidMount() {
    this.ensureSelectionVisible();
  }

  componentDidUpdate() {
    this.ensureSelectionVisible();
  }

  ensureSelectionVisible() {
    const item = this._el.querySelector('.active') as HTMLElement;
    if (item) {
      const left = item.offsetLeft - 5;
      const right = item.offsetLeft + item.clientWidth + 5;

      if (left < this._el.scrollLeft) {
        this._el.scrollLeft = left;
      } else if (right > this._el.scrollLeft + this._el.clientWidth) {
        this._el.scrollLeft = right - this._el.clientWidth;
      }
    }
  }

  render() {
    let { resolvedData } = this.props;

    const { name, email, title } = resolvedData;
    if (!name && !email && !title) {
      resolvedData = Object.assign({}, resolvedData, {
        name: localized('Your name'),
        email: 'you@domain.com',
        title: localized('Job Title'),
      });
    }
    return (
      <div ref={el => (this._el = el)} className="signature-template-picker">
        {Templates.map((t, idx) => (
          <div
            key={idx}
            data-value={t.name}
            className={`option ${t.name === resolvedData.templateName && 'active'}`}
            onClick={this._onClickItem}
          >
            <div className="centered">
              <div className="preview">{t(resolvedData)}</div>
            </div>
          </div>
        ))}
        <div
          data-value={null}
          className={`option ${!resolvedData.templateName && 'active'}`}
          onClick={this._onClickItem}
        >
          <div className="centered">{localized('Raw HTML')}</div>
        </div>
      </div>
    );
  }
}
