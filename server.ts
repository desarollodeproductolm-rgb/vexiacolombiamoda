import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Supabase (server-side, service role bypasses RLS) ─────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("FATAL: Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const BUCKET = "uploads";

// ── Multer — memoria (los archivos van a Supabase Storage, no al disco local) ──
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// ── Gemini AI client ───────────────────────────────────────────────────────────
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY no configurado. Edita el archivo .env y agrega tu clave de API de Google.");
  }
  return new GoogleGenAI({ apiKey: key });
};

// ── Prompt builders ────────────────────────────────────────────────────────────

interface GhostPromptOptions {
  sketchCount?: number;
  inspirationCount?: number;
  hasFrontRef?: boolean;
}

function buildGhostPrompt(
  userPrompt: string,
  view: string,
  options: GhostPromptOptions = {}
): string {
  const { sketchCount = 0, inspirationCount = 0, hasFrontRef = false } = options;

  const viewMap: Record<string, string> = {
    front: "vista frontal completa — frente de la prenda",
    back: "vista trasera completa — parte posterior de la prenda",
    side: "vista lateral — perfil izquierdo de la prenda",
    closeup: "primer plano de detalle — costuras, textura, herrajes y construcción del tejido",
  };
  const viewDesc = viewMap[view] || viewMap.front;

  if (hasFrontRef) {
    return `DOCUMENTACIÓN TÉCNICA DE PRENDA — NO ES DISEÑO

════ ATENCIÓN CRÍTICA ════
ESTA ETAPA NO CREA NI MODIFICA DISEÑOS.
La prenda ya fue aprobada y está visible en la IMAGEN DE REFERENCIA adjunta (vista frontal).
Tu única tarea: documentarla técnicamente en la vista solicitada.

════ REGLA ABSOLUTA — DISEÑO INMUTABLE ════
NO modificar NINGÚN elemento:
- Cortes, silueta y líneas de costura → INMUTABLES
- Amarres, lazos, anillos, tirantes, cierres y herrajes → INMUTABLES
- Color exacto y acabado del tejido → INMUTABLES
- Accesorios y detalles decorativos → INMUTABLES
- Proporciones y escala de la prenda → INMUTABLES

════ CONSISTENCIA OBLIGATORIA ════
La prenda que generes DEBE ser exactamente la misma prenda que aparece en la imagen de referencia.
Mismos materiales, mismos detalles, misma identidad visual.
Descripción original como contexto: "${userPrompt}"

════ OBJETIVO ════
Vista solicitada: ${viewDesc}
Mostrar la MISMA prenda exacta en este ángulo específico.

TÉCNICA: Ghost mannequin profesional (prenda flota sin cuerpo ni maniquí visibles)
FONDO: blanco puro (#FFFFFF) — completamente limpio
ILUMINACIÓN: neutra de estudio, difusa y uniforme
CALIDAD: fotografía técnica e-commerce / catálogo de alta moda
Sin texto, sin marcas de agua, sin accesorios externos.`;
  }

  const hasSketch = sketchCount > 0;
  const hasInspiration = inspirationCount > 0;

  let refBlock = "Construir la prenda basándose exclusivamente en la descripción textual del diseñador.";
  if (hasSketch || hasInspiration) {
    const parts: string[] = [];
    if (hasSketch) parts.push(`Se adjuntan ${sketchCount} boceto${sketchCount > 1 ? "s" : ""}/CAD que definen la arquitectura de la prenda. Respetar fielmente: silueta, cortes y construcción principal.`);
    if (hasInspiration) parts.push(`Se adjuntan ${inspirationCount} imagen${inspirationCount > 1 ? "es" : ""} de inspiración que definen el estilo, color y estética deseados. Usarlas como referencia visual y de mood.`);
    parts.push("PRIORIDAD: 1) Instrucciones del usuario → 2) Bocetos/CAD → 3) Imágenes de inspiración → 4) Criterio estético IA.");
    refBlock = parts.join("\n");
  }

  return `CONSTRUCCIÓN DE REFERENCIA DE MODA — SWIMWEAR / ACTIVEWEAR

════ DESCRIPCIÓN DEL DISEÑADOR ════
${userPrompt}

════ REFERENCIAS ════
${refBlock}

════ REGLAS DE INTERPRETACIÓN ════
Si el usuario pide "exactamente igual" o "fiel al boceto" → reproducir sin reinterpretar.
Si el usuario describe cambios, pide "inspirado en" o da libertad creativa → interpretar dentro del estilo descrito.
Completar detalles constructivos coherentes cuando la descripción sea incompleta.
NO agregar accesorios, elementos o detalles que contradigan la descripción.
NO sobre-diseñar. Proporciones realistas y producibles.
NO deformar anatomía ni escala de la prenda.

════ TÉCNICA ════
Ghost mannequin premium — prenda flota en el aire sin cuerpo ni maniquí visibles.
Vista: ${viewDesc}
Fondo: blanco puro (#FFFFFF) o blanco hueso (#F5F5DC) — completamente limpio
Iluminación: neutra de estudio, difusa, sin brillos extremos
Calidad: render hiperrealista tipo CLO3D, catálogo de alta moda
Sin texto, sin marcas de agua, sin accesorios externos.`;
}

function getOutdoorSceneByCategory(category = ""): string {
  const scenes: Record<string, string> = {
    "Swimwear": "playa tropical de arena blanca o piscina infinity de resort de lujo, luz natural dorada",
    "Core": "playa de arena blanca o piscina infinity con vista al mar, luz dorada de tarde",
    "Moda": "terraza de hotel boutique, arquitectura contemporánea o jardín de diseño premium",
    "Natación Deportiva": "piscina olímpica o instalación acuática deportiva de alto rendimiento",
    "Bodies": "interior minimalista premium con luz natural o estudio de fotografía editorial",
    "Resort": "yate de lujo, resort tropical o terraza con panorámica al mar al atardecer",
    "Activewear": "entorno urbano moderno, rooftop de diseño o instalación wellness premium",
  };
  return scenes[category] || "entorno natural elegante con luz natural dorada y composición editorial";
}

function buildModelPrompt(
  userPrompt: string,
  modelName: string,
  view: string = "front",
  environment: "studio" | "outdoor" = "studio",
  hasIdentityAnchor: boolean = false,
  category?: string
): string {
  const viewMap: Record<string, string> = {
    front: "vista frontal completa — modelo de frente, prenda visible al 100%",
    back: "vista trasera completa — modelo de espaldas, parte posterior de la prenda",
    side: "vista lateral — perfil de la modelo mostrando el lateral de la prenda",
    closeup: "primer plano del torso — detalles de construcción, materiales y herrajes de la prenda",
  };
  const viewDesc = viewMap[view] || viewMap.front;

  const envDesc = environment === "studio"
    ? "fondo de estudio neutro — gris claro o blanco, iluminación de estudio profesional difusa, imagen limpia y técnica"
    : `ambiente natural contextual: ${getOutdoorSceneByCategory(category)} — composición editorial fashion premium`;

  const identityBlock = hasIdentityAnchor
    ? `════ IMAGEN 1: PRENDA (DISEÑO BLOQUEADO — INMUTABLE) ════
La imagen ghost mannequin define el diseño EXACTO de la prenda.
REPRODUCIR CON FIDELIDAD ABSOLUTA:
- Todos los cortes, silueta y líneas de costura
- Todos los amarres, lazos, anillos, tirantes, cierres y herrajes
- Color exacto y acabado del tejido
- Posición de todos los elementos decorativos y funcionales
PROHIBIDO: agregar, quitar o alterar cualquier elemento de la prenda.

════ IMAGEN 2: IDENTIDAD DE MODELO (BLOQUEADA — INMUTABLE) ════
ESTA PERSONA ESPECÍFICA debe aparecer. NO generar otro rostro.
- Rostro → IDÉNTICO (mismos rasgos faciales, ojos, nariz, boca)
- Tono de piel → IDÉNTICO
- Cabello → IDÉNTICO (color, largo y textura)`
    : `════ PRENDA (DISEÑO BLOQUEADO — INMUTABLE) ════
La imagen ghost mannequin define el diseño EXACTO.
REPRODUCIR CON FIDELIDAD ABSOLUTA: cortes, amarres, herrajes, accesorios, color y silueta.
PROHIBIDO modificar ningún elemento.

════ MODELO ════
${modelName} — mujer profesional, complexión atlética natural.`;

  return `FOTOGRAFÍA DE CATÁLOGO — SWIMWEAR / ACTIVEWEAR PREMIUM

${identityBlock}

════ FLEXIBILIDAD PERMITIDA — POSE Y ACTITUD ════
La modelo PUEDE (dentro de la vista solicitada):
- Usar pose natural y editorial que favorezca la prenda
- Mostrar movimiento elegante (cabello, postura natural)
- Transmitir actitud fashion premium — sofisticada y natural
SIEMPRE garantizando que la prenda sea claramente visible en la vista "${view}".
NUNCA ocultar partes de la prenda. NUNCA deformar la anatomía.

════ VISTA Y ENTORNO ════
VISTA REQUERIDA: ${viewDesc}
ENTORNO: ${envDesc}
CALIDAD: fotografía profesional de catálogo de alta moda — alta resolución, iluminación perfecta.
Sin texto, sin marcas de agua, sin elementos ajenos a la prenda original.`;
}

// ── Storage utilities ──────────────────────────────────────────────────────────
async function uploadBuffer(buffer: Buffer, filename: string, mimeType = "image/jpeg"): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Supabase Storage error: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
}

async function saveBase64Image(base64: string, prefix = "render"): Promise<string> {
  const filename = `${prefix}_${Date.now()}.jpg`;
  return uploadBuffer(Buffer.from(base64, "base64"), filename);
}

async function imagePartFromAny(source: string): Promise<any | null> {
  if (!source) return null;
  if (!source.startsWith("http://") && !source.startsWith("https://")) return null;
  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const ct = res.headers.get("content-type") || "image/jpeg";
    return { inlineData: { mimeType: ct.split(";")[0].trim(), data: base64 } };
  } catch { return null; }
}

// ── Gemini core ────────────────────────────────────────────────────────────────
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_TEXT_MODEL  = "gemini-flash-latest";

async function callGeminiImage(parts: any[]): Promise<string> {
  const ai = getAI();
  let response: any;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: [{ role: "user", parts }],
      config: { responseModalities: ["TEXT", "IMAGE"] } as any,
    });
  } catch (apiErr: any) {
    const cause = apiErr?.cause?.message || apiErr?.cause?.code || "";
    const detail = cause ? ` (${cause})` : "";
    throw new Error(`Error conectando con la API de Gemini${detail}: ${apiErr.message}`);
  }
  const responseParts = response.candidates?.[0]?.content?.parts ?? [];
  const imgPart = responseParts.find((p: any) => p.inlineData?.data);
  if (!imgPart?.inlineData?.data) {
    const textPart = responseParts.find((p: any) => p.text)?.text || "";
    throw new Error(`El modelo no generó imagen. ${textPart ? `Respuesta: "${textPart.slice(0, 200)}"` : "Verifica el prompt o intenta de nuevo."}`);
  }
  return imgPart.inlineData.data;
}

async function generateImageWithParts(prompt: string, extraParts: any[] = []): Promise<string> {
  return callGeminiImage([{ text: prompt }, ...extraParts]);
}

// ── Catalog HTML generator (async — imágenes se obtienen de Supabase Storage) ──
async function fetchAsDataUri(url: string | null | undefined): Promise<string> {
  if (!url || !url.startsWith("http")) return "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return "";
    const buffer = await res.arrayBuffer();
    const ct = res.headers.get("content-type") || "image/jpeg";
    return `data:${ct.split(";")[0].trim()};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch { return ""; }
}

async function generateCatalogHTML(designs: any[], allModels: any[]): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const season = now.getMonth() < 6 ? "SS" : "FW";
  const total = designs.length;

  const byCategory = designs.reduce((acc: Record<string, any[]>, d: any) => {
    if (!acc[d.category]) acc[d.category] = [];
    acc[d.category].push(d);
    return acc;
  }, {});

  // Pre-fetch all images in parallel
  const richDesigns = await Promise.all(
    designs.map(async (d: any) => {
      const [heroSrc, frontSrc, backSrc, sideSrc, closeupSrc, modelSrc, outdoorSrc] = await Promise.all([
        fetchAsDataUri(d.model_front_render_url || d.model_render_url || d.front_render_url),
        fetchAsDataUri(d.front_render_url),
        fetchAsDataUri(d.back_render_url),
        fetchAsDataUri(d.side_render_url),
        fetchAsDataUri(d.closeup_render_url),
        fetchAsDataUri(d.model_front_render_url || d.model_render_url),
        fetchAsDataUri(d.outdoor_model_front_render_url),
      ]);
      return { ...d, heroSrc, frontSrc, backSrc, sideSrc, closeupSrc, modelSrc, outdoorSrc };
    })
  );

  const coverHTML = `
<div class="page cover">
  <div class="cover-inner">
    <div class="logo-mark">S</div>
    <div class="brand">ALMEJA STUDIO</div>
    <div class="season">${season}${year}</div>
    <div class="h-rule"></div>
    <div class="tagline">Swimwear &amp; Activewear — Diseño Generativo IA</div>
    <div class="count">${total} Referencias de Colección</div>
  </div>
  <div class="cover-foot">© ALMEJA STUDIO // NUCLEO_IA_V3.0 // ${year}</div>
</div>`;

  const designPages = richDesigns.map((d: any, i: number) => {
    const modelInfo = allModels.find((m: any) => m.id === d.model_id);
    const { heroSrc, frontSrc, backSrc, sideSrc, closeupSrc, modelSrc, outdoorSrc } = d;

    const thumb = (src: string, label: string) => src
      ? `<div class="thumb"><img src="${src}" alt="${label}"/><span>${label}</span></div>`
      : "";

    const secondaryThumbs = [
      thumb(backSrc, "Posterior"),
      thumb(sideSrc, "Lateral"),
      thumb(closeupSrc, "Close-up"),
      modelSrc && modelSrc !== heroSrc ? thumb(modelSrc, "Modelo Studio") : "",
      thumb(outdoorSrc, "Modelo Exterior"),
      heroSrc === modelSrc && frontSrc ? thumb(frontSrc, "Ghost Frontal") : "",
    ].filter(Boolean).join("");

    return `
<div class="page spread">
  <div class="sp-left">
    ${heroSrc
      ? `<img class="hero-img" src="${heroSrc}" alt="${d.name}"/>`
      : `<div class="no-img"><span>Sin imagen</span></div>`}
    <div class="sp-left-foot">
      <span class="ref-n">${String(i + 1).padStart(2, "0")}</span>
      <span class="cat-tag">${(d.category || "").toUpperCase()}</span>
    </div>
  </div>
  <div class="sp-right">
    <div class="sp-header">
      <div class="sp-cat">${d.category || ""}</div>
      <h1 class="sp-name">${d.name}</h1>
      <div class="accent-bar"></div>
    </div>
    ${d.prompt ? `
    <div class="info-sec">
      <div class="info-label">Descripción Técnica</div>
      <p class="info-text">"${d.prompt}"</p>
    </div>` : ""}
    ${modelInfo ? `
    <div class="info-sec">
      <div class="info-label">Modelo de Identidad</div>
      <p class="info-val">${modelInfo.name}</p>
    </div>` : ""}
    ${secondaryThumbs ? `
    <div class="info-sec">
      <div class="info-label">Vistas del Proyecto</div>
      <div class="thumbs">${secondaryThumbs}</div>
    </div>` : ""}
    <div class="sp-foot">
      <span>ALMEJA STUDIO // ${season}${year}</span>
      <span class="pg-num">${i + 1} / ${total}</span>
    </div>
  </div>
</div>`;
  }).join("\n");

  const indexRows = richDesigns.map((d: any, i: number) => `
  <div class="idx-row">
    <span class="idx-num">${String(i + 1).padStart(2, "0")}</span>
    <span class="idx-name">${d.name}</span>
    <span class="idx-cat">${d.category}</span>
    <span class="idx-dots">···</span>
    <span class="idx-pg">${i + 1}</span>
  </div>`).join("");

  const indexPage = `
<div class="page index-page">
  <div class="idx-header">
    <div class="idx-title">Índice de Colección</div>
    <div class="idx-sub">${season}${year} — ${total} Referencias</div>
  </div>
  ${Object.entries(byCategory).map(([cat, items]: [string, any]) => `
  <div class="idx-cat-group">
    <div class="idx-cat-head">${cat}</div>
    ${items.map((d: any) => {
      const globalIdx = richDesigns.findIndex((x: any) => x.id === d.id);
      return `<div class="idx-row">
        <span class="idx-num">${String(globalIdx + 1).padStart(2, "0")}</span>
        <span class="idx-name">${d.name}</span>
        <span class="idx-dots">···</span>
        <span class="idx-pg">${globalIdx + 1}</span>
      </div>`;
    }).join("")}
  </div>`).join("")}
</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ALMEJA Studio — Catálogo ${season}${year}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',sans-serif;background:#e8e8e8;color:#1a1a1a;padding-top:56px;}
.pbar{position:fixed;top:0;left:0;right:0;z-index:9999;background:#0a0a0a;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;}
.pbar-title{color:#fff;font-size:11px;letter-spacing:.25em;text-transform:uppercase;font-weight:500;}
.pbar-actions{display:flex;gap:10px;align-items:center;}
.pbar-info{font-size:9px;color:#555;letter-spacing:.1em;text-transform:uppercase;}
.pbtn{background:#E0FF00;color:#000;border:none;padding:8px 24px;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;font-family:'Inter',sans-serif;transition:background .2s;}
.pbtn:hover{background:#fff;}
.pbtn-sec{background:transparent;color:#666;border:1px solid #333;padding:8px 16px;font-size:9px;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;font-family:'Inter',sans-serif;}
.pbtn-sec:hover{color:#fff;border-color:#666;}
.page{width:210mm;min-height:297mm;background:#fff;margin:24px auto;box-shadow:0 8px 60px rgba(0,0,0,.2);position:relative;overflow:hidden;}
.cover{background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.cover-inner{text-align:center;color:#fff;padding:60px 40px;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.logo-mark{width:80px;height:80px;background:#E0FF00;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:900;font-style:italic;color:#000;margin-bottom:36px;box-shadow:0 0 60px rgba(224,255,0,.25);}
.brand{font-size:30px;font-weight:600;letter-spacing:.45em;text-transform:uppercase;margin-bottom:16px;}
.season{font-family:'Cormorant Garamond',serif;font-size:26px;font-style:italic;color:#E0FF00;margin-bottom:52px;letter-spacing:.05em;}
.h-rule{width:60px;height:1px;background:#222;margin-bottom:52px;}
.tagline{font-size:9px;letter-spacing:.35em;text-transform:uppercase;color:#444;margin-bottom:12px;}
.count{font-size:9px;letter-spacing:.2em;color:#333;text-transform:uppercase;}
.cover-foot{padding:24px 40px;font-size:8px;letter-spacing:.2em;color:#333;text-transform:uppercase;text-align:center;border-top:1px solid #111;}
.index-page{padding:60px 56px;}
.idx-header{margin-bottom:48px;}
.idx-title{font-family:'Cormorant Garamond',serif;font-size:36px;font-style:italic;color:#1a1a1a;margin-bottom:8px;}
.idx-sub{font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:#aaa;}
.idx-cat-group{margin-bottom:28px;}
.idx-cat-head{font-size:8px;letter-spacing:.3em;text-transform:uppercase;color:#E0FF00;background:#0a0a0a;display:inline-block;padding:3px 10px;margin-bottom:10px;}
.idx-row{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;}
.idx-num{font-family:'Cormorant Garamond',serif;font-size:14px;font-style:italic;color:#ccc;flex-shrink:0;width:28px;}
.idx-name{font-size:11px;color:#333;flex:1;}
.idx-cat{font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.1em;flex-shrink:0;}
.idx-dots{flex:1;overflow:hidden;color:#ddd;font-size:9px;letter-spacing:.2em;}
.idx-pg{font-size:11px;color:#333;flex-shrink:0;width:24px;text-align:right;}
.spread{display:grid;grid-template-columns:1fr 1fr;min-height:297mm;}
.sp-left{position:relative;background:#f4f4f4;overflow:hidden;display:flex;align-items:center;justify-content:center;}
.hero-img{width:100%;height:100%;object-fit:contain;display:block;}
.no-img{width:100%;height:100%;display:flex;align-items:center;justify-content:center;}.no-img span{font-size:11px;color:#ccc;font-style:italic;}
.sp-left-foot{position:absolute;bottom:0;left:0;right:0;padding:20px 24px;background:linear-gradient(transparent,rgba(0,0,0,.55));display:flex;align-items:center;justify-content:space-between;}
.ref-n{font-family:'Cormorant Garamond',serif;font-size:40px;color:rgba(255,255,255,.25);font-style:italic;line-height:1;}
.cat-tag{font-size:7px;letter-spacing:.3em;color:rgba(255,255,255,.45);text-transform:uppercase;padding:4px 10px;border:1px solid rgba(255,255,255,.2);}
.sp-right{padding:52px 40px;display:flex;flex-direction:column;border-left:1px solid #eee;}
.sp-header{margin-bottom:36px;}
.sp-cat{font-size:8px;letter-spacing:.3em;text-transform:uppercase;color:#bbb;margin-bottom:10px;}
.sp-name{font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:400;font-style:italic;line-height:1.1;color:#1a1a1a;margin-bottom:20px;}
.accent-bar{width:36px;height:2px;background:#E0FF00;}
.info-sec{margin-bottom:28px;}
.info-label{font-size:7px;letter-spacing:.3em;text-transform:uppercase;color:#bbb;font-weight:600;margin-bottom:10px;}
.info-text{font-size:11px;line-height:1.9;color:#666;font-style:italic;font-family:'Cormorant Garamond',serif;}
.info-val{font-size:11px;color:#444;line-height:1.6;}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
.thumb{position:relative;background:#f8f8f8;overflow:hidden;}
.thumb img{width:100%;height:90px;object-fit:cover;display:block;}
.thumb span{display:block;padding:4px 6px;font-size:6px;letter-spacing:.2em;text-transform:uppercase;color:#999;text-align:center;border-top:1px solid #eee;}
.sp-foot{margin-top:auto;padding-top:24px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;}
.sp-foot span{font-size:7px;letter-spacing:.2em;color:#ccc;text-transform:uppercase;}
.pg-num{font-family:'Cormorant Garamond',serif;font-size:16px;font-style:italic;color:#ddd !important;}
@media print{
  body{background:#fff;padding-top:0;}
  .pbar{display:none;}
  .page{margin:0;box-shadow:none;width:100%;min-height:100vh;page-break-after:always;}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
}
</style>
</head>
<body>
<div class="pbar">
  <span class="pbar-title">ALMEJA Studio — Catálogo ${season}${year}</span>
  <div class="pbar-actions">
    <span class="pbar-info">${total} referencias</span>
    <button class="pbtn-sec" onclick="window.close()">Cerrar</button>
    <button class="pbtn" onclick="window.print()">Imprimir / Exportar PDF</button>
  </div>
</div>
${coverHTML}
${indexPage}
${designPages}
</body>
</html>`;
}

// ── Server startup ─────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(cors());
  app.use(express.json());

  // ── Seed initial data (idempotente — solo inserta si está vacío) ─────────────
  const { data: existingModels } = await supabase.from("models").select("id").limit(1);
  if (!existingModels || existingModels.length === 0) {
    await supabase.from("models").insert([
      { id: "m1", name: "Modelo Latina 1 — Cabello oscuro, Talla S", preview_url: "" },
      { id: "m2", name: "Modelo Rubia 1 — Cabello rubio, Talla S", preview_url: "" },
    ]);
  }

  const { data: existingFabrics } = await supabase.from("fabrics").select("id").limit(1);
  if (!existingFabrics || existingFabrics.length === 0) {
    await supabase.from("fabrics").insert([
      { id: "f1", name: "Lycra Mate Premium", material: "Poliamida/Elastano", color: "#1a1a1a", elasticity: 0.85, finish: "mate", is_custom: 0 },
      { id: "f2", name: "Jacquard Texturizado", material: "Poliéster Reciclado", color: "#e5e5e5", elasticity: 0.40, finish: "texturizado", is_custom: 0 },
      { id: "f3", name: "Powernet Control", material: "Nailon Reforzado", color: "#d1d5db", elasticity: 0.20, finish: "mate", is_custom: 0 },
      { id: "f4", name: "Satin Swim Luxe", material: "Microfibra Brillante", color: "#c9d1d9", elasticity: 0.70, finish: "satinado", is_custom: 0 },
    ]);
  }

  // ── File Upload ──────────────────────────────────────────────────────────────
  app.post("/api/upload", upload.single("file"), async (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió archivo." });
    try {
      const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}${ext}`;
      const url = await uploadBuffer(req.file.buffer, filename, req.file.mimetype);
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── List available Gemini models ─────────────────────────────────────────────
  app.get("/api/list-models", async (_req: any, res: any) => {
    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key || key === "MY_GEMINI_API_KEY") return res.json({ error: "GEMINI_API_KEY no configurado" });
      const ai = new GoogleGenAI({ apiKey: key });
      const models: string[] = [];
      const pager = await ai.models.list();
      for await (const model of pager) {
        if ((model as any).supportedGenerationMethods?.includes("generateContent")) {
          models.push((model as any).name || (model as any).displayName || JSON.stringify(model));
        }
      }
      res.json({ models, total: models.length });
    } catch (err: any) {
      res.json({ error: err.message });
    }
  });

  // ── AI health check ──────────────────────────────────────────────────────────
  app.get("/api/test-ai", async (_req: any, res: any) => {
    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key || key === "MY_GEMINI_API_KEY") {
        return res.json({ ok: false, error: "GEMINI_API_KEY no configurado en .env" });
      }
      const ai = new GoogleGenAI({ apiKey: key });
      const r = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: [{ role: "user", parts: [{ text: "Responde solo 'ok'" }] }],
      });
      const text = r.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.json({ ok: true, model: GEMINI_TEXT_MODEL, response: text, imageModel: GEMINI_IMAGE_MODEL });
    } catch (err: any) {
      const cause = err?.cause?.message || err?.cause?.code || "";
      res.json({ ok: false, error: err.message, cause, stack: err.stack?.split("\n").slice(0, 5) });
    }
  });

  // ── Generate ghost mannequin render ─────────────────────────────────────────
  app.post("/api/generate/ghost", async (req: any, res: any) => {
    const {
      prompt,
      view = "front",
      frontRenderUrl,
      sketchUrls = [] as string[],
      inspirationUrls = [] as string[],
      sketchUrl,
      inspirationUrl,
    } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el prompt." });

    try {
      const allSketchUrls: string[] = [...new Set([...(sketchUrl ? [sketchUrl] : []), ...sketchUrls])];
      const allInspirationUrls: string[] = [...new Set([...(inspirationUrl ? [inspirationUrl] : []), ...inspirationUrls])];

      const [sketchParts, inspirationParts] = await Promise.all([
        Promise.all(allSketchUrls.map(u => imagePartFromAny(u))).then(ps => ps.filter(Boolean)),
        Promise.all(allInspirationUrls.map(u => imagePartFromAny(u))).then(ps => ps.filter(Boolean)),
      ]);

      const hasFrontRef = !!frontRenderUrl && view !== "front";
      const frontRefPart = hasFrontRef ? await imagePartFromAny(frontRenderUrl) : null;

      const fullPrompt = buildGhostPrompt(prompt, view, {
        sketchCount: sketchParts.length,
        inspirationCount: inspirationParts.length,
        hasFrontRef: !!frontRefPart,
      });

      const parts: any[] = [
        { text: fullPrompt },
        ...(frontRefPart ? [frontRefPart] : []),
        ...sketchParts,
        ...inspirationParts,
      ];

      const base64 = await callGeminiImage(parts);
      const url = await saveBase64Image(base64, `ghost_${view}`);
      res.json({ url });
    } catch (err: any) {
      console.error("Ghost generation error:", err.message, err?.cause);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Generate model render ────────────────────────────────────────────────────
  app.post("/api/generate/model", async (req: any, res: any) => {
    const {
      prompt,
      modelName,
      ghostRenderUrl,
      identityAnchorUrl,
      environment = "studio",
      view = "front",
      category,
    } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el prompt." });

    try {
      const [ghostPart, identityPart] = await Promise.all([
        ghostRenderUrl ? imagePartFromAny(ghostRenderUrl) : Promise.resolve(null),
        identityAnchorUrl ? imagePartFromAny(identityAnchorUrl) : Promise.resolve(null),
      ]);

      const extraParts: any[] = [
        ...(ghostPart ? [ghostPart] : []),
        ...(identityPart ? [identityPart] : []),
      ];

      const fullPrompt = buildModelPrompt(prompt, modelName || "modelo profesional", view, environment, !!identityPart, category);
      const base64 = await generateImageWithParts(fullPrompt, extraParts);
      const url = await saveBase64Image(base64, `model_${environment}_${view}`);
      res.json({ url });
    } catch (err: any) {
      console.error("Model generation error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Generate material/color variant ─────────────────────────────────────────
  app.post("/api/generate/variant", async (req: any, res: any) => {
    const { baseRenderUrl, prompt, fabricName, fabricColor, fabricMaterial, fabricFinish } = req.body;
    if (!baseRenderUrl || !fabricName) return res.status(400).json({ error: "Faltan parámetros: baseRenderUrl y fabricName son requeridos." });

    try {
      const basePart = await imagePartFromAny(baseRenderUrl);
      if (!basePart) return res.status(400).json({ error: "Render base no accesible desde la URL proporcionada." });

      const variantPrompt = `INSTRUCCIÓN CRÍTICA — EDICIÓN DE MATERIAL TEXTIL ÚNICAMENTE:

Estás editando una imagen existente de una prenda de moda. La imagen adjunta es la REFERENCIA BASE.

════ LO QUE JAMÁS DEBE CAMBIAR ════
- Diseño de la prenda: silueta, cortes, costuras, estructura, tiro, construcción (INMUTABLE)
- Si hay modelo humana: identidad, rostro, tono de piel, cabello, proporciones, pose (INMUTABLE)
- Fondo, iluminación, encuadre y composición (INMUTABLE)
- Cualquier accesorio o elemento decorativo (INMUTABLE)

════ ÚNICO CAMBIO AUTORIZADO ════
Cambiar EXCLUSIVAMENTE el material/color de la tela de la prenda a:
- Nombre: ${fabricName}
- Material: ${fabricMaterial || fabricName}
- Color: ${fabricColor || "natural"}
- Acabado: ${fabricFinish || "mate"}

Contexto de la prenda original: ${prompt || "prenda de swimwear/activewear"}

El resultado debe verse como la misma fotografía con el mismo encuadre, pose e iluminación, pero con el tejido cambiado. Calidad fotorrealista de catálogo profesional.`;

      const base64 = await callGeminiImage([{ text: variantPrompt }, basePart]);
      const url = await saveBase64Image(base64, "variant");
      res.json({ url });
    } catch (err: any) {
      console.error("Variant generation error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Edit single view with text instructions ──────────────────────────────────
  app.post("/api/generate/edit", async (req: any, res: any) => {
    const { baseRenderUrl, editInstructions, prompt, view = "front" } = req.body;
    if (!baseRenderUrl || !editInstructions) {
      return res.status(400).json({ error: "Faltan parámetros: baseRenderUrl y editInstructions son requeridos." });
    }

    try {
      const basePart = await imagePartFromAny(baseRenderUrl);
      if (!basePart) return res.status(400).json({ error: "Imagen base no accesible desde la URL proporcionada." });

      const editPrompt = `INSTRUCCIÓN DE EDICIÓN PUNTUAL — FOTOGRAFÍA DE MODA SWIMWEAR:

Estás editando una imagen existente de una prenda de swimwear/activewear. La imagen adjunta es la REFERENCIA BASE que debes modificar.

════ CAMBIOS SOLICITADOS ════
${editInstructions}

════ LO QUE NO DEBE CAMBIAR (INMUTABLE) ════
- Cualquier elemento de la prenda NO mencionado en los cambios solicitados
- El diseño general, silueta, cortes y construcción de la prenda
- Si hay modelo humana: identidad, rostro, tono de piel, cabello, proporciones, pose
- La iluminación, encuadre, ángulo y calidad fotográfica
- El fondo y el ambiente de la foto

Contexto de la prenda: ${prompt || "prenda de swimwear/activewear"}
Vista: ${view}

Resultado: imagen fotorrealista editada de alta calidad, con ÚNICAMENTE los cambios solicitados aplicados y todo lo demás idéntico a la referencia.`;

      const base64 = await callGeminiImage([{ text: editPrompt }, basePart]);
      const url = await saveBase64Image(base64, `edit_${view}`);
      res.json({ url });
    } catch (err: any) {
      console.error("Edit generation error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Designs CRUD ─────────────────────────────────────────────────────────────
  app.get("/api/designs", async (_req: any, res: any) => {
    const { data, error } = await supabase.from("designs").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/designs", async (req: any, res: any) => {
    const { id, name, category, prompt, model_id, technical_sketch_url, inspiration_url, sketch_urls, inspiration_urls } = req.body;
    const { error } = await supabase.from("designs").insert({
      id, name, category,
      prompt: prompt || null,
      model_id: model_id || null,
      view_mode: "ghost",
      technical_sketch_url: technical_sketch_url || null,
      inspiration_url: inspiration_url || null,
      sketch_urls: sketch_urls || null,
      inspiration_urls: inspiration_urls || null,
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/designs/:id", async (req: any, res: any) => {
    const { id } = req.params;
    await supabase.from("design_versions").delete().eq("design_id", id);
    const { error } = await supabase.from("designs").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.patch("/api/designs/:id", async (req: any, res: any) => {
    const { id } = req.params;
    const allowed = [
      "render_url", "front_render_url", "back_render_url", "side_render_url",
      "closeup_render_url", "model_render_url", "view_mode", "status", "prompt",
      "technical_sketch_url", "inspiration_url", "sketch_urls", "inspiration_urls",
      "model_front_render_url", "model_back_render_url", "model_side_render_url", "model_closeup_render_url",
      "outdoor_model_front_render_url", "outdoor_model_back_render_url",
      "outdoor_model_side_render_url", "outdoor_model_closeup_render_url",
    ];
    const updateData: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }
    if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "Nada que actualizar." });
    const { error } = await supabase.from("designs").update(updateData).eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/designs/:id/versions", async (req: any, res: any) => {
    const { data, error } = await supabase
      .from("design_versions")
      .select("*")
      .eq("design_id", req.params.id)
      .order("version_number", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/designs/:id/versions", async (req: any, res: any) => {
    const { id } = req.params;
    const { prompt, image_url, type = "ghost", view = "front" } = req.body;
    const { data: maxData } = await supabase
      .from("design_versions")
      .select("version_number")
      .eq("design_id", id)
      .order("version_number", { ascending: false })
      .limit(1);
    const nextV = ((maxData?.[0]?.version_number) ?? 0) + 1;
    const { error } = await supabase.from("design_versions").insert({
      id: `v_${id}_${nextV}`,
      design_id: id,
      version_number: nextV,
      prompt,
      image_url,
      type,
      view,
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, version_number: nextV });
  });

  // Legacy routes kept for compatibility
  app.post("/api/designs/:id/mode", async (req: any, res: any) => {
    const { mode, render_url, prompt } = req.body;
    const { id } = req.params;
    await supabase.from("designs").update({ view_mode: mode, render_url }).eq("id", id);
    const { data: maxData } = await supabase
      .from("design_versions")
      .select("version_number")
      .eq("design_id", id)
      .order("version_number", { ascending: false })
      .limit(1);
    const nextV = ((maxData?.[0]?.version_number) ?? 0) + 1;
    await supabase.from("design_versions").insert({
      id: `v_${id}_${nextV}`, design_id: id, version_number: nextV, prompt, image_url: render_url, type: mode,
    });
    res.json({ success: true });
  });

  app.post("/api/designs/:id/render", async (req: any, res: any) => {
    const { render_url } = req.body;
    await supabase.from("designs").update({ render_url }).eq("id", req.params.id);
    res.json({ success: true });
  });

  // ── Models CRUD ───────────────────────────────────────────────────────────────
  app.get("/api/models", async (_req: any, res: any) => {
    const { data, error } = await supabase.from("models").select("*");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/models", async (req: any, res: any) => {
    const { id, name, preview_url } = req.body;
    const { error } = await supabase.from("models").insert({ id, name, preview_url });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/models/:id", async (req: any, res: any) => {
    const { error } = await supabase.from("models").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ── Fabrics CRUD ──────────────────────────────────────────────────────────────
  app.get("/api/fabrics", async (_req: any, res: any) => {
    const { data, error } = await supabase.from("fabrics").select("*").order("is_custom").order("name");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/fabrics", upload.single("file"), async (req: any, res: any) => {
    const { id, name, material, color, elasticity, finish } = req.body;
    if (!id || !name) return res.status(400).json({ error: "Faltan campos requeridos (id, name)." });

    let fileUrl: string | null = null;
    if (req.file) {
      try {
        const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
        const filename = `fabric_${Date.now()}${ext}`;
        fileUrl = await uploadBuffer(req.file.buffer, filename, req.file.mimetype);
      } catch (err: any) {
        return res.status(500).json({ error: `Error subiendo archivo: ${err.message}` });
      }
    }

    const { error } = await supabase.from("fabrics").insert({
      id, name,
      material: material || "",
      color: color || "#ffffff",
      file_url: fileUrl,
      elasticity: parseFloat(elasticity) || 0.5,
      finish: finish || "mate",
      is_custom: 1,
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, file_url: fileUrl });
  });

  app.delete("/api/fabrics/:id", async (req: any, res: any) => {
    const { id } = req.params;
    const { data: fabric } = await supabase.from("fabrics").select("*").eq("id", id).single();
    if (!fabric) return res.status(404).json({ error: "Material no encontrado." });

    if (fabric.file_url?.startsWith("http")) {
      try {
        const urlObj = new URL(fabric.file_url);
        const pathParts = urlObj.pathname.split(`/object/public/${BUCKET}/`);
        if (pathParts[1]) await supabase.storage.from(BUCKET).remove([pathParts[1]]);
      } catch (_) {}
    }

    await supabase.from("fabrics").delete().eq("id", id);
    res.json({ success: true });
  });

  // ── Catalog generation ────────────────────────────────────────────────────────
  app.get("/api/catalog", async (_req: any, res: any) => {
    const { data: designs } = await supabase.from("designs").select("*").order("category").order("created_at");
    const { data: models } = await supabase.from("models").select("*");
    const html = await generateCatalogHTML(designs || [], models || []);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // ── AI catalog editorial enrichment ──────────────────────────────────────────
  app.post("/api/ai/enrich-catalog", async (req: any, res: any) => {
    const { designs } = req.body as {
      designs: Array<{ id: string; name: string; category: string; prompt?: string }>;
    };
    if (!designs || designs.length === 0) return res.status(400).json({ error: "No se enviaron diseños." });

    try {
      const ai = getAI();
      const designList = designs
        .map((d, i) =>
          `${i + 1}. ID: "${d.id}" | Nombre: "${d.name}" | Categoría: "${d.category}"` +
          (d.prompt ? ` | Descripción base: "${d.prompt}"` : "")
        )
        .join("\n");

      const systemPrompt = `Eres el director creativo de VEXIA, marca de moda de lujo latinoamericana especializada en swimwear y activewear premium.
Escribe contenido editorial de alta moda para el catálogo de la colección.

Para cada diseño genera exactamente:
- "tagline": frase corta poderosa (máx 7 palabras). Evocadora, precisa, sin clichés.
- "description": prosa editorial elegante (30-50 palabras). Describe silueta, función y actitud. Nunca uses las palabras "perfecto", "lujo" ni "increíble".
- "occasion": contexto de uso concreto (máx 5 palabras). Ej: "resort y playa", "natación de alto rendimiento".

Responde ÚNICAMENTE con un JSON válido con este esquema:
{
  "enriched": {
    "[id exacto del diseño]": {
      "tagline": "...",
      "description": "...",
      "occasion": "..."
    }
  }
}

Diseños:
${designList}`;

      const r = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        config: { responseMimeType: "application/json" } as any,
      });

      const rawText = r.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        try { parsed = match ? JSON.parse(match[1]) : { enriched: {} }; } catch { parsed = { enriched: {} }; }
      }

      res.json({ enriched: parsed.enriched || {} });
    } catch (err: any) {
      console.error("Enrich catalog error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Vite / Static ─────────────────────────────────────────────────────────────
  console.log("Setting up Vite middleware...");
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: any, res: any) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ALMEJA Studio running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical failure during server startup:", err);
  process.exit(1);
});
