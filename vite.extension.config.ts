import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/extensions/economy",
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "src/extensions/economy/index.tsx"),
      name: "EconomyExtension",
      fileName: "economy",
      formats: ["es"]
    },
    rollupOptions: {
      // In the future, we will externalize the core app dependencies (e.g. d3, react, core modules)
      // external: ['react', 'react-dom', 'd3'],
      // output: {
      //   globals: {
      //     react: 'React',
      //     'react-dom': 'ReactDOM',
      //     d3: 'd3'
      //   }
      // }
    }
  }
});
