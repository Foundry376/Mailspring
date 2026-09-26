import React from 'react';
import { findDOMNode } from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import FixedPopover from '../../src/components/fixed-popover';
import MTestUtils from '../mailspring-test-utils';

const {
  Directions: { Up, Down, Left, Right },
} = FixedPopover;

const makePopover = (props: any = {}) => {
  const originRect = props.originRect ? props.originRect : {};
  const popover = MTestUtils.renderIntoDocument(
    <FixedPopover {...props} originRect={originRect} />
  ) as any;
  if (props.initialState) {
    popover.setState(props.initialState);
  }
  return popover;
};

describe('FixedPopover', function fixedPopover() {
  describe('computeAdjustedOffsetAndDirection', () => {
    beforeEach(() => {
      this.popover = makePopover();
      this.PADDING = 10;
      this.windowDimensions = {
        height: 500,
        width: 500,
      };
    });

    const compute = (direction, { fallback = undefined, top, left, bottom, right }) => {
      return this.popover.computeAdjustedOffsetAndDirection({
        direction,
        windowDimensions: this.windowDimensions,
        currentRect: {
          top,
          left,
          bottom,
          right,
        },
        fallback,
        offsetPadding: this.PADDING,
      });
    };

    it('returns null when no overflows present', () => {
      const res = compute(Up, { top: 10, left: 10, right: 20, bottom: 20 });
      expect(res).toBe(null);
    });

    describe('when overflowing on 1 side of the window', () => {
      it('returns fallback direction when it is specified', () => {
        const { offset, direction } = compute(Up, {
          fallback: Left,
          top: -10,
          left: 10,
          right: 20,
          bottom: 10,
        });
        expect(offset).toEqual({});
        expect(direction).toEqual(Left);
      });

      it('inverts direction if is Up and overflows on the top', () => {
        const { offset, direction } = compute(Up, { top: -10, left: 10, right: 20, bottom: 10 });
        expect(offset).toEqual({});
        expect(direction).toEqual(Down);
      });

      it('inverts direction if is Down and overflows on the bottom', () => {
        const { offset, direction } = compute(Down, { top: 490, left: 10, right: 20, bottom: 510 });
        expect(offset).toEqual({});
        expect(direction).toEqual(Up);
      });

      it('inverts direction if is Right and overflows on the right', () => {
        const { offset, direction } = compute(Right, {
          top: 10,
          left: 490,
          right: 510,
          bottom: 20,
        });
        expect(offset).toEqual({});
        expect(direction).toEqual(Left);
      });

      it('inverts direction if is Left and overflows on the left', () => {
        const { offset, direction } = compute(Left, { top: 10, left: -10, right: 10, bottom: 20 });
        expect(offset).toEqual({});
        expect(direction).toEqual(Right);
      });

      [Up, Down, Left, Right].forEach((dir) => {
        if (dir === Up || dir === Down) {
          it('moves left if its overflowing on the right', () => {
            const { offset, direction } = compute(dir, {
              top: 10,
              left: 490,
              right: 510,
              bottom: 20,
            });
            expect(offset).toEqual({ x: -20 });
            expect(direction).toEqual(dir);
          });

          it('moves right if overflows on the left', () => {
            const { offset, direction } = compute(dir, {
              top: 10,
              left: -10,
              right: 10,
              bottom: 20,
            });
            expect(offset).toEqual({ x: 20 });
            expect(direction).toEqual(dir);
          });
        }

        if (dir === Left || dir === Right) {
          it('moves up if its overflowing on the bottom', () => {
            const { offset, direction } = compute(dir, {
              top: 490,
              left: 10,
              right: 20,
              bottom: 510,
            });
            expect(offset).toEqual({ y: -20 });
            expect(direction).toEqual(dir);
          });

          it('moves down if overflows on the top', () => {
            const { offset, direction } = compute(dir, {
              top: -10,
              left: 10,
              right: 20,
              bottom: 10,
            });
            expect(offset).toEqual({ y: 20 });
            expect(direction).toEqual(dir);
          });
        }
      });
    });

    describe('when overflowing on 2 sides of the window', () => {
      describe('when direction is up', () => {
        it('computes correctly when it overflows up and right', () => {
          const { offset, direction } = compute(Up, { top: -10, left: 10, right: 510, bottom: 10 });
          expect(offset).toEqual({ x: -20 });
          expect(direction).toEqual(Down);
        });

        it('computes correctly when it overflows up and left', () => {
          const { offset, direction } = compute(Up, { top: -10, left: -10, right: 10, bottom: 10 });
          expect(offset).toEqual({ x: 20 });
          expect(direction).toEqual(Down);
        });
      });

      describe('when direction is right', () => {
        it('computes correctly when it overflows right and up', () => {
          const { offset, direction } = compute(Right, {
            top: -10,
            left: 490,
            right: 510,
            bottom: 10,
          });
          expect(offset).toEqual({ y: 20 });
          expect(direction).toEqual(Left);
        });

        it('computes correctly when it overflows right and down', () => {
          const { offset, direction } = compute(Right, {
            top: 490,
            left: 490,
            right: 510,
            bottom: 510,
          });
          expect(offset).toEqual({ y: -20 });
          expect(direction).toEqual(Left);
        });
      });

      describe('when direction is left', () => {
        it('computes correctly when it overflows left and up', () => {
          const { offset, direction } = compute(Left, {
            top: -10,
            left: -10,
            right: 10,
            bottom: 10,
          });
          expect(offset).toEqual({ y: 20 });
          expect(direction).toEqual(Right);
        });

        it('computes correctly when it overflows left and down', () => {
          const { offset, direction } = compute(Left, {
            top: 490,
            left: -10,
            right: 10,
            bottom: 510,
          });
          expect(offset).toEqual({ y: -20 });
          expect(direction).toEqual(Right);
        });
      });

      describe('when direction is down', () => {
        it('computes correctly when it overflows down and left', () => {
          const { offset, direction } = compute(Down, {
            top: 490,
            left: -10,
            right: 10,
            bottom: 510,
          });
          expect(offset).toEqual({ x: 20 });
          expect(direction).toEqual(Up);
        });

        it('computes correctly when it overflows down and right', () => {
          const { offset, direction } = compute(Down, {
            top: 490,
            left: 490,
            right: 510,
            bottom: 510,
          });
          expect(offset).toEqual({ x: -20 });
          expect(direction).toEqual(Up);
        });
      });
    });
  });

  describe('computeClampedOffset', () => {
    beforeEach(() => {
      this.popover = makePopover();
      this.PADDING = 10;
      this.windowDimensions = { height: 500, width: 500 };
    });

    const clamp = ({ top, left, bottom, right }, offset = {}) => {
      return this.popover.computeClampedOffset({
        currentRect: { top, left, bottom, right },
        windowDimensions: this.windowDimensions,
        offset,
        offsetPadding: this.PADDING,
      });
    };

    it('does not move a popover that is already on screen', () => {
      expect(clamp({ top: 10, left: 10, bottom: 200, right: 200 })).toEqual({ x: 0, y: 0 });
    });

    it('slides left when the right edge is past the window', () => {
      expect(clamp({ top: 10, left: 300, bottom: 200, right: 520 })).toEqual({ x: -30, y: 0 });
    });

    it('slides right when the left edge is past the window', () => {
      expect(clamp({ top: 10, left: -20, bottom: 200, right: 100 })).toEqual({ x: 30, y: 0 });
    });

    it('slides up when the bottom edge is past the window', () => {
      expect(clamp({ top: 300, left: 10, bottom: 530, right: 200 })).toEqual({ x: 0, y: -40 });
    });

    it('slides down when the top edge is past the window', () => {
      expect(clamp({ top: -15, left: 10, bottom: 200, right: 200 })).toEqual({ x: 0, y: 25 });
    });

    it('favours the top left edge when the popover is larger than the window', () => {
      // Pulling the far edge in would push the near edge out. The near edge wins, so the
      // popover starts inside the window and its own max-height scrolls the remainder.
      expect(clamp({ top: -20, left: -20, bottom: 520, right: 520 })).toEqual({ x: 30, y: 30 });
    });

    it('adds to the offset currentRect already reflects', () => {
      expect(clamp({ top: 10, left: 300, bottom: 200, right: 520 }, { x: 5, y: 7 })).toEqual({
        x: -25,
        y: 7,
      });
    });
  });

  describe('computePopoverStyles', () => {
    const originRect = { top: 100, left: 100, width: 50, height: 20 };

    // Every direction has to honour both axes: the clamp that rescues an off-screen popover
    // can need to move it on either one, whichever way the popover happens to point.
    [Up, Down, Left, Right].forEach(direction => {
      it(`applies both offset axes when pointing ${direction}`, () => {
        const popover = makePopover();
        const { popoverStyle } = popover.computePopoverStyles({
          originRect,
          direction,
          offset: { x: 12, y: 34 },
        });
        expect(popoverStyle.transform).toContain('translate(12px, 34px)');
      });
    });
  });

  describe('when the content changes size after placement', () => {
    // The spec window is hidden, and a hidden renderer produces frames irregularly, so a real
    // ResizeObserver may not report within any timeout. This one reports when the spec says so.
    let observers: FakeResizeObserver[];
    class FakeResizeObserver {
      observed = new Set<Element>();
      constructor(public callback: ResizeObserverCallback) {
        observers.push(this);
      }
      observe(el: Element) {
        this.observed.add(el);
      }
      unobserve(el: Element) {
        this.observed.delete(el);
      }
      disconnect() {
        this.observed.clear();
      }
    }
    const reportResizes = () => {
      for (const o of observers) {
        for (const target of o.observed) {
          o.callback([{ target } as ResizeObserverEntry], o as any);
        }
      }
    };

    let RealResizeObserver: typeof ResizeObserver;
    beforeEach(() => {
      observers = [];
      RealResizeObserver = window.ResizeObserver;
      (window as any).ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => {
      window.ResizeObserver = RealResizeObserver;
    });

    // The default export is the AutoFocuses decorator, which renders the FixedPopover inside it;
    // placement state, refs and the ResizeObserver live on that inner instance.
    const mountWithChild = (height: number, width = 200, originLeft = 10) => {
      const outer = makePopover({
        direction: Right,
        originRect: { top: 400, left: originLeft, width: 50, height: 20 },
        children: <div className="grows" style={{ width, height }} />,
      });
      const inner = ReactTestUtils.findAllInRenderedTree(
        outer,
        (c: any) => c !== outer && c.state && 'visible' in c.state
      )[0] as any;
      spyOn(inner, 'getWindowDimensions').andReturn({ width: 500, height: 500 });
      return inner;
    };

    // Placement runs in deferred passes on the mocked clock.
    const settle = () => {
      for (let i = 0; i < 5; i++) advanceClock(10);
    };

    it('places the popover again so it comes back inside the window', () => {
      const popover = mountWithChild(100);
      settle();
      expect(popover.state.visible).toBe(true);
      expect(popover.getCurrentRect().top).toBeGreaterThan(0);

      (findDOMNode(popover) as HTMLElement).querySelector<HTMLElement>('.grows').style.height =
        '2000px';
      reportResizes();
      expect(popover.placing).toBe(true);
      settle();
      expect(popover.placing).toBe(false);
      expect(popover.state.visible).toBe(true);
      expect(popover.getCurrentRect().top).toBeGreaterThan(0);
    });

    it('starts again from the requested direction once the content fits it', () => {
      const popover = mountWithChild(100, 200, 250);
      settle();
      expect(popover.state.direction).toBe(Left);

      (findDOMNode(popover) as HTMLElement).querySelector<HTMLElement>('.grows').style.width =
        '50px';
      reportResizes();
      settle();
      expect(popover.state.direction).toBe(Right);
      expect(popover.state.visible).toBe(true);
    });
  });
});
