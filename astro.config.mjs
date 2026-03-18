import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://www.tiendafortunato.ar",
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: { host: true },
  trailingSlash: "never"
});
