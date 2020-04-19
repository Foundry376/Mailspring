import React from 'react';

export class MonthView extends React.Component<{ changeView: (view: string) => void }> {
  static displayName = 'MonthView';

  _onClick = () => {
    this.props.changeView('WeekView');
  };

  render() {
    return <button onClick={this._onClick}>Change to week</button>;
  }
}
