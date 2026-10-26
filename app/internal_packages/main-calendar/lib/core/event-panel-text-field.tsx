import React from 'react';

interface EventPanelTextFieldProps {
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
  className?: string;
  /** A textarea that grows with its text, where Enter starts a new line. */
  multiline?: boolean;
  /** Shown instead of the field until it is clicked, e.g. notes with their links live. */
  display?: React.ReactNode;
}

interface EventPanelTextFieldState {
  /** What the field holds while focused; null when not editing. */
  draft: string | null;
  /** The value just saved, shown until the saved event comes back. */
  saved: string | null;
}

/**
 * Text the event panel saves when the field loses focus, or on Enter in a single line. Esc puts
 * back the saved value without saving.
 */
export class EventPanelTextField extends React.Component<
  EventPanelTextFieldProps,
  EventPanelTextFieldState
> {
  static displayName = 'EventPanelTextField';

  state: EventPanelTextFieldState = { draft: null, saved: null };

  _field = React.createRef<HTMLInputElement & HTMLTextAreaElement>();
  _reverting = false;

  componentDidUpdate(prevProps: EventPanelTextFieldProps, prevState: EventPanelTextFieldState) {
    if (prevProps.value !== this.props.value && this.state.saved !== null) {
      this.setState({ saved: null });
    }
    if (this.props.multiline) this._fitHeight();
    if (prevState.draft === null && this.state.draft !== null) this._field.current?.focus();
  }

  focus() {
    this._startEditing();
  }

  _shown() {
    return this.state.draft ?? this.state.saved ?? this.props.value;
  }

  _startEditing = () => {
    if (this.state.draft === null) {
      this.setState({ draft: this._shown() });
    }
  };

  // A link in the display opens the link rather than the field.
  _onDisplayClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('a')) this._startEditing();
  };

  _fitHeight() {
    const el = this._field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  _onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      this._reverting = true;
      this._field.current?.blur();
    } else if (e.key === 'Enter' && !this.props.multiline) {
      this._field.current?.blur();
    }
  };

  _onBlur = () => {
    const { draft } = this.state;
    const reverting = this._reverting;
    this._reverting = false;
    if (reverting || draft === null || draft === this._savedOrValue()) {
      this.setState({ draft: null });
      return;
    }
    this.setState({ draft: null, saved: draft });
    this.props.onSave(draft);
  };

  _savedOrValue() {
    return this.state.saved ?? this.props.value;
  }

  render() {
    const { placeholder, multiline, display, className } = this.props;
    const { draft } = this.state;
    if (display && draft === null && this._shown()) {
      return (
        <div className={className} onClick={this._onDisplayClick}>
          {display}
        </div>
      );
    }
    const Field = multiline ? 'textarea' : 'input';
    return (
      <Field
        ref={this._field}
        className={className}
        value={this._shown()}
        placeholder={placeholder}
        rows={multiline ? 1 : undefined}
        onFocus={this._startEditing}
        onChange={(e) => this.setState({ draft: e.target.value })}
        onKeyDown={this._onKeyDown}
        onBlur={this._onBlur}
      />
    );
  }
}
