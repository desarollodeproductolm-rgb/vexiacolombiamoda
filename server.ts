import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database("swimtech.db");
console.log("Database connected.");

db.exec(`
  CREATE TABLE IF NOT EXISTS designs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT DEFAULT 'sketch',
    technical_sketch_url TEXT,
    inspiration_url TEXT,
    render_url TEXT,
    front_render_url TEXT,
    back_render_url TEXT,
    side_render_url TEXT,
    closeup_render_url TEXT,
    model_render_url TEXT,
    prompt TEXT,
    model_id TEXT,
    view_mode TEXT DEFAULT 'ghost',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fabrics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    material TEXT,
    color TEXT,
    texture_url TEXT,
    normal_map_url TEXT,
    roughness_map_url TEXT,
    elasticity REAL,
    finish TEXT,
    file_url TEXT,
    is_custom INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    preview_url TEXT
  );

  CREATE TABLE IF NOT EXISTS design_versions (
    id TEXT PRIMARY KEY,
    design_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    prompt TEXT,
    image_url TEXT,
    type TEXT DEFAULT 'ghost',
    view TEXT DEFAULT 'front',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(design_id) REFERENCES designs(id)
  );
`);

// ── Migrations ────────────────────────────────────────────────────────────────
const designColumns = (db.prepare("PRAGMA table_info(designs)").all() as any[]).map((c: any) => c.name);
const newDesignCols: [string, string][] = [
  ["model_id", "TEXT"],
  ["view_mode", "TEXT DEFAULT 'ghost'"],
  ["render_url", "TEXT"],
  ["front_render_url", "TEXT"],
  ["back_render_url", "TEXT"],
  ["side_render_url", "TEXT"],
  ["closeup_render_url", "TEXT"],
  ["model_render_url", "TEXT"],
  // Per-view model renders — studio
  ["model_front_render_url", "TEXT"],
  ["model_back_render_url", "TEXT"],
  ["model_side_render_url", "TEXT"],
  ["model_closeup_render_url", "TEXT"],
  // Per-view model renders — outdoor
  ["outdoor_model_front_render_url", "TEXT"],
  ["outdoor_model_back_render_url", "TEXT"],
  ["outdoor_model_side_render_url", "TEXT"],
  ["outdoor_model_closeup_render_url", "TEXT"],
];
for (const [col, def] of newDesignCols) {
  if (!designColumns.includes(col)) {
    db.prepare(`ALTER TABLE designs ADD COLUMN ${col} ${def}`).run();
  }
}

const fabricColumns = (db.prepare("PRAGMA table_info(fabrics)").all() as any[]).map((c: any) => c.name);
const newFabricCols: [string, string][] = [
  ["file_url", "TEXT"],
  ["is_custom", "INTEGER DEFAULT 0"],
];
for (const [col, def] of newFabricCols) {
  if (!fabricColumns.includes(col)) {
    db.prepare(`ALTER TABLE fabrics ADD COLUMN ${col} ${def}`).run();
  }
}

const versionColumns = (db.prepare("PRAGMA table_info(design_versions)").all() as any[]).map((c: any) => c.name);
if (!versionColumns.includes("type")) {
  db.prepare("ALTER TABLE design_versions ADD COLUMN type TEXT DEFAULT 'ghost'").run();
}
if (!versionColumns.includes("view")) {
  db.prepare("ALTER TABLE design_versions ADD COLUMN view TEXT DEFAULT 'front'").run();
}

// ── Clean up blob URLs stored by old model upload bug ─────────────────────────
// Old code stored blob: URLs which are browser-session-only and useless in DB
db.prepare("DELETE FROM models WHERE preview_url LIKE 'blob:%'").run();

// ── Seed data ─────────────────────────────────────────────────────────────────
const modelsCount = db.prepare("SELECT count(*) as count FROM models").get() as any;
if (modelsCount.count === 0) {
  const insertModel = db.prepare("INSERT INTO models (id, name, preview_url) VALUES (?, ?, ?)");
  // preview_url apunta a public/models/ — coloca aquí las fotos reales de las modelos
  insertModel.run("m1", "Modelo Latina 1 — Cabello oscuro, Talla S", "/models/latina-1.jpg");
  insertModel.run("m2", "Modelo Rubia 1 — Cabello rubio, Talla S", "/models/rubia-1.jpg");
}

const fabricsCount = db.prepare("SELECT count(*) as count FROM fabrics").get() as any;
if (fabricsCount.count === 0) {
  const ins = db.prepare("INSERT INTO fabrics (id, name, material, color, texture_url, elasticity, finish, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?, 0)");
  ins.run("f1", "Lycra Mate Premium", "Poliamida/Elastano", "#1a1a1a", "", 0.85, "mate");
  ins.run("f2", "Jacquard Texturizado", "Poliéster Reciclado", "#e5e5e5", "", 0.40, "texturizado");
  ins.run("f3", "Powernet Control", "Nailon Reforzado", "#d1d5db", "", 0.20, "mate");
  ins.run("f4", "Satin Swim Luxe", "Microfibra Brillante", "#c9d1d9", "", 0.70, "satinado");
}

// ── Multer storage ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    cb(null, `${unique}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

// ── Gemini AI client ───────────────────────────────────────────────────────────
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY no configurado. Edita el archivo .env y agrega tu clave de API de Google.");
  }
  return new GoogleGenAI({ apiKey: key });
};

// ── Prompt builders ────────────────────────────────────────────────────────────
function buildGhostPrompt(
  userPrompt: string,
  view: string,
  fabricColor = "#F5F5DC",
  refMode: "sketch" | "inspiration" | "both" | "none" = "none"
): string {
  const viewMap: Record<string, string> = {
    front: "vista frontal completa, frente de la prenda",
    back: "vista trasera completa, parte posterior de la prenda",
    side: "vista lateral, perfil izquierdo de la prenda",
    closeup: "primer plano de detalle, costuras, textura y construcción del tejido",
  };
  const viewDesc = viewMap[view] || viewMap.front;

  const refInstruction: Record<typeof refMode, string> = {
    sketch: "Usa el boceto/CAD adjunto como guía exacta de silueta, cortes y construcción. Respeta fielmente la forma.",
    inspiration: "Usa la imagen de inspiración adjunta como referencia de estilo, color y diseño. Desarrolla la prenda a partir de ella.",
    both: "Usa el boceto adjunto como guía de silueta y construcción. Usa la imagen de inspiración como referencia de estilo y color.",
    none: "Genera la prenda basándote únicamente en la descripción textual.",
  };

  return `Render 3D hiperrealista de prenda de moda, estilo CLO3D / ficha técnica profesional.
Prenda: ${userPrompt}
Vista: ${viewDesc}
Referencia: ${refInstruction[refMode]}
Técnica: Ghost mannequin — la prenda flota en el aire sin cuerpo humano, sin maniquí visible, sin silueta de cuerpo.
Fondo: blanco puro (#FFFFFF) o blanco hueso (#F5F5DC), completamente limpio, sin sombras en el fondo.
Color base de tela: ${fabricColor} (hueso / beige).
Iluminación: suave, de estudio neutro, difusa, sin brillos extremos.
Calidad: fotografía técnica de moda profesional, catálogo de alta moda, render fotorrealista.
Sin accesorios externos, sin texto, sin marcas de agua.
Resolución y detalle: máxima calidad, bordes nítidos de la prenda.`;
}

function buildModelPrompt(
  userPrompt: string,
  modelName: string,
  view: string = "front",
  environment: "studio" | "outdoor" = "studio",
  hasIdentityAnchor: boolean = false
): string {
  const viewMap: Record<string, string> = {
    front: "vista frontal completa, modelo de frente",
    back: "vista trasera completa, modelo de espaldas, mostrando la parte posterior de la prenda",
    side: "vista lateral, perfil de la modelo mostrando el lateral de la prenda",
    closeup: "primer plano detallado del torso superior, mostrando detalles de la prenda en el cuerpo",
  };
  const viewDesc = viewMap[view] || viewMap.front;

  const envDesc = environment === "studio"
    ? "fondo de estudio neutro, gris claro o blanco, iluminación de estudio profesional difusa, imagen limpia y técnica"
    : "ambiente natural exterior, luz natural suave y dorada, entorno elegante (jardín, playa, ciudad moderna), editorial de moda";

  const identityBlock = hasIdentityAnchor
    ? `════ IMAGEN 1 = PRENDA (DISEÑO BLOQUEADO — NO MODIFICAR NINGÚN DETALLE) ════
La imagen ghost mannequin muestra el diseño EXACTO e INMUTABLE de la prenda.
DEBES reproducir con absoluta fidelidad:
- Todos los cortes, silueta y líneas de costura
- Todos los amarres, lazos, anillos, tirantes, cierres y accesorios de la prenda
- El color exacto y acabado del tejido
- La posición y tipo de todos los elementos decorativos o funcionales
PROHIBIDO añadir, quitar o modificar cualquier elemento de la prenda.

════ IMAGEN 2 = IDENTIDAD DE MODELO (BLOQUEADA — NO CAMBIAR) ════
ESTA PERSONA específica DEBE aparecer en el resultado. No generes otro rostro.
- Rostro: IDÉNTICO — mismos rasgos, ojos, nariz, boca
- Tono de piel: IDÉNTICO
- Cabello: IDÉNTICO — color, largo y textura
Solo varía la pose para mostrar: ${viewDesc}.`
    : `════ PRENDA (DISEÑO BLOQUEADO) ════
La imagen ghost mannequin define el diseño EXACTO: cortes, amarres, accesorios y color. NO modificar.

════ MODELO ════
${modelName} — mujer con complexión atlética y apariencia natural profesional.`;

  return `FOTOGRAFÍA DE CATÁLOGO DE MODA — swimwear/activewear.

${identityBlock}

VISTA REQUERIDA: ${viewDesc}
ENTORNO: ${envDesc}
POSE: natural y profesional que muestre la prenda completa en la vista "${view}".
CALIDAD: fotografía profesional de catálogo de alta moda, alta resolución, iluminación perfecta.
Sin texto, sin marcas de agua, sin elementos no presentes en la prenda original.`;
}

// ── Image utilities ────────────────────────────────────────────────────────────
function saveBase64Image(base64: string, prefix = "render"): string {
  const filename = `${prefix}_${Date.now()}.jpg`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
  return `/uploads/${filename}`;
}

function resolveUploadPath(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const localPath = url.startsWith("/uploads/")
    ? path.join(UPLOADS_DIR, path.basename(url))
    : undefined;
  return localPath && fs.existsSync(localPath) ? localPath : undefined;
}

function imagePartFromPath(filePath: string): any {
  const data = fs.readFileSync(filePath).toString("base64");
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { inlineData: { mimeType, data } };
}

const PUBLIC_MODELS_DIR = path.join(process.cwd(), "public", "models");

async function imagePartFromAny(source: string): Promise<any | null> {
  if (!source) return null;
  // /uploads/ paths
  const localPath = resolveUploadPath(source);
  if (localPath) return imagePartFromPath(localPath);
  // /models/ paths (pre-loaded model photos in public/models/)
  if (source.startsWith("/models/")) {
    const modelsPath = path.join(PUBLIC_MODELS_DIR, path.basename(source));
    if (fs.existsSync(modelsPath)) return imagePartFromPath(modelsPath);
  }
  // HTTP/HTTPS URL — fetch and convert
  if (source.startsWith("http://") || source.startsWith("https://")) {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const ct = res.headers.get("content-type") || "image/jpeg";
      const mimeType = ct.split(";")[0].trim();
      return { inlineData: { mimeType, data: base64 } };
    } catch { return null; }
  }
  return null;
}

const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

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

async function generateImage(prompt: string, refPaths: string[] = []): Promise<string> {
  const existingPaths = refPaths.filter(p => fs.existsSync(p));
  const parts: any[] = [
    { text: prompt },
    ...existingPaths.map(imagePartFromPath),
  ];
  return callGeminiImage(parts);
}

async function generateImageWithParts(prompt: string, extraParts: any[] = []): Promise<string> {
  const parts: any[] = [{ text: prompt }, ...extraParts];
  return callGeminiImage(parts);
}

// ── Catalog HTML generator ─────────────────────────────────────────────────────
function readImgAsDataUri(url: string | null | undefined): string {
  if (!url) return "";
  const p = resolveUploadPath(url);
  if (!p) return "";
  try {
    const b64 = fs.readFileSync(p).toString("base64");
    const ext = path.extname(p).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${b64}`;
  } catch { return ""; }
}

function generateCatalogHTML(designs: any[], allModels: any[]): string {
  const now = new Date();
  const year = now.getFullYear();
  const season = now.getMonth() < 6 ? "SS" : "FW";
  const total = designs.length;

  const byCategory = designs.reduce((acc: Record<string, any[]>, d: any) => {
    if (!acc[d.category]) acc[d.category] = [];
    acc[d.category].push(d);
    return acc;
  }, {});

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

  const designPages = designs.map((d: any, i: number) => {
    const modelInfo = allModels.find((m: any) => m.id === d.model_id);

    const heroSrc = readImgAsDataUri(d.model_front_render_url || d.model_render_url || d.front_render_url);
    const frontSrc = readImgAsDataUri(d.front_render_url);
    const backSrc = readImgAsDataUri(d.back_render_url);
    const sideSrc = readImgAsDataUri(d.side_render_url);
    const closeupSrc = readImgAsDataUri(d.closeup_render_url);
    const modelSrc = readImgAsDataUri(d.model_front_render_url || d.model_render_url);
    const outdoorSrc = readImgAsDataUri(d.outdoor_model_front_render_url);

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

  // Index page
  const indexRows = designs.map((d: any, i: number) => `
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
      const globalIdx = designs.findIndex((x: any) => x.id === d.id);
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
/* Page base */
.page{width:210mm;min-height:297mm;background:#fff;margin:24px auto;box-shadow:0 8px 60px rgba(0,0,0,.2);position:relative;overflow:hidden;}
/* Cover */
.cover{background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.cover-inner{text-align:center;color:#fff;padding:60px 40px;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.logo-mark{width:80px;height:80px;background:#E0FF00;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:900;font-style:italic;color:#000;margin-bottom:36px;box-shadow:0 0 60px rgba(224,255,0,.25);}
.brand{font-size:30px;font-weight:600;letter-spacing:.45em;text-transform:uppercase;margin-bottom:16px;}
.season{font-family:'Cormorant Garamond',serif;font-size:26px;font-style:italic;color:#E0FF00;margin-bottom:52px;letter-spacing:.05em;}
.h-rule{width:60px;height:1px;background:#222;margin-bottom:52px;}
.tagline{font-size:9px;letter-spacing:.35em;text-transform:uppercase;color:#444;margin-bottom:12px;}
.count{font-size:9px;letter-spacing:.2em;color:#333;text-transform:uppercase;}
.cover-foot{padding:24px 40px;font-size:8px;letter-spacing:.2em;color:#333;text-transform:uppercase;text-align:center;border-top:1px solid #111;}
/* Index */
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
/* Design spread */
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
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(UPLOADS_DIR));
  app.use("/models", express.static(PUBLIC_MODELS_DIR));

  // ── File Upload ──────────────────────────────────────────────────────────────
  app.post("/api/upload", upload.single("file"), (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió archivo." });
    res.json({ url: `/uploads/${req.file.filename}` });
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
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: "Responde solo 'ok'" }] }],
      });
      const text = r.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.json({ ok: true, model: "gemini-2.0-flash", response: text, imageModel: GEMINI_IMAGE_MODEL });
    } catch (err: any) {
      const cause = err?.cause?.message || err?.cause?.code || "";
      res.json({ ok: false, error: err.message, cause, stack: err.stack?.split("\n").slice(0, 5) });
    }
  });

  // ── Generate ghost mannequin render ─────────────────────────────────────────
  app.post("/api/generate/ghost", async (req: any, res: any) => {
    const { prompt, sketchUrl, inspirationUrl, view = "front", fabricColor } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el prompt." });

    try {
      const sketchPath = resolveUploadPath(sketchUrl);
      const inspirationPath = resolveUploadPath(inspirationUrl);
      const refPaths: string[] = [];
      let refMode: "sketch" | "inspiration" | "both" | "none" = "none";

      if (sketchPath && inspirationPath) { refPaths.push(sketchPath, inspirationPath); refMode = "both"; }
      else if (sketchPath) { refPaths.push(sketchPath); refMode = "sketch"; }
      else if (inspirationPath) { refPaths.push(inspirationPath); refMode = "inspiration"; }

      const fullPrompt = buildGhostPrompt(prompt, view, fabricColor, refMode);
      const base64 = await generateImage(fullPrompt, refPaths);
      const url = saveBase64Image(base64, `ghost_${view}`);
      res.json({ url });
    } catch (err: any) {
      console.error("Ghost generation error:", err.message, err?.cause);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Generate model render (per-view + per-environment) ───────────────────────
  app.post("/api/generate/model", async (req: any, res: any) => {
    const {
      prompt,
      modelName,
      ghostRenderUrl,
      identityAnchorUrl,
      environment = "studio",
      view = "front",
    } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el prompt." });

    try {
      // GHOST FIRST (garment design lock), IDENTITY SECOND (face/body lock)
      const ghostPath = resolveUploadPath(ghostRenderUrl);
      const ghostPart = ghostPath ? imagePartFromPath(ghostPath) : null;
      const identityPart = identityAnchorUrl ? await imagePartFromAny(identityAnchorUrl) : null;

      const hasIdentityAnchor = !!identityPart;
      const extraParts: any[] = [
        ...(ghostPart ? [ghostPart] : []),
        ...(identityPart ? [identityPart] : []),
      ];

      const fullPrompt = buildModelPrompt(prompt, modelName || "modelo profesional", view, environment, hasIdentityAnchor);
      const base64 = await generateImageWithParts(fullPrompt, extraParts);
      const url = saveBase64Image(base64, `model_${environment}_${view}`);
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

    const basePath = resolveUploadPath(baseRenderUrl);
    if (!basePath) return res.status(400).json({ error: "Render base no encontrado en el servidor." });

    try {
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

      const base64 = await generateImage(variantPrompt, [basePath]);
      const url = saveBase64Image(base64, "variant");
      res.json({ url });
    } catch (err: any) {
      console.error("Variant generation error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Designs CRUD ─────────────────────────────────────────────────────────────
  app.get("/api/designs", (_req: any, res: any) => {
    const designs = db.prepare("SELECT * FROM designs ORDER BY created_at DESC").all();
    res.json(designs);
  });

  app.post("/api/designs", (req: any, res: any) => {
    const { id, name, category, prompt, model_id, technical_sketch_url, inspiration_url } = req.body;
    db.prepare(`INSERT INTO designs (id, name, category, prompt, model_id, view_mode, technical_sketch_url, inspiration_url)
                VALUES (?, ?, ?, ?, ?, 'ghost', ?, ?)`)
      .run(id, name, category, prompt, model_id, technical_sketch_url || null, inspiration_url || null);
    res.json({ success: true });
  });

  app.delete("/api/designs/:id", (req: any, res: any) => {
    const { id } = req.params;
    db.prepare("DELETE FROM design_versions WHERE design_id = ?").run(id);
    db.prepare("DELETE FROM designs WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.patch("/api/designs/:id", (req: any, res: any) => {
    const { id } = req.params;
    const allowed = [
      "render_url", "front_render_url", "back_render_url", "side_render_url",
      "closeup_render_url", "model_render_url", "view_mode", "status", "prompt",
      // Per-view model renders — studio
      "model_front_render_url", "model_back_render_url", "model_side_render_url", "model_closeup_render_url",
      // Per-view model renders — outdoor
      "outdoor_model_front_render_url", "outdoor_model_back_render_url",
      "outdoor_model_side_render_url", "outdoor_model_closeup_render_url",
    ];
    const updates: string[] = [];
    const values: any[] = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: "Nada que actualizar." });
    values.push(id);
    db.prepare(`UPDATE designs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    res.json({ success: true });
  });

  app.get("/api/designs/:id/versions", (req: any, res: any) => {
    const versions = db.prepare(
      "SELECT * FROM design_versions WHERE design_id = ? ORDER BY version_number DESC"
    ).all(req.params.id);
    res.json(versions);
  });

  app.post("/api/designs/:id/versions", (req: any, res: any) => {
    const { id } = req.params;
    const { prompt, image_url, type = "ghost", view = "front" } = req.body;
    const row = db.prepare("SELECT MAX(version_number) as max_v FROM design_versions WHERE design_id = ?").get(id) as any;
    const nextV = (row?.max_v ?? 0) + 1;
    const vId = `v_${id}_${nextV}`;
    db.prepare("INSERT INTO design_versions (id, design_id, version_number, prompt, image_url, type, view) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(vId, id, nextV, prompt, image_url, type, view);
    res.json({ success: true, version_number: nextV });
  });

  // Legacy routes kept for compatibility
  app.post("/api/designs/:id/mode", (req: any, res: any) => {
    const { mode, render_url, prompt } = req.body;
    const { id } = req.params;
    db.prepare("UPDATE designs SET view_mode = ?, render_url = ? WHERE id = ?").run(mode, render_url, id);
    const row = db.prepare("SELECT MAX(version_number) as max_v FROM design_versions WHERE design_id = ?").get(id) as any;
    const nextV = (row?.max_v ?? 0) + 1;
    db.prepare("INSERT INTO design_versions (id, design_id, version_number, prompt, image_url, type) VALUES (?, ?, ?, ?, ?, ?)")
      .run(`v_${id}_${nextV}`, id, nextV, prompt, render_url, mode);
    res.json({ success: true });
  });

  app.post("/api/designs/:id/render", (req: any, res: any) => {
    const { render_url } = req.body;
    db.prepare("UPDATE designs SET render_url = ? WHERE id = ?").run(render_url, req.params.id);
    res.json({ success: true });
  });

  // ── Models CRUD ───────────────────────────────────────────────────────────────
  app.get("/api/models", (_req: any, res: any) => {
    res.json(db.prepare("SELECT * FROM models").all());
  });

  app.post("/api/models", (req: any, res: any) => {
    const { id, name, preview_url } = req.body;
    db.prepare("INSERT INTO models (id, name, preview_url) VALUES (?, ?, ?)").run(id, name, preview_url);
    res.json({ success: true });
  });

  app.delete("/api/models/:id", (req: any, res: any) => {
    db.prepare("DELETE FROM models WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // ── Fabrics CRUD ──────────────────────────────────────────────────────────────
  app.get("/api/fabrics", (_req: any, res: any) => {
    res.json(db.prepare("SELECT * FROM fabrics ORDER BY is_custom ASC, name ASC").all());
  });

  app.post("/api/fabrics", upload.single("file"), (req: any, res: any) => {
    const { id, name, material, color, elasticity, finish } = req.body;
    if (!id || !name) return res.status(400).json({ error: "Faltan campos requeridos (id, name)." });

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
    db.prepare(`INSERT INTO fabrics (id, name, material, color, file_url, elasticity, finish, is_custom)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(id, name, material || "", color || "#ffffff", fileUrl, parseFloat(elasticity) || 0.5, finish || "mate");
    res.json({ success: true, file_url: fileUrl });
  });

  app.delete("/api/fabrics/:id", (req: any, res: any) => {
    const { id } = req.params;
    const fabric = db.prepare("SELECT * FROM fabrics WHERE id = ?").get(id) as any;
    if (!fabric) return res.status(404).json({ error: "Material no encontrado." });

    if (fabric.file_url) {
      const filePath = resolveUploadPath(fabric.file_url);
      if (filePath) { try { fs.unlinkSync(filePath); } catch (_) {} }
    }
    db.prepare("DELETE FROM fabrics WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // ── Catalog generation ────────────────────────────────────────────────────────
  app.get("/api/catalog", (_req: any, res: any) => {
    const designs = db.prepare("SELECT * FROM designs ORDER BY category ASC, created_at ASC").all() as any[];
    const models = db.prepare("SELECT * FROM models").all() as any[];
    const html = generateCatalogHTML(designs, models);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
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
