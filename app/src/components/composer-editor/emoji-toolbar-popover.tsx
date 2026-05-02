import React from 'react';
import { RetinaImg, ScrollRegion } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

import categorizedEmojiList from './categorized-emoji';
import { getEmojiImagePath, searchEmojiNames } from './emoji-plugins';

const LocalizedCategoryNames = {
  People: localized('People'),
  Nature: localized('Nature'),
  'Food and Drink': localized('Food and Drink'),
  Activity: localized('Activity'),
  'Travel and Places': localized('Travel and Places'),
  Objects: localized('Objects'),
  Symbols: localized('Symbols'),
  Flags: localized('Flags'),
  'Frequently Used': localized('Frequently Used'),
  'Search Results': localized('Search Results'),
};

interface EmojiToolbarPopoverProps {
  onInsertEmoji: (emoji: string) => void;
}

type EmojiDict = {
  [category: string]: string[];
};

interface EmojiToolbarPopoverState {
  emojiName: string;
  categoryNames: string[];
  categoryPositions: any;
  searchValue: string;
  activeTab: string;
  categorizedEmoji: EmojiDict;
}
export default class EmojiToolbarPopover extends React.Component<
  EmojiToolbarPopoverProps,
  EmojiToolbarPopoverState
> {
  static displayName = 'EmojiToolbarPopover';

  _canvasEl: HTMLCanvasElement;
  _mounted = false;
  _emojiPreloadImage = new Image();

  constructor(props: EmojiToolbarPopoverProps) {
    super(props);
    const { categoryNames, categorizedEmoji, categoryPositions } = this.getStateFromStore();
    this.state = {
      emojiName: 'Emoji Picker',
      categoryNames: categoryNames,
      categorizedEmoji: categorizedEmoji,
      categoryPositions: categoryPositions,
      searchValue: '',
      activeTab: Object.keys(categorizedEmoji)[0],
    };
  }

  componentDidMount() {
    this._mounted = true;
    this.renderCanvas();
  }

  componentWillUnmount() {
    this._emojiPreloadImage.onload = null;
    this._emojiPreloadImage = null;
    this._mounted = false;
  }

  onMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const emojiName = this.calcEmojiByPosition(this.calcPosition(event));
    if (!emojiName) return null;
    this.props.onInsertEmoji(emojiName);
    return null;
  };

  onScroll = () => {
    const emojiContainer = document.querySelector(
      '.emoji-finder-container .scroll-region-content'
    ) as HTMLElement;
    const tabContainer = document.querySelector('.emoji-tabs') as HTMLElement;
    tabContainer.className = emojiContainer.scrollTop ? 'emoji-tabs shadow' : 'emoji-tabs';
    if (emojiContainer.scrollTop === 0) {
      this.setState({ activeTab: Object.keys(this.state.categorizedEmoji)[0] });
    } else {
      for (const category of Object.keys(this.state.categoryPositions)) {
        if (
          emojiContainer.scrollTop >= this.state.categoryPositions[category].top &&
          emojiContainer.scrollTop <= this.state.categoryPositions[category].bottom
        ) {
          this.setState({ activeTab: category });
        }
      }
    }
  };

  onHover = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const emojiName = this.calcEmojiByPosition(this.calcPosition(event));
    if (emojiName) {
      this.setState({ emojiName: emojiName });
    } else {
      this.setState({ emojiName: 'Emoji Picker' });
    }
  };

  onMouseOut = () => {
    this.setState({ emojiName: 'Emoji Picker' });
  };

  onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const results = this.state.categorizedEmoji['Search Results'];
      if (results && results.length === 1) {
        this.props.onInsertEmoji(results[0]);
      }
    }
  };

  onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const searchValue = event.target.value;
    if (searchValue.length > 0) {
      const searchMatches = this.findSearchMatches(searchValue);
      this.setState(
        {
          categorizedEmoji: {
            'Search Results': searchMatches,
          },
          categoryPositions: {
            'Search Results': {
              top: 25,
              bottom: 25 + Math.ceil(searchMatches.length / 6) * 34,
            },
          },
          searchValue: searchValue,
          activeTab: null,
        },
        this.renderCanvas
      );
    } else {
      this.setState(this.getStateFromStore, () => {
        this.setState(
          {
            searchValue: searchValue,
            activeTab: Object.keys(this.state.categorizedEmoji)[0],
          },
          this.renderCanvas
        );
      });
    }
  };

  getStateFromStore = () => {
    let categorizedEmoji = categorizedEmojiList as EmojiDict;
    const categoryPositions = {};
    let categoryNames = [
      'People',
      'Nature',
      'Food and Drink',
      'Activity',
      'Travel and Places',
      'Objects',
      'Symbols',
      'Flags',
    ];
    const frequentlyUsedEmoji: string[] = []; //EmojiStore.frequentlyUsedEmoji();
    if (frequentlyUsedEmoji.length > 0) {
      categorizedEmoji = { 'Frequently Used': frequentlyUsedEmoji };
      for (const category of Object.keys(categorizedEmojiList)) {
        categorizedEmoji[category] = categorizedEmojiList[category];
      }
      categoryNames = ['Frequently Used'].concat(categoryNames);
    }
    // Calculates where each category should be (variable because Frequently
    // Used may or may not be present)
    for (const name of categoryNames) {
      categoryPositions[name] = { top: 0, bottom: 0 };
    }
    let verticalPos = 25;
    for (const category of Object.keys(categoryPositions)) {
      const height = Math.ceil(categorizedEmoji[category].length / 6) * 34;
      categoryPositions[category].top = verticalPos;
      verticalPos += height;
      categoryPositions[category].bottom = verticalPos;
      verticalPos += 14;
    }
    return {
      categoryNames: categoryNames,
      categorizedEmoji: categorizedEmoji,
      categoryPositions: categoryPositions,
    };
  };

  scrollToCategory(category: string) {
    const container = document.querySelector('.emoji-finder-container .scroll-region-content');
    if (this.state.searchValue.length > 0) {
      this.setState({ searchValue: '' });
      this.setState(this.getStateFromStore, () => {
        this.renderCanvas();
        container.scrollTop = this.state.categoryPositions[category].top + 16;
      });
    } else {
      container.scrollTop = this.state.categoryPositions[category].top + 16;
    }
    this.setState({ activeTab: category });
  }

  findSearchMatches(searchValue: string) {
    return searchEmojiNames(searchValue);
  }

  calcPosition(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const position = {
      x: event.pageX - rect.left,
      y: event.pageY - rect.top,
    };
    return position;
  }

  calcEmojiByPosition = position => {
    for (const category of Object.keys(this.state.categoryPositions)) {
      const LEFT_BOUNDARY = 8;
      const RIGHT_BOUNDARY = 201;
      const EMOJI_WIDTH = 34;
      const EMOJI_HEIGHT = 34;
      const EMOJI_PER_ROW = 6;
      if (
        position.x >= LEFT_BOUNDARY &&
        position.x <= RIGHT_BOUNDARY &&
        position.y >= this.state.categoryPositions[category].top &&
        position.y <= this.state.categoryPositions[category].bottom
      ) {
        const x = Math.round((position.x + 5) / EMOJI_WIDTH);
        const y = Math.round(
          (position.y - this.state.categoryPositions[category].top + 10) / EMOJI_HEIGHT
        );
        const index = x + (y - 1) * EMOJI_PER_ROW - 1;
        return this.state.categorizedEmoji[category][index];
      }
    }
    return null;
  };

  renderTabs() {
    const tabs = [];
    this.state.categoryNames.forEach(category => {
      let className = `emoji-tab ${category.replace(/ /g, '-').toLowerCase()}`;
      if (category === this.state.activeTab) {
        className += ' active';
      }
      tabs.push(
        <div key={`${category} container`} style={{ flex: 1 }}>
          <RetinaImg
            key={`${category} tab`}
            className={className}
            name={`icon-emojipicker-${category.replace(/ /g, '-').toLowerCase()}.png`}
            mode={RetinaImg.Mode.ContentIsMask}
            onMouseDown={() => this.scrollToCategory(category)}
          />
        </div>
      );
    });
    return tabs;
  }

  renderCanvas() {
    const keys = Object.keys(this.state.categoryPositions);
    this._canvasEl.height = this.state.categoryPositions[keys[keys.length - 1]].bottom * 2 + 10;
    const ctx = this._canvasEl.getContext('2d');
    ctx.font = '24px Mailspring-Pro';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.clearRect(0, 0, this._canvasEl.width, this._canvasEl.height);
    const position = {
      x: 15,
      y: 45,
    };

    let idx = 0;
    const categoryNames = Object.keys(this.state.categorizedEmoji);
    const renderNextCategory = () => {
      if (!categoryNames[idx]) return;
      if (!this._mounted) return;
      this.renderCategory(categoryNames[idx], idx, ctx, position, renderNextCategory);
      idx += 1;
    };
    renderNextCategory();
  }

  renderCategory(
    category: string,
    i: number,
    ctx: CanvasRenderingContext2D,
    pos: { x: number; y: number },
    callback: () => void
  ) {
    const position = pos;
    if (i > 0) {
      position.x = 18;
      position.y += 48;
    }
    ctx.fillText(LocalizedCategoryNames[category] || category, position.x, position.y);
    position.x = 18;
    position.y += 48;

    const emojiNames = this.state.categorizedEmoji[category];
    if (!emojiNames || emojiNames.length === 0) return;

    const emojiToDraw = emojiNames.map((emojiName, j) => {
      const x = position.x;
      const y = position.y;
      const src = getEmojiImagePath(emojiName);

      if (position.x > 320 && j < this.state.categorizedEmoji[category].length - 1) {
        position.x = 18;
        position.y += 68;
      } else {
        position.x += 68;
      }

      return { src, x, y };
    });

    const drawEmojiAt = ({ src, x, y }: { src?: string; x?: number; y?: number } = {}) => {
      if (!src) {
        return;
      }
      this._emojiPreloadImage.onload = () => {
        this._emojiPreloadImage.onload = null;
        ctx.drawImage(this._emojiPreloadImage, x, y - 17, 44, 44);
        if (emojiToDraw.length === 0) {
          callback();
        } else {
          drawEmojiAt(emojiToDraw.shift());
        }
      };
      this._emojiPreloadImage.src = src;
    };

    drawEmojiAt(emojiToDraw.shift());
  }

  render() {
    return (
      <div className="emoji-button-popover" tabIndex={-1}>
        <div className="emoji-tabs">{this.renderTabs()}</div>
        <ScrollRegion className="emoji-finder-container" onScroll={this.onScroll}>
          <div className="emoji-search-container">
            <input
              type="text"
              className="search"
              value={this.state.searchValue}
              onChange={this.onChange}
              onKeyDown={this.onKeyDown}
            />
          </div>
          <canvas
            ref={el => {
              this._canvasEl = el;
            }}
            width="420"
            height="2000"
            onMouseDown={this.onMouseDown}
            onMouseOut={this.onMouseOut}
            onMouseMove={this.onHover}
            style={{ zoom: '0.5' }}
          />
        </ScrollRegion>
        <div className="emoji-name">{this.state.emojiName}</div>
      </div>
    );
  }
}
