/// <reference types="vite/client" />

declare module "papaparse";
declare module "*?url" {
  const src: string;
  export default src;
}
