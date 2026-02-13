import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const inputDir = process.argv[2];
const outputDir = process.argv[3];
const widthArg = process.argv.find((arg) => arg.startsWith("--width="));
const qualityArg = process.argv.find((arg) => arg.startsWith("--quality="));
const rotateArg = process.argv.find((arg) => arg.startsWith("--rotate="));
const maxKbArg = process.argv.find((arg) => arg.startsWith("--max-kb="));
const noRotate = process.argv.includes("--no-rotate");

if (!inputDir || !outputDir) {
  console.error("Uso: node scripts/optimize-images.mjs <carpeta-origen> <carpeta-destino> [--width=1200] [--quality=88] [--rotate=270] [--max-kb=1024] [--no-rotate]");
  process.exit(1);
}

const inDir = resolve(inputDir);
const outDir = resolve(outputDir);

if (!existsSync(inDir)) {
  console.error("La carpeta de origen no existe.");
  process.exit(1);
}

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const files = readdirSync(inDir).filter((file) => {
  const ext = extname(file).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
});

if (!files.length) {
  console.log("No se encontraron imágenes en la carpeta.");
  process.exit(0);
}

const maxWidth = widthArg ? Number(widthArg.split("=")[1]) : 1200;
const quality = qualityArg ? Number(qualityArg.split("=")[1]) : 88;
const maxKb = maxKbArg ? Number(maxKbArg.split("=")[1]) : null;
const forcedRotate = rotateArg ? Number(rotateArg.split("=")[1]) : null;

const getCwebpPath = () => {
  if (process.env.CWEBP_PATH) return process.env.CWEBP_PATH;
  try {
    return execFileSync("which", ["cwebp"], { encoding: "utf-8" }).trim();
  } catch {
    return "cwebp";
  }
};

const cwebpPath = getCwebpPath();

const getOrientation = (path) => {
  try {
    const output = execFileSync("sips", ["-g", "orientation", path], {
      encoding: "utf-8"
    });
    const match = output.match(/orientation:\s*(\d+)/i);
    return match ? Number(match[1]) : 1;
  } catch {
    return 1;
  }
};

const rotateIfNeeded = (path) => {
  const orientation = getOrientation(path);
  if (orientation === 3) {
    execFileSync("sips", ["-r", "180", path], { stdio: "ignore" });
  } else if (orientation === 6) {
    execFileSync("sips", ["-r", "90", path], { stdio: "ignore" });
  } else if (orientation === 8) {
    execFileSync("sips", ["-r", "270", path], { stdio: "ignore" });
  }
};

for (const file of files) {
  const inputPath = join(inDir, file);
  if (!statSync(inputPath).isFile()) continue;
  const name = basename(file, extname(file));
  const outputPath = join(outDir, `${name}.webp`);

  try {
    const inputExt = extname(file).toLowerCase();
    const tempPath = join(outDir, `${name}.__tmp${inputExt}`);
    copyFileSync(inputPath, tempPath);
    if (!noRotate) {
      if (forcedRotate && [90, 180, 270].includes(forcedRotate)) {
        execFileSync("sips", ["-r", String(forcedRotate), tempPath], { stdio: "ignore" });
      } else {
        rotateIfNeeded(tempPath);
      }
    }
    if (inputExt === ".webp") {
      execFileSync(cwebpPath, ["-resize", String(maxWidth), "0", tempPath, "-o", outputPath], {
        stdio: "ignore"
      });
    } else {
      execFileSync("sips", ["-Z", String(maxWidth), tempPath, "--out", outputPath], {
        stdio: "ignore"
      });
    }
    const encodeWithQuality = (q) => {
      execFileSync(cwebpPath, ["-q", String(q), outputPath, "-o", outputPath], {
        stdio: "ignore"
      });
    };

    let currentQuality = quality;
    encodeWithQuality(currentQuality);

    if (maxKb) {
      let sizeKb = Math.ceil(statSync(outputPath).size / 1024);
      while (sizeKb > maxKb && currentQuality > 60) {
        currentQuality -= 6;
        encodeWithQuality(currentQuality);
        sizeKb = Math.ceil(statSync(outputPath).size / 1024);
      }
    }
    unlinkSync(tempPath);
    console.log(`✔ ${file} -> ${outputPath}`);
  } catch (err) {
    console.error(`Error procesando ${file}.`, err?.message || err);
  }
}
