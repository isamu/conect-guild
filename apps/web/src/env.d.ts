/// <reference types="vite/client" />

// Lets type-aware ESLint (plain tsserver) resolve .vue imports; vue-tsc uses the real SFC types.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
