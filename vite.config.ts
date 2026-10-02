import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Serving from a subfolder (e.g. GitHub Pages at /open-fit/)? Set base: "/open-fit/".
export default defineConfig({
  base: "/",
  plugins: [react()],
});
