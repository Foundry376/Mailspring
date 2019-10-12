import React from 'react';
import { isEqual } from 'underscore';

interface ListEditorProps<T> {
  items: T[];
  itemTemplate: T;
  onChange: (items: T[]) => void;
  children: (item: T, onChange: (item: Partial<T>) => void) => React.ReactNode;
}

export class ListEditor<T> extends React.Component<ListEditorProps<T>> {
  render() {
    const { items, itemTemplate, children, onChange } = this.props;

    const displayed = items.length ? items : [itemTemplate];

    return (
      <div>
        {displayed.map((item, idx) => (
          <div className="list-editor-item" key={idx}>
            {children(item, changes => {
              onChange([...items.slice(0, idx), { ...item, ...changes }, ...items.slice(idx + 1)]);
            })}
            {isEqual(item, itemTemplate) ? (
              <>
                <div className="add-spacer" />
                <div className="add-spacer" />
              </>
            ) : (
              <>
                <div
                  className="btn remove"
                  onClick={() => {
                    onChange([...items.slice(0, idx), ...items.slice(idx + 1)]);
                  }}
                >
                  –
                </div>
                {idx === items.length - 1 ? (
                  <div
                    className="btn add"
                    onClick={() => {
                      onChange([...items, { ...itemTemplate }]);
                    }}
                  >
                    +
                  </div>
                ) : (
                  <div className="add-spacer" />
                )}
              </>
            )}
          </div>
        ))}
      </div>
    );
  }
}
