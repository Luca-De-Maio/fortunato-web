import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const inputDir = process.argv[2];
const outputFile = process.argv[3] || "docs/fotos-webp/index.html";

if (!inputDir) {
  console.error("Uso: node scripts/build-gallery.mjs <carpeta-imagenes> [salida.html]");
  process.exit(1);
}

const inDir = resolve(inputDir);
const outPath = resolve(outputFile);

if (!existsSync(inDir)) {
  console.error("La carpeta de imágenes no existe.");
  process.exit(1);
}

const files = readdirSync(inDir)
  .filter((file) => file.toLowerCase().endsWith(".webp"))
  .filter((file) => statSync(join(inDir, file)).isFile())
  .sort();

const rel = (file) => file.replace(/\\/g, "/");

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Galería Fortunato</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #f6eee4; color: #1b2d2b; margin: 0; }
      header { padding: 1.5rem; position: sticky; top: 0; background: #f6eee4; border-bottom: 1px solid #e2d4c4; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; padding: 1.5rem; }
      .card { background: #fff; border-radius: 12px; padding: 0.8rem; box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
      img { width: 100%; height: 240px; object-fit: cover; border-radius: 10px; }
      code { font-size: 0.8rem; display: block; margin-top: 0.5rem; word-break: break-all; }
    </style>
  </head>
  <body>
    <header>
      <h1>Galería de fotos (selección)</h1>
      <p>Copiá los nombres de archivo que querés para cada prenda.</p>
    </header>
    <main class="grid">
      ${files
        .map(
          (file) => `
        <article class="card">
          <img src="${rel(file)}" alt="${file}" />
          <code>${file}</code>
        </article>`
        )
        .join("")}
    </main>
  </body>
</html>`;

const outDir = outPath.split("/").slice(0, -1).join("/");
if (outDir && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, html, "utf-8");

console.log(`Galería creada en ${outPath}`);
