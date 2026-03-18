import { defineConfig } from "tsup";

export default defineConfig({
  entry:   ["src/index.ts"],
  outDir:  "dist",
  format:  ["cjs"],      
  bundle:  true,          
  minify:  false,         
  clean:   true,
  noExternal: [/.*/],     
});