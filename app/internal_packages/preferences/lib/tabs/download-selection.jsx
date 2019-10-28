import React from 'react';
import fs from 'fs';
import { Menu, ButtonDropdown } from 'mailspring-component-kit';

export default class DownloadSelection extends React.Component {
  static displayName = 'DownloadSelection';

  constructor() {
    super();
    this.state = {
      items: [
        ['Downloads', 'Downloads'],
        ['Ask me every time', 'Ask me every time'],
        ['Choose a folder...', 'Choose a folder...'],
      ],
      fixedOptions: ['Downloads', 'Ask me every time'],
    };
  }

  _onChangeValue = ([value]) => {
    const { fixedOptions } = this.state;
    if (fixedOptions.indexOf(value) >= 0) {
      this.props.config.set(this.props.keyPath, value);
      this._dropdownComponent.toggleDropdown();
    } else {
      this._dropdownComponent.toggleDropdown();
      const openDirOption = {
        properties: ['openDirectory'],
      };
      const path = this.props.config.get(this.props.keyPath);
      if (typeof path === 'string' && fs.existsSync(path) && fs.lstatSync(path).isDirectory()) {
        openDirOption['defaultPath'] = path;
      } else {
        const userPath = AppEnv.getUserDirPath();
        if (userPath) {
          openDirOption['defaultPath'] = userPath + '/Downloads';
        }
        AppEnv.showOpenDialog(openDirOption, newPaths => {
          if (newPaths && newPaths.length > 0) {
            this.props.config.set(this.props.keyPath, newPaths[0]);
          }
        });
      }
    }
  };

  _getSelectedMenuItem = () => {
    const { fixedOptions } = this.state;
    const selected = this.props.config.get(this.props.keyPath);
    if (fixedOptions.indexOf(selected) >= 0) {
      return <span key={selected}>{selected}</span>;
    } else {
      return <span key={'chooseFolder'}>{selected}</span>;
    }
  };

  render() {
    const { items } = this.state;
    const menu = (
      <Menu
        items={items}
        itemKey={item => item}
        itemContent={([value]) => <span key={value}>{value}</span>}
        onSelect={this._onChangeValue}
      />
    );

    return (
      <div className="item">
        <label>Save downloaded files to:</label>
        <ButtonDropdown
          ref={cm => {
            this._dropdownComponent = cm;
          }}
          primaryItem={this._getSelectedMenuItem()}
          menu={menu}
        />
      </div>
    );
  }
}
