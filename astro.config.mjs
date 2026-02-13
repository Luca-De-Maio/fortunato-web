import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://fortunato.example",
  output: "server",
  adapter: node({ mode: "standalone" }),
  trailingSlash: "never"
});
