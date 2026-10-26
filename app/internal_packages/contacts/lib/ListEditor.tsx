import React from 'react';
import { isEqual } from 'underscore';
import { localized } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';

interface ListEditorProps<T> {
  items: T[];
  itemTemplate: T;
  addLabel: string;
  onChange: (items: T[]) => void;
  children: (item: T, onChange: (item: Partial<T>) => void) => React.ReactNode;
}

/** Edits a multi-value contact attribute. An empty list still shows one blank row so
there's somewhere to type, and "Add" appears once the last row has content. */
export class ListEditor<T> extends React.Component<ListEditorProps<T>> {
  render() {
    const { items, itemTemplate, addLabel, children, onChange } = this.props;

    const displayed = items.length ? items : [itemTemplate];
    const canAdd = !isEqual(displayed[displayed.length - 1], itemTemplate);

    return (
      <div className="contact-list-editor">
        {displayed.map((item, idx) => (
          <div className="contact-list-editor-row" key={idx}>
            <div className="contact-list-editor-fields">
              {children(item, (changes) => {
                onChange([
                  ...items.slice(0, idx),
                  { ...item, ...changes },
                  ...items.slice(idx + 1),
                ]);
              })}
            </div>
            <button
              className="contact-remove-button"
              title={localized('Remove')}
              aria-label={localized('Remove')}
              style={{ visibility: items.length ? 'visible' : 'hidden' }}
              onClick={() => onChange([...items.slice(0, idx), ...items.slice(idx + 1)])}
            >
              <SVGIcons.Remove />
            </button>
          </div>
        ))}
        {canAdd && (
          <button
            className="contact-add-button"
            onClick={() => onChange([...items, { ...itemTemplate }])}
          >
            {addLabel}
          </button>
        )}
      </div>
    );
  }
}
