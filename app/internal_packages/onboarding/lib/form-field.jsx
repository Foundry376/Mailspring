import React from 'react';
import PropTypes from 'prop-types';
import { RetinaImg } from 'mailspring-component-kit';

class FormField extends React.Component {
  constructor() {
    super();
    this.state = {
      show_password: false
    }
  }
  toggleShowPassword = () => {
    this.setState({
      show_password: !this.state.show_password
    })
  }
  render() {
    const props = this.props;
    const field = props.field;
    let val = props.account[field];
    if (props.field.includes('.')) {
      const [parent, key] = props.field.split('.');
      val = props.account[parent][key];
    }
    let type = props.type || 'text';
    if (this.state.show_password) {
      type = 'text';
    }
    return (
      <span className="form-field">
        <label htmlFor={props.field}>{props.title}:</label>
        <input
          type={type}
          id={props.field}
          style={props.style}
          className={val && props.errorFieldNames.includes(props.field) ? 'error' : ''}
          disabled={props.submitting}
          spellCheck="false"
          value={val || ''}
          onKeyPress={props.onFieldKeyPress}
          onChange={props.onFieldChange}
        />
        {
          props.type === 'password' && (
            <span
              className={'show-password ' + (this.state.show_password ? 'show' : 'hiden')}
              onClick={this.toggleShowPassword}
            >
              <RetinaImg
                name={this.state.show_password ? 'show-password.svg' : 'readReceipts.svg'}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask}
                style={{ width: 20 }}
              />
            </span>
          )
        }
      </span>
    );
  }
}


FormField.propTypes = {
  field: PropTypes.string,
  title: PropTypes.string,
  type: PropTypes.string,
  style: PropTypes.object,
  submitting: PropTypes.bool,
  onFieldKeyPress: PropTypes.func,
  onFieldChange: PropTypes.func,
  errorFieldNames: PropTypes.array,
  account: PropTypes.object,
};

export default FormField;
