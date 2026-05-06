import React from 'react';
import { localized } from 'mailspring-exports';
import GithubUserStore from './github-user-store';

// Small React component that renders a single Github repository
const GithubRepo = function GithubRepo(props: { repo: any }) {
  const { repo } = props;

  return (
    <div className="repo">
      <div className="stars">{repo.stargazers_count}</div>
      <a href={repo.html_url}>{repo.full_name}</a>
    </div>
  );
};

// Small React component that renders the user's Github profile.
const GithubProfile = function GithubProfile(props: { profile: any }) {
  const { profile } = props;

  // Transform the profile's array of repos into an array of React <GithubRepo> elements
  const repoElements = profile.repos.map((repo) => {
    return <GithubRepo key={repo.id} repo={repo} />;
  });

  // Remember - this looks like HTML, but it's actually JSX, which is converted into
  // JavaScript at transpile-time. We're actually creating a nested tree of Javascript
  // objects here that *represent* the DOM we want.
  return (
    <div className="profile">
      <img
        className="logo"
        alt="github logo"
        src="mailspring://github-contact-card/assets/github.png"
      />
      <a href={profile.html_url}>{profile.login}</a>
      <div>{repoElements}</div>
    </div>
  );
};

export default class GithubContactCardSection extends React.Component<
  Record<string, unknown>,
  { loading: boolean; profile: any }
> {
  static displayName = 'GithubContactCardSection';

  static containerStyles = {
    order: 10,
  };

  _unsubscribe?: () => void;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    // When our component mounts, start listening to the GithubUserStore.
    // When the store `triggers`, our `_onChange` method will fire and allow
    // us to replace our state.
    this._unsubscribe = GithubUserStore.listen(this._onChange);
  }

  componentWillUnmount() {
    this._unsubscribe();
  }

  _getStateFromStores = () => {
    return {
      profile: GithubUserStore.profileForFocusedContact(),
      loading: GithubUserStore.loading(),
    };
  };

  // The data vended by the GithubUserStore has changed. Calling `setState:`
  // will cause React to re-render our view to reflect the new values.
  _onChange = () => {
    this.setState(this._getStateFromStores());
  };

  _renderInner() {
    // Handle various loading states by returning early
    if (this.state.loading) {
      return <div className="pending">{localized('Loading...')}</div>;
    }

    if (!this.state.profile) {
      return <div className="pending">{localized('No Matching Profile')}</div>;
    }

    return <GithubProfile profile={this.state.profile} />;
  }

  render() {
    return (
      <div className="sidebar-github-profile">
        <h2>GitHub</h2>
        {this._renderInner()}
      </div>
    );
  }
}
