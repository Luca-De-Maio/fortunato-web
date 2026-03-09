#!/usr/bin/env node
import { Command } from "commander";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";

const dataPath = resolve("data", "products.json");
const imagesRoot = resolve("public", "images", "products");
const allowedExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const program = new Command();
program.description("Image service that prepares hero + grid shots for each product.");

const normalizeSlug = (slug) => slug.toLowerCase();
const normalizeText = (value) => value.normalize("NFC").trim().toLowerCase();
const slugify = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const galleryKey = (name) =>
  basename(name, extname(name))
    .toLowerCase()
    .replace(/-hero|-grid/g, "")
    .replace(/\(1\)|-1$/g, "")
    .replace(/[^a-z0-9]/g, "");

const findProduct = (slug) => {
  if (!existsSync(dataPath)) throw new Error("data/products.json not found.");
  const raw = readFileSync(dataPath, "utf-8");
  const products = JSON.parse(raw);
  const index = products.findIndex((p) => p.slug === slug);
  return { products, index };
};

const listImages = (folder) => {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((name) => {
    const ext = extname(name).toLowerCase();
    return allowedExts.has(ext);
  });
};

const orientDims = (metadata) => {
  const orientation = metadata.orientation || 1;
  const w = metadata.width || 0;
  const h = metadata.height || 0;
  if ([5, 6, 7, 8].includes(orientation)) return { w: h, h: w };
  return { w, h };
};

const scoreCandidate = (fileName, stats, metadata) => {
  const lower = fileName.toLowerCase();
  const { w, h } = orientDims(metadata);
  let score = stats.size / 10000;
  score += (w * h) / 1000000;
  if (h > w) score += 20;
  if (/img_|drg|model|look|outfit|wear/.test(lower)) score += 25;
  if (/mesa|sillon|sofa|couch|flat|detail|detalle|copia/.test(lower)) score -= 40;
  if (/-grid\.webp$| -hero\.webp$/.test(lower)) score -= 100;
  return score;
};

const resolvePick = (images, pick) => {
  if (!pick) return null;
  const wanted = normalizeText(pick);
  const exact = images.find((name) => normalizeText(name) === wanted);
  if (exact) return exact;

  const pickBase = normalizeText(basename(pick, extname(pick)));
  const byBase = images.filter((name) => normalizeText(basename(name, extname(name))) === pickBase);
  if (byBase.length === 1) return byBase[0];

  const contains = images.filter((name) => normalizeText(name).includes(wanted));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) {
    throw new Error(`Pick "${pick}" matches multiple files: ${contains.join(", ")}`);
  }
  throw new Error(`Pick "${pick}" not found.`);
};

const hashFile = (path) => createHash("sha1").update(readFileSync(path)).digest("hex");

const formatScore = (name) => {
  const ext = extname(name).toLowerCase();
  if (ext === ".avif") return 5;
  if (ext === ".webp") return 4;
  if (ext === ".jpg" || ext === ".jpeg") return 3;
  if (ext === ".png") return 2;
  return 1;
};

const buildGridVariant = async (source, output, opts) => {
  let pipeline = sharp(source).rotate();
  if (opts.rotate !== 0) pipeline = pipeline.rotate(opts.rotate);
  await pipeline
    .resize(opts.gridWidth, opts.gridHeight, { fit: "cover", position: "attention" })
    .webp({ quality: opts.quality })
    .toFile(output);
};

const buildHeroVariant = async (source, output, opts) => {
  let pipeline = sharp(source).rotate();
  if (opts.rotate !== 0) pipeline = pipeline.rotate(opts.rotate);
  await pipeline
    .resize(opts.heroWidth, null, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: opts.quality })
    .toFile(output);
};

program
  .command("prepare <slug>")
  .description("Generate hero + grid variants for a product slug.")
  .option("--grid-width <px>", "grid max width", "720")
  .option("--grid-height <px>", "grid target height", "960")
  .option("--hero-width <px>", "hero max width", "1400")
  .option("--quality <q>", "webp quality", "78")
  .option("--pick <name>", "pick one source image (supports partial name)")
  .option("--rotate <deg>", "manual rotate after EXIF fix (0|90|180|270)", "0")
  .action(async (slug, opts) => {
    const normalized = normalizeSlug(slug);
    const folder = join(imagesRoot, normalized);
    if (!existsSync(folder)) throw new Error(`Images folder ${folder} missing.`);
    const { products, index } = findProduct(normalized);
    if (index === -1) throw new Error(`Product with slug "${slug}" not found in data/products.json.`);

    const imageFiles = listImages(folder).filter((name) => !/-grid\.webp$|-hero\.webp$/i.test(name));
    const images = imageFiles.length ? imageFiles : listImages(folder);
    if (!images.length) throw new Error("No images found for this product.");

    const rotate = Number(opts.rotate);
    if (![0, 90, 180, 270].includes(rotate)) {
      throw new Error("Invalid --rotate value. Use 0, 90, 180 or 270.");
    }

    const metadataRecords = [];
    for (const name of images) {
      const path = join(folder, name);
      const metadata = await sharp(path).metadata();
      const stats = statSync(path);
      metadataRecords.push({ name, path, metadata, stats, score: scoreCandidate(name, stats, metadata) });
    }

    let candidate = resolvePick(images, opts.pick);
    if (!candidate) {
      metadataRecords.sort((a, b) => b.score - a.score);
      candidate = metadataRecords[0].name;
    }

    const pickedRecord = metadataRecords.find((record) => record.name === candidate);
    if (!pickedRecord) throw new Error("Could not resolve selected candidate.");

    const imageBase = slugify(basename(candidate, extname(candidate)));
    const gridName = `${imageBase}-grid.webp`;
    const heroName = `${imageBase}-hero.webp`;
    const gridPath = join(folder, gridName);
    const heroPath = join(folder, heroName);

    const buildOpts = {
      gridWidth: Number(opts.gridWidth),
      gridHeight: Number(opts.gridHeight),
      heroWidth: Number(opts.heroWidth),
      quality: Number(opts.quality),
      rotate
    };

    await buildGridVariant(pickedRecord.path, gridPath, buildOpts);
    await buildHeroVariant(pickedRecord.path, heroPath, buildOpts);

    const base = `/images/products/${normalized}`;
    const heroRel = `${base}/${heroName}`;
    const gridRel = `${base}/${gridName}`;
    const imagesFolder = join(imagesRoot, normalized);
    const rawGallery = listImages(imagesFolder).filter((name) => !name.endsWith("-grid.webp") && !name.endsWith("-hero.webp"));
    const ordered = rawGallery.sort((a, b) => {
      if (a === candidate) return -1;
      if (b === candidate) return 1;
      return a.localeCompare(b);
    });

    const candidateKey = galleryKey(candidate);
    const byKey = new Map();
    for (const name of ordered) {
      const key = galleryKey(name);
      if (!byKey.has(key)) {
        byKey.set(key, name);
        continue;
      }
      const current = byKey.get(key);
      if (formatScore(name) > formatScore(current)) {
        byKey.set(key, name);
        continue;
      }
      if (formatScore(name) === formatScore(current)) {
        const nameSize = statSync(join(imagesFolder, name)).size;
        const currentSize = statSync(join(imagesFolder, current)).size;
        if (nameSize > currentSize) byKey.set(key, name);
      }
    }

    const dedupeHashes = new Set();
    const gallery = [];
    const orderedUnique = Array.from(byKey.values()).sort((a, b) => {
      const aKey = galleryKey(a);
      const bKey = galleryKey(b);
      if (aKey === candidateKey && bKey !== candidateKey) return -1;
      if (bKey === candidateKey && aKey !== candidateKey) return 1;
      return a.localeCompare(b);
    });
    for (const name of orderedUnique) {
      const path = join(imagesFolder, name);
      const digest = hashFile(path);
      if (dedupeHashes.has(digest)) continue;
      dedupeHashes.add(digest);
      gallery.push(`${base}/${name}`);
    }

    products[index].gridImage = gridRel;
    products[index].images = [heroRel, ...gallery];
    writeFileSync(dataPath, JSON.stringify(products, null, 2) + "\n");
    console.log(`Prepared ${slug}: grid=${gridName}, hero=${heroName}, source=${candidate}`);
  });

program.parse(process.argv);
