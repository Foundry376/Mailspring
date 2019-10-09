'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _reactPortal = require('react-portal');

var _reactPortal2 = _interopRequireDefault(_reactPortal);

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _slatePropTypes = require('slate-prop-types');

var _slatePropTypes2 = _interopRequireDefault(_slatePropTypes);

var _propTypes = require('prop-types');

var _propTypes2 = _interopRequireDefault(_propTypes);

var _slateDevLogger = require('slate-dev-logger');

var _slateDevLogger2 = _interopRequireDefault(_slateDevLogger);

var _slate = require('slate');

var _eventHandlers = require('../constants/event-handlers');

var _eventHandlers2 = _interopRequireDefault(_eventHandlers);

var _pluginProps = require('../constants/plugin-props');

var _pluginProps2 = _interopRequireDefault(_pluginProps);

var _after = require('../plugins/after');

var _after2 = _interopRequireDefault(_after);

var _before = require('../plugins/before');

var _before2 = _interopRequireDefault(_before);

var _noop = require('../utils/noop');

var _noop2 = _interopRequireDefault(_noop);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * Debug.
 *
 * @type {Function}
 */

var debug = (0, _debug2.default)('slate:editor');

/**
 * Editor.
 *
 * @type {Component}
 */

var Editor = function (_React$Component) {
  _inherits(Editor, _React$Component);

  /**
   * Constructor.
   *
   * @param {Object} props
   */

  /**
   * Property types.
   *
   * @type {Object}
   */

  function Editor(props) {
    _classCallCheck(this, Editor);

    var _this = _possibleConstructorReturn(this, (Editor.__proto__ || Object.getPrototypeOf(Editor)).call(this, props));

    _initialiseProps.call(_this);

    _this.state = {};
    _this.tmp = {};
    _this.tmp.updates = 0;
    _this.tmp.resolves = 0;

    // Resolve the plugins and create a stack and schema from them.
    var plugins = _this.resolvePlugins(props.plugins, props.schema);
    var stack = _slate.Stack.create({ plugins: plugins });
    var schema = _slate.Schema.create({ plugins: plugins });
    _this.state.schema = schema;
    _this.state.stack = stack;

    // Run `onChange` on the passed-in value because we need to ensure that it
    // is normalized, and queue the resulting change.
    var change = props.value.change();
    stack.run('onChange', change, _this);
    _this.queueChange(change);
    _this.state.value = change.value;

    // Create a bound event handler for each event.
    _eventHandlers2.default.forEach(function (handler) {
      _this[handler] = function () {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        _this.onEvent.apply(_this, [handler].concat(args));
      };
    });
    return _this;
  }

  /**
   * When the `props` are updated, create a new `Stack` if necessary and run
   * `onChange` to ensure the value is normalized.
   *
   * @param {Object} props
   */

  /**
   * Default properties.
   *
   * @type {Object}
   */

  /**
   * When the component first mounts, flush any temporary changes.
   */

  /**
   * When the component updates, flush any temporary change.
   */

  /**
   * Queue a `change` object, to be able to flush it later. This is required for
   * when a change needs to be applied to the value, but because of the React
   * lifecycle we can't apply that change immediately. So we cache it here and
   * later can call `this.flushChange()` to flush it.
   *
   * @param {Change} change
   */

  /**
   * Flush a temporarily stored `change` object, for when a change needed to be
   * made but couldn't because of React's lifecycle.
   */

  /**
   * Perform a change on the editor, passing `...args` to `change.call`.
   *
   * @param {Mixed} ...args
   */

  /**
   * Programmatically blur the editor.
   */

  /**
   * Programmatically focus the editor.
   */

  _createClass(Editor, [{
    key: 'render',


    /**
     * Render the editor.
     *
     * @return {Element}
     */

    value: function render() {
      debug('render', this);

      var children = this.stack.map('renderPortal', this.value, this).map(function (child, i) {
        return _react2.default.createElement(
          _reactPortal2.default,
          { key: i, isOpened: true },
          child
        );
      });

      var props = _extends({}, this.props, { children: children });
      var tree = this.stack.render('renderEditor', props, this);
      return tree;
    }

    /**
     * Resolve an array of plugins from `plugins` and `schema` props.
     *
     * In addition to the plugins provided in props, this will initialize three
     * other plugins:
     *
     * - The top-level editor plugin, which allows for top-level handlers, etc.
     * - The two "core" plugins, one before all the other and one after.
     *
     * @param {Array|Void} plugins
     * @param {Schema|Object|Void} schema
     * @return {Array}
     */

  }, {
    key: 'schema',


    /**
     * Getters for exposing public properties of the editor's state.
     */

    get: function get() {
      return this.state.schema;
    }
  }, {
    key: 'stack',
    get: function get() {
      return this.state.stack;
    }
  }, {
    key: 'value',
    get: function get() {
      return this.state.value;
    }

    /**
     * On event.
     *
     * @param {String} handler
     * @param {Event} event
     */

    /**
     * On change.
     *
     * @param {Change} change
     */

  }]);

  return Editor;
}(_react2.default.Component);

/**
 * Mix in the property types for the event handlers.
 */

Editor.propTypes = {
  autoCorrect: _propTypes2.default.bool,
  autoFocus: _propTypes2.default.bool,
  className: _propTypes2.default.string,
  onChange: _propTypes2.default.func,
  placeholder: _propTypes2.default.any,
  plugins: _propTypes2.default.array,
  readOnly: _propTypes2.default.bool,
  role: _propTypes2.default.string,
  schema: _propTypes2.default.object,
  spellCheck: _propTypes2.default.bool,
  style: _propTypes2.default.object,
  tabIndex: _propTypes2.default.number,
  value: _slatePropTypes2.default.value.isRequired
};
Editor.defaultProps = {
  autoFocus: false,
  autoCorrect: true,
  onChange: _noop2.default,
  plugins: [],
  readOnly: false,
  schema: {},
  spellCheck: true
};

var _initialiseProps = function _initialiseProps() {
  var _this2 = this;

  this.UNSAFE_componentWillReceiveProps = function (props) {
    var schema = _this2.schema,
        stack = _this2.stack;

    // Increment the updates counter as a baseline.

    _this2.tmp.updates++;

    // If the plugins or the schema have changed, we need to re-resolve the
    // plugins, since it will result in a new stack and new validations.
    if (props.plugins != _this2.props.plugins || props.schema != _this2.props.schema) {
      var plugins = _this2.resolvePlugins(props.plugins, props.schema);
      stack = _slate.Stack.create({ plugins: plugins });
      schema = _slate.Schema.create({ plugins: plugins });
      _this2.setState({ schema: schema, stack: stack });

      // Increment the resolves counter.
      _this2.tmp.resolves++;

      // If we've resolved a few times already, and it's exactly in line with
      // the updates, then warn the user that they may be doing something wrong.
      if (_this2.tmp.resolves > 5 && _this2.tmp.resolves == _this2.tmp.updates) {
        _slateDevLogger2.default.warn('A Slate <Editor> is re-resolving `props.plugins` or `props.schema` on each update, which leads to poor performance. This is often due to passing in a new `schema` or `plugins` prop with each render by declaring them inline in your render function. Do not do this!');
      }
    }

    // Run `onChange` on the passed-in value because we need to ensure that it
    // is normalized, and queue the resulting change.
    var change = props.value.change();
    stack.run('onChange', change, _this2);
    _this2.queueChange(change);
    _this2.setState({ value: change.value });
  };

  this.componentDidMount = function () {
    _this2.flushChange();
  };

  this.componentDidUpdate = function () {
    _this2.flushChange();
  };

  this.queueChange = function (change) {
    if (change.operations.size) {
      debug('queueChange', { change: change });
      _this2.tmp.change = change;
    }
  };

  this.flushChange = function () {
    var change = _this2.tmp.change;


    if (change) {
      debug('flushChange', { change: change });
      delete _this2.tmp.change;
      _this2.props.onChange(change);
    }
  };

  this.change = function () {
    var _value$change;

    var change = (_value$change = _this2.value.change()).call.apply(_value$change, arguments);
    _this2.onChange(change);
  };

  this.blur = function () {
    _this2.change(function (c) {
      return c.blur();
    });
  };

  this.focus = function () {
    _this2.change(function (c) {
      return c.focus();
    });
  };

  this.onEvent = function (handler, event) {
    _this2.change(function (change) {
      _this2.stack.run(handler, event, change, _this2);
    });
  };

  this.onChange = function (change) {
    debug('onChange', { change: change });

    _this2.stack.run('onChange', change, _this2);
    var value = change.value;
    var onChange = _this2.props.onChange;

    if (value == _this2.value) return;
    onChange(change);
  };

  this.resolvePlugins = function (plugins, schema) {
    var beforePlugin = (0, _before2.default)();
    var afterPlugin = (0, _after2.default)();
    var editorPlugin = {
      schema: schema || {}
    };

    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      var _loop = function _loop() {
        var prop = _step2.value;

        // Skip `onChange` because the editor's `onChange` is special.
        if (prop == 'onChange') return 'continue';

        // Skip `schema` because it can't be proxied easily, so it must be
        // passed in as an argument to this function instead.
        if (prop == 'schema') return 'continue';

        // Define a function that will just proxies into `props`.
        editorPlugin[prop] = function () {
          var _props;

          return _this2.props[prop] && (_props = _this2.props)[prop].apply(_props, arguments);
        };
      };

      for (var _iterator2 = _pluginProps2.default[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var _ret = _loop();

        if (_ret === 'continue') continue;
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2.return) {
          _iterator2.return();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }

    return [beforePlugin, editorPlugin].concat(_toConsumableArray(plugins || []), [afterPlugin]);
  };
};

var _iteratorNormalCompletion = true;
var _didIteratorError = false;
var _iteratorError = undefined;

try {
  for (var _iterator = _eventHandlers2.default[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
    var _prop = _step.value;

    Editor.propTypes[_prop] = _propTypes2.default.func;
  }

  /**
   * Export.
   *
   * @type {Component}
   */
} catch (err) {
  _didIteratorError = true;
  _iteratorError = err;
} finally {
  try {
    if (!_iteratorNormalCompletion && _iterator.return) {
      _iterator.return();
    }
  } finally {
    if (_didIteratorError) {
      throw _iteratorError;
    }
  }
}

exports.default = Editor;