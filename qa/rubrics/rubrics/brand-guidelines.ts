import type { Rubric, RunContext, CriterionResult } from "./types.ts";
import { llmJudge } from "../evaluators/llm-judge.ts";
import { finalize } from "./scoring.ts";

const BRAND_COLORS = ["#184a45", "#184A45", "184a45", "184A45", "f5e8d7", "F5E8D7", "#f5e8d7", "#F5E8D7"];
const BRAND_FONTS = ["Cinzel", "Outfit"];
const FORBIDDEN_COPY = ["lorem ipsum", "elegancia atemporal", "lujo accesible"];
const REQUIRED_PAGES = ["/", "/capsula", "/nuestra-historia"];
const REQUIRED_NAV_ITEMS = ["cápsula", "historia"];

const criteria = [
  {
    id: "required-pages",
    description: "Las páginas clave existen: home (/), cápsula (/capsula), nuestra historia (/nuestra-historia)",
    weight: 0.15,
    evaluationType: "deterministic" as const,
  },
  {
    id: "brand-colors",
    description: "El CSS usa los colores de marca: verde botella #184A45 y beige cálido #F5E8D7",
    weight: 0.10,
    evaluationType: "deterministic" as const,
  },
  {
    id: "brand-fonts",
    description: "El CSS usa las tipografías de marca: Cinzel (titulares) y Outfit (cuerpo)",
    weight: 0.10,
    evaluationType: "deterministic" as const,
  },
  {
    id: "no-forbidden-copy",
    description: "No hay Lorem Ipsum, 'elegancia atemporal' ni 'lujo accesible' en ninguna página pública",
    weight: 0.10,
    evaluationType: "deterministic" as const,
  },
  {
    id: "mobile-viewport",
    description: "El meta viewport está configurado correctamente para mobile-first",
    weight: 0.05,
    evaluationType: "deterministic" as const,
  },
  {
    id: "nav-completeness",
    description: "El nav incluye 'Cápsula' e 'Historia' como ítems visibles",
    weight: 0.05,
    evaluationType: "deterministic" as const,
  },
  {
    id: "brand-voice-home",
    description: "El copy de la home refleja la voz de marca: directo, rioplatense (vos/vestite), sin clichés de lujo, con el slogan 'Vestite bien, sin esfuerzo'",
    weight: 0.15,
    evaluationType: "llm-judge" as const,
  },
  {
    id: "historia-content-quality",
    description: "La página /nuestra-historia cuenta la historia de la abuela modista, incluye el manifiesto de marca, menciona la herencia italo-argentina, y usa un tono editorial coherente con el manual de marca",
    weight: 0.20,
    evaluationType: "llm-judge" as const,
  },
  {
    id: "product-copy-quality",
    description: "Las descripciones de producto están en español correcto (con tildes), son específicas sobre materiales y fit, y evitan copy genérico de e-commerce",
    weight: 0.10,
    evaluationType: "llm-judge" as const,
  },
];

const THRESHOLD = 0.75;

export const brandGuidelinesRubric: Rubric = {
  id: "brand-guidelines",
  name: "Brand Guidelines Alignment",
  description:
    "Evalúa si el sitio web está alineado con el Manual de Marca de Fortunato: colores, tipografías, voz/tono, páginas clave, y calidad del copy.",
  criteria,
  async run(ctx: RunContext) {
    const start = Date.now();
    const results: CriterionResult[] = [];

    // ── 1. Required pages exist ───────────────────────────────────────
    const pageChecks = await Promise.all(
      REQUIRED_PAGES.map(async (path) => {
        const res = await fetch(`${ctx.baseUrl}${path}`).catch(() => null);
        return { path, ok: res?.ok ?? false, status: res?.status ?? 0 };
      })
    );
    const failedPages = pageChecks.filter((p) => !p.ok);
    results.push({
      criterionId: "required-pages",
      description: criteria[0].description,
      passed: failedPages.length === 0,
      score: failedPages.length === 0 ? 1 : (REQUIRED_PAGES.length - failedPages.length) / REQUIRED_PAGES.length,
      details: failedPages.length === 0
        ? `Todas las páginas responden 200: ${REQUIRED_PAGES.join(", ")}`
        : `Páginas con error: ${failedPages.map((p) => `${p.path} (${p.status})`).join(", ")}`,
    });

    // ── 2. Brand colors in CSS ────────────────────────────────────────
    const cssRes = await fetch(`${ctx.baseUrl}/`).catch(() => null);
    const homeHtml = cssRes?.ok ? await cssRes.text() : "";
    const hasGreen = BRAND_COLORS.some((c) => homeHtml.includes(c));
    const hasBeige = homeHtml.includes("F5E8D7") || homeHtml.includes("f5e8d7") || homeHtml.includes("beige");
    results.push({
      criterionId: "brand-colors",
      description: criteria[1].description,
      passed: hasGreen && hasBeige,
      score: (hasGreen ? 0.5 : 0) + (hasBeige ? 0.5 : 0),
      details: `Verde botella: ${hasGreen ? "✓" : "✗"} | Beige cálido: ${hasBeige ? "✓" : "✗"}`,
    });

    // ── 3. Brand fonts in CSS ─────────────────────────────────────────
    const hasCinzel = homeHtml.includes("Cinzel");
    const hasOutfit = homeHtml.includes("Outfit");
    results.push({
      criterionId: "brand-fonts",
      description: criteria[2].description,
      passed: hasCinzel && hasOutfit,
      score: (hasCinzel ? 0.5 : 0) + (hasOutfit ? 0.5 : 0),
      details: `Cinzel: ${hasCinzel ? "✓" : "✗"} | Outfit: ${hasOutfit ? "✓" : "✗"} | ⚠ Aviano (fuente oficial del manual) no está en uso — Cinzel es el sustituto digital`,
    });

    // ── 4. No forbidden copy ──────────────────────────────────────────
    const pagesToCheck = ["/", "/capsula", "/nuestra-historia"];
    const pageContents = await Promise.all(
      pagesToCheck.map(async (path) => {
        const res = await fetch(`${ctx.baseUrl}${path}`).catch(() => null);
        const html = res?.ok ? (await res.text()).toLowerCase() : "";
        return { path, html };
      })
    );
    const foundForbidden: string[] = [];
    for (const { path, html } of pageContents) {
      for (const term of FORBIDDEN_COPY) {
        if (html.includes(term.toLowerCase())) {
          foundForbidden.push(`"${term}" en ${path}`);
        }
      }
    }
    results.push({
      criterionId: "no-forbidden-copy",
      description: criteria[3].description,
      passed: foundForbidden.length === 0,
      score: foundForbidden.length === 0 ? 1 : 0,
      details: foundForbidden.length === 0
        ? "Sin Lorem Ipsum ni clichés detectados"
        : `Encontrado: ${foundForbidden.join("; ")}`,
    });

    // ── 5. Mobile viewport ────────────────────────────────────────────
    const hasMobileViewport = homeHtml.includes('name="viewport"') && homeHtml.includes("width=device-width");
    results.push({
      criterionId: "mobile-viewport",
      description: criteria[4].description,
      passed: hasMobileViewport,
      score: hasMobileViewport ? 1 : 0,
      details: hasMobileViewport ? "Meta viewport configurado correctamente" : "Falta meta viewport",
    });

    // ── 6. Nav completeness ───────────────────────────────────────────
    const navHtml = homeHtml.toLowerCase();
    const missingNav = REQUIRED_NAV_ITEMS.filter((item) => !navHtml.includes(item));
    results.push({
      criterionId: "nav-completeness",
      description: criteria[5].description,
      passed: missingNav.length === 0,
      score: missingNav.length === 0 ? 1 : (REQUIRED_NAV_ITEMS.length - missingNav.length) / REQUIRED_NAV_ITEMS.length,
      details: missingNav.length === 0
        ? `Nav items presentes: ${REQUIRED_NAV_ITEMS.join(", ")}`
        : `Faltantes en nav: ${missingNav.join(", ")}`,
    });

    // ── 7–9. LLM-as-judge (se marcan como salteados si no hay API key) ───────────────────────
    const toText = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const homeBody = toText(homeHtml);
    const historiaRes = await fetch(`${ctx.baseUrl}/nuestra-historia`).catch(() => null);
    const historiaHtml = historiaRes?.ok ? await historiaRes.text() : "";
    const capsulaRes = await fetch(`${ctx.baseUrl}/capsula`).catch(() => null);
    const capsulaHtml = capsulaRes?.ok ? await capsulaRes.text() : "";

    {
      const [voiceResult, historiaResult, productCopyResult] = await Promise.all([
        llmJudge(
          {
            criterion: criteria[6],
            subject: homeBody.slice(0, 20000),
            context: `Marca: Fortunato. Indumentaria masculina premium argentina.
Voz de marca: directa, rioplatense (vos/vestite), amigo con criterio.
Slogan clave: "Vestite bien, sin esfuerzo".
Evitar: clichés de lujo, "elegancia atemporal", copy genérico.`,
          },
          ctx.anthropicApiKey
        ),
        llmJudge(
          {
            criterion: criteria[7],
            subject: toText(historiaHtml).slice(0, 20000),
            context: `La página debe contar: historia de una abuela modista y su nieto (origen de la marca),
manifiesto de marca (herencia old money, no sigue modas establece principios),
herencia italo-argentina, referencia a la diosa Fortuna,
los 3 pilares: Carácter, Estructura, Visión.`,
          },
          ctx.anthropicApiKey
        ),
        llmJudge(
          {
            criterion: criteria[8],
            subject: toText(capsulaHtml).slice(0, 20000),
            context: `Evaluar si las descripciones de producto tienen: tildes correctas,
menciones de materiales específicos (lino italiano, algodón, ottoman),
fit/corte descripto, y evitan frases genéricas como "prenda esencial" o "alta calidad".`,
          },
          ctx.anthropicApiKey
        ),
      ]);

      results.push(voiceResult, historiaResult, productCopyResult);
    }

    return finalize(
      { rubricId: "brand-guidelines", rubricName: "Brand Guidelines Alignment", threshold: THRESHOLD, start },
      criteria,
      results
    );
  },
};
