import React from 'react';
import { shell } from 'electron';
import classnames from 'classnames';
import { RetinaImg } from './retina-img';
import { IdentityStore } from '../flux/stores/identity-store';

type OpenIdentityPageButtonProps = {
  path?: string;
  label?: string;
  source?: string;
  campaign?: string;
  img?: string;
  isCTA?: boolean;
};
type OpenIdentityPageButtonState = {
  loading: boolean;
};

export default class OpenIdentityPageButton extends React.Component<
  OpenIdentityPageButtonProps,
  OpenIdentityPageButtonState
> {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
    };
  }

  _onClick = () => {
    this.setState({ loading: true });
    IdentityStore.fetchSingleSignOnURL(this.props.path, {
      source: this.props.source,
      campaign: this.props.campaign,
      content: this.props.label,
    }).then((url) => {
      this.setState({ loading: false });
      if (/^https?:\/\/.+/i.test(url)) {
        shell.openExternal(url);
      }
    });
  };

  render() {
    const cls = classnames({
      btn: true,
      'btn-emphasis': this.props.isCTA,
    });
    if (this.state.loading) {
      return (
        <div className={`${cls} btn-disabled`}>
          <RetinaImg
            name="sending-spinner.gif"
            width={15}
            height={15}
            mode={RetinaImg.Mode.ContentPreserve}
          />
          &nbsp;{this.props.label}&hellip;
        </div>
      );
    }
    if (this.props.img) {
      return (
        <div className={cls} onClick={this._onClick}>
          <RetinaImg
            name={this.props.img}
            mode={this.props.isCTA ? RetinaImg.Mode.ContentIsMask : RetinaImg.Mode.ContentPreserve}
          />
          &nbsp;&nbsp;{this.props.label}
        </div>
      );
    }
    return (
      <div className={cls} onClick={this._onClick}>
        {this.props.label}
      </div>
    );
  }
}
