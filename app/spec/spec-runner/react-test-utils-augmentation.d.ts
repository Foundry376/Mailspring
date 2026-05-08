declare module 'react-dom/test-utils' {
  function scryRenderedComponentsWithTypeAndProps<T>(
    root: import('react').Component<any> | Element,
    type: T,
    props: object
  ): Array<import('react').Component<any>>;
}

export {};
