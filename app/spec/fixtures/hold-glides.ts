/** Holds every smooth scroll on `el` in flight, so a spec decides how far each glide gets. */
export function holdGlides(el: HTMLElement) {
  const scrollTo = el.scrollTo.bind(el);
  return spyOn(el, 'scrollTo').andCallFake((options: ScrollToOptions) => {
    if (options.behavior !== 'smooth') scrollTo(options);
  });
}
