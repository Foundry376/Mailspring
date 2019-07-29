import React from 'react';
import RetinaImg from '../retina-img';
import ScrollRegion from '../scroll-region';

import categorizedEmojiList from './categorized-emoji';
import { getEmojiImagePath } from './emoji-plugins';

const emojiHeight = 24;
const emojiWidth = 24;
const categoryTextSize = 12;
const categoryTextLeftStartPosition = 7;
const canvasWidth = 200;
const emojiLeftStartingPosition = 9;
const scrollOffSet = 16;
const canvasStartVerticalPosition = categoryTextSize + 4;
const emojiLineHeight = emojiHeight + 8;
const emojiItemWidth = emojiWidth + 8;
const emojiCategoryTextLineHeight = categoryTextSize + 4;
const emptyLineBeforeCategoryTextLineHeight = emojiCategoryTextLineHeight;
const emptyLineAfterCategoryTextLineHeight = emojiCategoryTextLineHeight / 2;
const numItemsPerLine = Math.floor(canvasWidth / emojiItemWidth);
const emojiRightMostPossiblePosition = canvasWidth - emojiItemWidth;
const emojiRightLastDrawPosition = emojiItemWidth * numItemsPerLine + emojiLeftStartingPosition;

export default class EmojiToolbarPopover extends React.Component {
  static displayName = 'EmojiToolbarPopover';

  constructor() {
    super();
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
    this._emojiPreloadImage = new Image();
    this.renderCanvas();
  }

  componentWillUnmount() {
    this._emojiPreloadImage.onload = null;
    this._emojiPreloadImage = null;
    this._mounted = false;
  }

  onMouseDown = event => {
    const emojiName = this.calcEmojiByPosition(this.calcPosition(event));
    if (!emojiName) return null;
    this.props.onInsertEmoji(emojiName);
    return null;
  };

  onScroll = () => {
    const emojiContainer = document.querySelector('.emoji-finder-container .scroll-region-content');
    const tabContainer = document.querySelector('.emoji-tabs');
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

  onHover = event => {
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

  onChange = event => {
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
              top: canvasStartVerticalPosition,
              bottom: canvasStartVerticalPosition + Math.ceil(searchMatches.length / numItemsPerLine) * emojiLineHeight + emptyLineBeforeCategoryTextLineHeight,
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
    let categorizedEmoji = categorizedEmojiList;
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
    const frequentlyUsedEmoji = []; //EmojiStore.frequentlyUsedEmoji();
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
    let verticalPos = canvasStartVerticalPosition;
    for (const category of Object.keys(categoryPositions)) {
      const height =
        Math.ceil(categorizedEmoji[category].length / numItemsPerLine) * emojiLineHeight + emptyLineBeforeCategoryTextLineHeight;
      categoryPositions[category].top = verticalPos;
      verticalPos += height;
      categoryPositions[category].bottom = verticalPos;
      verticalPos += emptyLineAfterCategoryTextLineHeight;
    }
    return {
      categoryNames: categoryNames,
      categorizedEmoji: categorizedEmoji,
      categoryPositions: categoryPositions,
    };
  };

  scrollToCategory(category) {
    const container = document.querySelector('.emoji-finder-container .scroll-region-content');
    if (this.state.searchValue.length > 0) {
      this.setState({ searchValue: '' });
      this.setState(this.getStateFromStore, () => {
        this.renderCanvas();
        container.scrollTop = this.state.categoryPositions[category].top + scrollOffSet;
      });
    } else {
      container.scrollTop = this.state.categoryPositions[category].top + scrollOffSet;
    }
    this.setState({ activeTab: category });
  }

  findSearchMatches(searchValue) {
    // TODO: Find matches for aliases, too.
    const searchMatches = [];
    for (const category of Object.keys(categorizedEmojiList)) {
      categorizedEmojiList[category].forEach(emojiName => {
        if (emojiName.indexOf(searchValue) !== -1) {
          searchMatches.push(emojiName);
        }
      });
    }
    return searchMatches;
  }

  calcPosition(event) {
    const rect = event.target.getBoundingClientRect();
    const position = {
      x: event.pageX - rect.left,
      y: event.pageY - rect.top,
    };
    console.log(`mouse position in canvas ${JSON.stringify(position)}`);
    return position;
  }

  calcEmojiByPosition = position => {
    for (const category of Object.keys(this.state.categoryPositions)) {
      if (
        position.x >= emojiLeftStartingPosition &&
        position.x <= emojiRightLastDrawPosition &&
        position.y >=
          this.state.categoryPositions[category].top + emptyLineAfterCategoryTextLineHeight &&
        position.y <= this.state.categoryPositions[category].bottom - emptyLineBeforeCategoryTextLineHeight
      ) {
        const x = Math.floor((position.x - emojiLeftStartingPosition) / emojiItemWidth);
        const y = Math.floor(
          (position.y - this.state.categoryPositions[category].top - emptyLineAfterCategoryTextLineHeight) / emojiLineHeight
        );
        const index = x + y * numItemsPerLine;
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
        <div key={`${category} container`} style={{ flex: 1}} >
          <RetinaImg
            key={`${category} tab`}
            className={className}
            name={`popover-${category.replace(/ /g, '-').toLowerCase()}.svg`}
            mode={RetinaImg.Mode.ContentIsMask}
            isIcon
            style={{width: 18}}
            onMouseDown={() => this.scrollToCategory(category)}
          />
        </div>
      );
    });
    return tabs;
  }

  renderCanvas() {
    // const keys = Object.keys(this.state.categoryPositions);
    this._canvasEl.height = Object.values(this.state.categoryPositions).map((item)=>{
      return item.bottom;
    }).reduce((a ,b)=>{
      return Math.max(a,b);
    });
    // this._canvasEl.height = this.state.categoryPositions[keys[keys.length - 1]].bottom * 2;
    const ctx = this._canvasEl.getContext('2d');
    ctx.font = `${categoryTextSize}px Nylas-Pro`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.clearRect(0, 0, this._canvasEl.width, this._canvasEl.height);
    const position = {
      x: categoryTextLeftStartPosition,
      y: canvasStartVerticalPosition,
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

  renderCategory(category, i, ctx, pos, callback) {
    const position = pos;
    if (i > 0) {
      position.x = categoryTextLeftStartPosition;
      position.y += emojiLineHeight + emptyLineBeforeCategoryTextLineHeight;
    }
    ctx.fillText(category, position.x, position.y);
    position.x = emojiLeftStartingPosition;
    position.y += emptyLineAfterCategoryTextLineHeight;

    const emojiNames = this.state.categorizedEmoji[category];
    if (!emojiNames || emojiNames.length === 0) return;

    const emojiToDraw = emojiNames.map((emojiName, j) => {
      const x = position.x;
      const y = position.y;
      const src = getEmojiImagePath(emojiName);

      if (
        position.x > emojiRightMostPossiblePosition &&
        j < this.state.categorizedEmoji[category].length - 1
      ) {
        position.x = emojiLeftStartingPosition;
        position.y += emojiLineHeight;
      } else {
        position.x += emojiItemWidth;
      }

      return { src, x, y };
    });

    const drawEmojiAt = ({ src, x, y } = {}) => {
      if (!src) {
        return;
      }
      this._emojiPreloadImage.onload = () => {
        this._emojiPreloadImage.onload = null;
        ctx.drawImage(this._emojiPreloadImage, x, y, emojiWidth, emojiHeight);
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
      <div className="emoji-button-popover" tabIndex="-1">
        <div className="emoji-tabs">{this.renderTabs()}</div>
        <ScrollRegion className="emoji-finder-container" onScroll={this.onScroll}>
          <div className="emoji-search-container">
            <input
              type="text"
              className="search"
              value={this.state.searchValue}
              onChange={this.onChange}
            />
          </div>
          <canvas
            ref={el => {
              this._canvasEl = el;
            }}
            width={canvasWidth}
            height="2000"
            onMouseDown={this.onMouseDown}
            onMouseOut={this.onMouseOut}
            onMouseMove={this.onHover}
            style={{ zoom: '1' }}
          />
        </ScrollRegion>
        <div className="emoji-name">{this.state.emojiName}</div>
      </div>
    );
  }
}
