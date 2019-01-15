import { React, PropTypes } from 'mailspring-exports';


export default class QuickSidebar extends React.Component {
  static displayName = 'QuickSidebar';

  static containerStyles = {
    order: 10,
  };

  constructor(props) {
    super(props);
    this.state = {};
  }



  render() {
    return (
      <div className="sidebar-quick">
        <h2>Quick</h2>
      </div>
    );
  }
}
