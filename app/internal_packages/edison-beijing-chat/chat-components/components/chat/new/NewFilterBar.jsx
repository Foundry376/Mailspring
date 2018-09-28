import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import ClearIcon from '../../common/icons/ClearIcon';
import FilterIcon from '../../common/icons/FilterIcon';
import { theme } from '../../../utils/colors';

export default class NewFilterBar extends PureComponent {
  static propTypes = {
    onFilterStringChanged: PropTypes.func,
  }

  static defaultProps = {
    onFilterStringChanged: () => { },
  }

  state = {
    filterString: '',
  }

  render() {
    const { filterString } = this.state;
    const { onFilterStringChanged } = this.props;

    return (
      <div className="filterBar">
        <FilterIcon
          className="filterIcon"
          color={theme.primaryColor}
        />
        <input
          className="filterField"
          type="text"
          placeholder="Filter"
          value={filterString}
          onChange={(event) => {
            const { target: { value } } = event;
            this.setState({ filterString: value });
            onFilterStringChanged(value);
          }}
        />
        {filterString.length ?
          <Button
            onTouchTap={
              () => {
                this.setState({ filterString: '' });
                onFilterStringChanged('');
              }
            }
          >
            <ClearIcon
              color={theme.primaryColor}
              size={18}
            />
          </Button> : null
        }
      </div>
    );
  }
}
