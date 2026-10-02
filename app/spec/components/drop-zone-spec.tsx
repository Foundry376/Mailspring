import React from 'react';
import { findRenderedDOMComponentWithClass, Simulate } from 'react-dom/test-utils';

import { DropZone } from '../../src/components/drop-zone';
import MTestUtils from '../mailspring-test-utils';

// A drop target only receives a drop event if something calls preventDefault on
// dragover. The composer wraps a Slate editor, and drags that begin inside Slate
// are Slate's to manage, so DropZone steps aside for those — but stepping aside
// for every drag over the editor left the middle of the composer, the largest
// and most obvious drop target, silently refusing drops.
const dragEventData = (types: string[]) => ({
  dataTransfer: {
    types,
    effectAllowed: 'copy',
    dropEffect: 'none',
    getData: () => '',
  },
});

const renderZone = (shouldAcceptDrop: (e: any) => boolean) =>
  MTestUtils.renderIntoDocument(
    <DropZone
      className="zone"
      shouldAcceptDrop={shouldAcceptDrop}
      onDrop={() => {}}
      onDragStateChange={() => {}}
    >
      <div className="editor" data-slate-editor>
        <span className="inside-editor">body</span>
      </div>
      <div className="outside-editor">footer</div>
    </DropZone>
  ) as any;

describe('DropZone', function dropZone() {
  describe('dragging over the Slate editor', () => {
    it('allows the drop when the zone accepts the drag', () => {
      const zone = renderZone(() => true);
      const target = findRenderedDOMComponentWithClass(zone, 'inside-editor');
      const event = dragEventData(['mailspring-threads-data']);

      Simulate.dragOver(target, event as any);

      // preventDefault is what makes the browser deliver a drop here at all
      expect(event.dataTransfer.dropEffect).toEqual('copy');
    });

    it('leaves the drag alone when the zone does not accept it', () => {
      const zone = renderZone(() => false);
      const target = findRenderedDOMComponentWithClass(zone, 'inside-editor');
      const event = dragEventData(['application/x-slate-fragment']);

      Simulate.dragOver(target, event as any);

      // Untouched: Slate sets its own drop effect and draws the caret
      expect(event.dataTransfer.dropEffect).toEqual('none');
    });
  });

  describe('dragging elsewhere in the zone', () => {
    it('allows the drop without consulting the editor exception', () => {
      const zone = renderZone(() => false);
      const target = findRenderedDOMComponentWithClass(zone, 'outside-editor');
      const event = dragEventData(['Files']);

      Simulate.dragOver(target, event as any);

      expect(event.dataTransfer.dropEffect).toEqual('copy');
    });

    it('falls back to copy when effectAllowed is uninitialized', () => {
      const zone = renderZone(() => true);
      const target = findRenderedDOMComponentWithClass(zone, 'outside-editor');
      const event = dragEventData(['Files']);
      event.dataTransfer.effectAllowed = 'uninitialized';

      Simulate.dragOver(target, event as any);

      expect(event.dataTransfer.dropEffect).toEqual('copy');
    });
  });
});
