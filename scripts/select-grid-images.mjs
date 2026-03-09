import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const dataPath = resolve("data/products.json");
const imagesRoot = resolve("public/images/products");

if (!existsSync(dataPath)) {
  console.error("No se encontró data/products.json.");
  process.exit(1);
}

const cwebpPath = (() => {
  try {
    return execFileSync("which", ["cwebp"], { encoding: "utf-8" }).trim();
  } catch {
    return "cwebp";
  }
})();

const allowedExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const readProducts = () => JSON.parse(readFileSync(dataPath, "utf-8"));

const scoreFile = (name, size) => {
  const lower = name.toLowerCase();
  let score = Math.log2(size + 1);
  if (/-grid\.webp/.test(lower)) score += 50;
  if (/(model|img_|drg|set|persona|man|bermuda|chomba)/.test(lower)) score += 20;
  if (/mesa|sillon|sofa|couch/.test(lower)) score -= 30;
  if (lower.includes("detail")) score -= 10;
  return score;
};

const buildGridImage = (source, output) => {
  if (!existsSync(source)) return false;
  console.log("  Generando grid image:", output);
  execFileSync(cwebpPath, ["-q", "78", "-resize", "720", "0", source, "-o", output], { stdio: "ignore" });
  return true;
};

const processProduct = (product) => {
  const folder = join(imagesRoot, product.slug);
  if (!existsSync(folder)) {
    console.warn(`  No existe carpeta de imágenes para ${product.slug}`);
    return product;
  }

  const files = readdirSync(folder).filter((name) => {
    return allowedExts.has(extname(name).toLowerCase());
  });

  if (!files.length) {
    console.warn(`  Sin imágenes en ${folder}`);
    return product;
  }

  const records = files.map((file) => {
    const path = join(folder, file);
    const stats = statSync(path);
    return { file, path, stats, score: scoreFile(file, stats.size) };
  });

  const gridCandidates = records.filter((rec) => /-grid\.webp$/i.test(rec.file));
  let primary = gridCandidates[0];

  if (!primary) {
    const sorted = [...records].sort((a, b) => b.score - a.score);
    primary = sorted[0];
  }

  const isGrid = /-grid\.webp$/i.test(primary.file);
  const gridName = isGrid ? primary.file : `${basename(primary.file, extname(primary.file))}-grid.webp`;
  const gridPath = join(folder, gridName);
  const gridRel = `/images/products/${product.slug}/${gridName}`;

  if (!isGrid && !existsSync(gridPath)) {
    buildGridImage(primary.path, gridPath);
  } else if (isGrid) {
    console.log("  Reutilizando grid existente:", gridName);
  }

  const imagesList = records
    .filter((rec) => !/-grid\.webp$/i.test(rec.file))
    .sort((a, b) => {
      if (a.file === primary.file) return -1;
      if (b.file === primary.file) return 1;
      return b.score - a.score;
    })
    .map((rec) => `/images/products/${product.slug}/${rec.file}`);

  return {
    ...product,
    gridImage: gridRel,
    images: imagesList
  };
};

const run = () => {
  const products = readProducts();
  const updated = products.map((product) => processProduct(product));
  writeFileSync(dataPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log("Productos actualizados con grid images.");
};

run();
