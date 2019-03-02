import { shell } from 'electron';
import React from 'react';
import { localized, PropTypes, Thread } from 'mailspring-exports';
import { RetinaImg, KeyCommandsRegion } from 'mailspring-component-kit';

import GithubStore from './github-store';

/**
The `ViewOnGithubButton` displays a button whenever there's a relevant
Github asset to link to.

When creating this React component the first consideration was when &
where we'd be rendered. The next consideration was what data we need to
display.

Unlike a traditional React application, Mailspring components have very few
guarantees on who will render them and where they will be rendered. In our
`lib/main.cjsx` file we registered this component with our
{ComponentRegistry} for the `"ThreadActionsToolbarButton"` role. That means that
whenever the "ThreadActionsToolbarButton" region gets rendered, we'll render
everything registered with that area. Other buttons, such as "Archive" and
the "Change Label" button are reigstered with that role, so we should
expect ourselves to showup alongside them.

The only data we need is a single relevant to Github. If we have one,
we'll open it up in a browser. If we don't have one, we'll hide the
component.

Getting that url takes a bit of message parsing. We need to retrieve a
message body then implement some kind of regex to find and parse out that
link.

We could have put all of that logic in this React Component, but that's
not what React components should be doing. In Mailspring a component's only
job is to display known data and be the first responders to user interaction.

We instead create a {GithubStore} to handle the fetching and preparation
of the data. See that file's documentation for more on how that works.

As far as this component is concerned, there will be an entity called
`GitHubStore` that will expose the correct `link`. That store will then
notify us when the `link` changes so we can update our state.

Once we know our `link` our `render` method can simply be a description of
how we want to display that link. In this case we're going to make a
simple button with a GitHub logo in it.

We'll also display nothing if there is no link.
*/
export default class ViewOnGithubButton extends React.Component<
  { items: Thread[] },
  { link: string }
> {
  static displayName = 'ViewOnGithubButton';

  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array,
  };

  /** ** React methods ****
   * The following methods are React methods that we override. See {React}
   * documentation for more info
   */
  _unlisten: () => void;
  _keymapHandlers: {
    [command: string]: () => void;
  };

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
    this._keymapHandlers = {
      'github:open': this._openLink,
    };
  }

  /*
   * When components mount, it's very common to have them listen to a
   * `Store`. Since most of our React Components are registered into
   * {ComponentRegistry} regions instead of manually rendered top-down much
   * of our data is side-loaded from stores instead of passed in as props.
  */
  componentDidMount() {
    /*
    * The `listen` method of {MailspringStore}s (which {GithubStore}
    * subclasses) returns an "unlistener" function. When the unlistener is
    * invoked (as it is in `componentWillUnmount`) the listener references
    * are cleaned up. Every time the `GithubStore` calls its `trigger`
    * method, the `_onStoreChanged` callback will be fired.
    */
    this._unlisten = GithubStore.listen(this._onStoreChanged);
  }

  componentWillUnmount() {
    this._unlisten();
  }

  /** ** Super common Mailspring Component private methods ****
  /*
  * An extremely common pattern for all Mailspring components are the methods
  * `onStoreChanged` and `getStateFromStores`.
  *
  * Most components listen to some source of data, which is usally a
  * Store. When the store notifies that something has changed, we need to
  * fetch the fresh data and updated our state.
  *
  * Note that when a Store updates it does not let us know what changed.
  * This is intentional! This forces us to fresh the full latest state
  * from the stores in a more declarative, easy-to-follow way. There are a
  * couple rare exceptions that are only used for performance
  * optimizations.
  */
  _onStoreChanged = () => {
    this.setState(this._getStateFromStores());
  };

  /*
  * getStateFromStores fetches the data the view needs from the
  * appropriate data source (our GithubStore). We return a basic object
  * that can be passed directly into `setState`.
  */
  _getStateFromStores() {
    return {
      link: GithubStore.link(),
    };
  }

  /** ** Other utility "private" methods ****
  /*
  * This responds to user interaction. Since it's a callback we have to
  * bind it to the instances's `this` (JavaScript fat arrow `=>`)
  *
  * In the case of this component we use the Electron `shell` module to
  * request the computer to open the default browser.
  *
  * In other very common cases, user interaction handlers may fire an
  * `Action` across the system for other Stores to respond to. They may
  * also queue a {Task} to eventually perform a mutating API POST or PUT
  * request.
  */
  _openLink = () => {
    if (this.state.link) {
      shell.openExternal(this.state.link);
    }
  };

  render() {
    if (this.props.items.length !== 1) {
      return false;
    }
    if (!this.state.link) {
      return false;
    }
    return (
      <KeyCommandsRegion globalHandlers={this._keymapHandlers}>
        <button
          className="btn btn-toolbar btn-view-on-github"
          onClick={this._openLink}
          title={localized('Visit Thread on GitHub')}
        >
          <RetinaImg
            mode={RetinaImg.Mode.ContentIsMask}
            url="mailspring://message-view-on-github/assets/github@2x.png"
          />
        </button>
      </KeyCommandsRegion>
    );
  }
}
