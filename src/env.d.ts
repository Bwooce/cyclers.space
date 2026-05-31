/// <reference types="astro/client" />

// Vite raw-string imports for YAML, e.g.
//   import rawYaml from "../data/seed_cyclers.yaml?raw";
declare module "*.yaml?raw" {
  const content: string;
  export default content;
}
