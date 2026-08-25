import "@testing-library/jest-dom";

// A suite mistura dois ambientes: os testes de front rodam em jsdom, e os do
// backend rodam em node (`// @vitest-environment node`), porque os modulos de
// `_shared/` sao agnosticos de runtime de proposito. Este setup e global, entao
// precisa tolerar a ausencia de DOM em vez de estourar na coleta.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
