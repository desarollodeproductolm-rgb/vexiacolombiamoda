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
    finish TEXT
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

// Migrations for existing databases
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
];
for (const [col, def] of newDesignCols) {
  if (!designColumns.includes(col)) {
    db.prepare(`ALTER TABLE designs ADD COLUMN ${col} ${def}`).run();
  }
}

const versionColumns = (db.prepare("PRAGMA table_info(design_versions)").all() as any[]).map((c: any) => c.name);
if (!versionColumns.includes("type")) {
  db.prepare("ALTER TABLE design_versions ADD COLUMN type TEXT DEFAULT 'ghost'").run();
}
if (!versionColumns.includes("view")) {
  db.prepare("ALTER TABLE design_versions ADD COLUMN view TEXT DEFAULT 'front'").run();
}

// Seed data
const modelsCount = db.prepare("SELECT count(*) as count FROM models").get() as any;
if (modelsCount.count === 0) {
  const insertModel = db.prepare("INSERT INTO models (id, name, preview_url) VALUES (?, ?, ?)");
  insertModel.run("m1", "Elena — Latina, Talla S, 1.70m", "https://i.pravatar.cc/150?u=a042581f4e29026704d");
  insertModel.run("m2", "Sofia — Latina, Talla M, 1.72m", "https://i.pravatar.cc/150?u=a042581f4e29026704e");
}

const fabricsCount = db.prepare("SELECT count(*) as count FROM fabrics").get() as any;
if (fabricsCount.count === 0) {
  const ins = db.prepare("INSERT INTO fabrics (id, name, material, color, texture_url, elasticity, finish) VALUES (?, ?, ?, ?, ?, ?, ?)");
  ins.run("f1", "Lycra Mate Premium", "Poliamida/Elastano", "#1a1a1a", "", 0.85, "mate");
  ins.run("f2", "Jacquard Texturizado", "Poliéster Reciclado", "#e5e5e5", "", 0.40, "texturizado");
  ins.run("f3", "Powernet Control", "Nailon Reforzado", "#d1d5db", "", 0.20, "mate");
  ins.run("f4", "Satin Swim Luxe", "Microfibra Brillante", "#c9d1d9", "", 0.70, "satinado");
}

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    cb(null, `${unique}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Gemini AI client
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY no configurado. Edita el archivo .env y agrega tu clave de API de Google.");
  }
  return new GoogleGenAI({ apiKey: key });
};

// Build ghost mannequin prompt for a given view
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

// Build model render prompt
function buildModelPrompt(
  userPrompt: string,
  modelName: string,
  environment: "studio" | "outdoor" = "studio",
  hasIdentityAnchor: boolean = false
): string {
  const envDesc = environment === "studio"
    ? "fondo de estudio neutro, gris claro o blanco, iluminación de estudio profesional difusa"
    : "ambiente natural exterior, luz natural suave, entorno elegante (jardín, playa, ciudad)";

  const identityBlock = hasIdentityAnchor
    ? `IDENTIDAD DE MODELO (BLOQUEADA — imagen de referencia adjunta):
- DEBES reproducir con exactitud absoluta el rostro, tono de piel, color y largo de cabello, y proporciones corporales de la modelo en la imagen de referencia.
- NO cambies ningún rasgo físico de la modelo. Solo puede variar la pose.`
    : `IDENTIDAD DE MODELO:
- Modelo: ${modelName}. Mujer latina, complexión atlética, apariencia natural y profesional.
- Genera una modelo con estos rasgos y mantenla idéntica en todas las imágenes futuras.`;

  return `Fotografía de moda profesional, estilo editorial de alta moda.

${identityBlock}

PRENDA (BLOQUEADA — imagen ghost mannequin adjunta):
- La prenda de referencia (imagen ghost mannequin) define el diseño EXACTO: cortes, silueta, costuras, detalles y color.
- NO modifiques el diseño de la prenda bajo ninguna circunstancia.
- La modelo viste esa prenda exacta: ${userPrompt}

ENTORNO: ${envDesc}
POSE: dinámica, que muestre los detalles técnicos de la prenda. Solo la pose puede variar entre imágenes.
CALIDAD: fotografía profesional de catálogo de moda, alta resolución, iluminación natural.
Sin texto, sin marcas de agua, sin accesorios no mencionados.`;
}

// Save base64 image to disk and return URL
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

async function generateImage(prompt: string, refPaths: string[] = []): Promise<string> {
  const ai = getAI();

  const existingPaths = refPaths.filter(p => fs.existsSync(p));
  const parts: any[] = [
    { text: prompt },
    ...existingPaths.map(imagePartFromPath),
  ];

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts }],
    config: { responseModalities: ["TEXT", "IMAGE"] } as any,
  });

  const responseParts = response.candidates?.[0]?.content?.parts ?? [];
  const imgPart = responseParts.find((p: any) => p.inlineData?.data);
  if (!imgPart?.inlineData?.data) throw new Error("El modelo no generó imagen. Verifica el prompt o intenta de nuevo.");
  return imgPart.inlineData.data;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(UPLOADS_DIR));

  // ── File Upload ─────────────────────────────────────────────────────────────
  app.post("/api/upload", upload.single("file"), (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió archivo." });
    res.json({ url: `/uploads/${req.file.filename}` });
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

      if (sketchPath && inspirationPath) {
        refPaths.push(sketchPath, inspirationPath);
        refMode = "both";
      } else if (sketchPath) {
        refPaths.push(sketchPath);
        refMode = "sketch";
      } else if (inspirationPath) {
        refPaths.push(inspirationPath);
        refMode = "inspiration";
      }

      const fullPrompt = buildGhostPrompt(prompt, view, fabricColor, refMode);
      const base64 = await generateImage(fullPrompt, refPaths);
      const url = saveBase64Image(base64, `ghost_${view}`);
      res.json({ url });
    } catch (err: any) {
      console.error("Ghost generation error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Generate model render ─────────────────────────────────────────────────
  app.post("/api/generate/model", async (req: any, res: any) => {
    const { prompt, modelName, ghostRenderUrl, identityAnchorUrl, environment = "studio" } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el prompt." });

    try {
      // Reference priority:
      // 1. Ghost render  → tells the model WHAT garment to put on (locked design)
      // 2. Identity anchor → tells the model WHO the model is (locked face/body)
      const refPaths: string[] = [];

      const ghostPath = resolveUploadPath(ghostRenderUrl);
      if (ghostPath) refPaths.push(ghostPath);                    // garment reference first

      const identityPath = resolveUploadPath(identityAnchorUrl);
      if (identityPath) refPaths.push(identityPath);             // identity anchor second

      const hasIdentityAnchor = !!identityPath;
      const fullPrompt = buildModelPrompt(prompt, modelName || "modelo profesional", environment, hasIdentityAnchor);

      const base64 = await generateImage(fullPrompt, refPaths);
      const url = saveBase64Image(base64, "model");
      res.json({ url });
    } catch (err: any) {
      console.error("Model generation error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Designs CRUD ─────────────────────────────────────────────────────────
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
    const allowed = ["render_url", "front_render_url", "back_render_url", "side_render_url",
      "closeup_render_url", "model_render_url", "view_mode", "status", "prompt"];
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

  // ── Models & Fabrics ──────────────────────────────────────────────────────
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

  app.get("/api/fabrics", (_req: any, res: any) => {
    res.json(db.prepare("SELECT * FROM fabrics").all());
  });

  // ── Vite / Static ─────────────────────────────────────────────────────────
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
