import '@testing-library/jest-dom';

if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function() {
    return {
      finished: Promise.resolve(),
      cancel: () => {},
      play: () => {},
      pause: () => {},
      reverse: () => {},
      commitStyles: () => {},
      addEventListener: () => {},
      removeEventListener: () => {}
    } as unknown as Animation;
  };
}
