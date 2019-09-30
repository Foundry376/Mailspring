import React from 'react';

interface YYMMDD {
  year: number;
  month: number;
  day: number;
}
interface YYMMDDInputProps {
  value: YYMMDD;
  onChange: (date: YYMMDD) => void;
}

export class YYMMDDInput extends React.Component<YYMMDDInputProps> {
  _year = React.createRef<HTMLInputElement>();
  _month = React.createRef<HTMLInputElement>();
  _day = React.createRef<HTMLInputElement>();

  _onBlur = () => {
    const year = Number(this._year.current.value);
    const month = Number(this._month.current.value);
    const day = Number(this._day.current.value);
    this.props.onChange({ year, month, day });
  };

  render() {
    const { year, month, day } = this.props.value;

    return (
      <>
        <div className="contact-edit-field">
          <label>Year</label>
          <input ref={this._year} type="number" defaultValue={`${year}`} onBlur={this._onBlur} />
        </div>
        <div className="contact-edit-field">
          <label>Month</label>
          <input
            max={12}
            min={1}
            ref={this._month}
            type="number"
            defaultValue={`${month}`}
            onBlur={this._onBlur}
          />
        </div>
        <div className="contact-edit-field">
          <label>Day</label>
          <input
            max={31}
            min={1}
            ref={this._day}
            type="number"
            defaultValue={`${day}`}
            onBlur={this._onBlur}
          />
        </div>
      </>
    );
  }
}
