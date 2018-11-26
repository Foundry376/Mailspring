import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';

export default class ConversationBadge extends PureComponent {
    static propTypes = {
        count: PropTypes.number
    }

    render() {
        const { count } = this.props;
        return (
            count > 0 ? (
                <div className="badge">{count}</div>
            ) : null
        )
    }
}
