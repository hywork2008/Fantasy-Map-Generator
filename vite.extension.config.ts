import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const extension = process.env.FMG_EXTENSION ?? "economy";
if (extension !== "economy" && extension !== "characters") throw new Error(`Unknown extension: ${extension}`);

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: `dist/extensions/${extension}`,
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, `src/extensions/${extension}/index.${extension === "economy" ? "tsx" : "ts"}`),
      name: `${extension}Extension`,
      fileName: extension,
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
