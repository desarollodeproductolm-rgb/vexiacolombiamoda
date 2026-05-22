// Script de migración: SQLite local → Supabase (DB + Storage)
// Ejecutar una sola vez: node migrate-to-supabase.mjs

import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "uploads");
const BUCKET = "uploads";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const db = new Database("swimtech.db", { readonly: true });

// ── Subir un archivo local a Supabase Storage ──────────────────────────────────
async function uploadLocalFile(localUrl) {
  if (!localUrl || !localUrl.startsWith("/uploads/")) return localUrl;
  const filename = path.basename(localUrl);
  const localPath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(localPath)) {
    console.log(`  ⚠ Archivo no encontrado localmente: ${filename}`);
    return null;
  }
  const buffer = fs.readFileSync(localPath);
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mime, upsert: true });

  if (error) {
    console.log(`  ✗ Error subiendo ${filename}: ${error.message}`);
    return null;
  }
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
  console.log(`  ✓ ${filename}`);
  return publicUrl;
}

// ── Migrar todas las URLs de un objeto design ──────────────────────────────────
async function migrateDesignUrls(d) {
  const urlFields = [
    "technical_sketch_url", "inspiration_url", "render_url",
    "front_render_url", "back_render_url", "side_render_url",
    "closeup_render_url", "model_render_url",
    "model_front_render_url", "model_back_render_url",
    "model_side_render_url", "model_closeup_render_url",
    "outdoor_model_front_render_url", "outdoor_model_back_render_url",
    "outdoor_model_side_render_url", "outdoor_model_closeup_render_url",
  ];

  const result = { ...d };

  for (const field of urlFields) {
    if (d[field]) result[field] = await uploadLocalFile(d[field]);
  }

  // Arrays JSON (sketch_urls, inspiration_urls)
  for (const field of ["sketch_urls", "inspiration_urls"]) {
    if (d[field]) {
      try {
        const urls = JSON.parse(d[field]);
        const newUrls = await Promise.all(urls.map(u => uploadLocalFile(u)));
        result[field] = JSON.stringify(newUrls.filter(Boolean));
      } catch { result[field] = null; }
    }
  }

  return result;
}

async function main() {
  console.log("=== MIGRACIÓN SQLite → Supabase ===\n");

  // ── 1. Modelos ───────────────────────────────────────────────────────────────
  console.log("📋 Migrando modelos...");
  const models = db.prepare("SELECT * FROM models").all();
  for (const m of models) {
    const previewUrl = m.preview_url?.startsWith("/uploads/")
      ? await uploadLocalFile(m.preview_url)
      : m.preview_url || "";

    const { error } = await supabase.from("models")
      .upsert({ id: m.id, name: m.name, preview_url: previewUrl || "" }, { onConflict: "id" });

    if (error) console.log(`  ✗ Modelo ${m.name}: ${error.message}`);
    else console.log(`  ✓ Modelo: ${m.name}`);
  }

  // ── 2. Telas ─────────────────────────────────────────────────────────────────
  console.log("\n📋 Migrando telas...");
  const fabrics = db.prepare("SELECT * FROM fabrics").all();
  for (const f of fabrics) {
    const fileUrl = f.file_url?.startsWith("/uploads/")
      ? await uploadLocalFile(f.file_url)
      : f.file_url || null;

    const { error } = await supabase.from("fabrics").upsert({
      id: f.id, name: f.name, material: f.material || "",
      color: f.color || "#ffffff", elasticity: f.elasticity || 0.5,
      finish: f.finish || "mate", is_custom: f.is_custom || 0,
      file_url: fileUrl,
    }, { onConflict: "id" });

    if (error) console.log(`  ✗ Tela ${f.name}: ${error.message}`);
    else console.log(`  ✓ Tela: ${f.name}`);
  }

  // ── 3. Diseños + renders ──────────────────────────────────────────────────────
  console.log("\n📋 Migrando diseños y renders...");
  const designs = db.prepare("SELECT * FROM designs").all();
  for (const d of designs) {
    console.log(`\n→ ${d.name} (${d.id})`);
    const migrated = await migrateDesignUrls(d);

    const { error } = await supabase.from("designs").upsert({
      id: migrated.id,
      name: migrated.name,
      category: migrated.category,
      status: migrated.status || "sketch",
      prompt: migrated.prompt || null,
      model_id: migrated.model_id || null,
      view_mode: migrated.view_mode || "ghost",
      created_at: migrated.created_at,
      technical_sketch_url: migrated.technical_sketch_url || null,
      inspiration_url: migrated.inspiration_url || null,
      sketch_urls: migrated.sketch_urls || null,
      inspiration_urls: migrated.inspiration_urls || null,
      render_url: migrated.render_url || null,
      front_render_url: migrated.front_render_url || null,
      back_render_url: migrated.back_render_url || null,
      side_render_url: migrated.side_render_url || null,
      closeup_render_url: migrated.closeup_render_url || null,
      model_render_url: migrated.model_render_url || null,
      model_front_render_url: migrated.model_front_render_url || null,
      model_back_render_url: migrated.model_back_render_url || null,
      model_side_render_url: migrated.model_side_render_url || null,
      model_closeup_render_url: migrated.model_closeup_render_url || null,
      outdoor_model_front_render_url: migrated.outdoor_model_front_render_url || null,
      outdoor_model_back_render_url: migrated.outdoor_model_back_render_url || null,
      outdoor_model_side_render_url: migrated.outdoor_model_side_render_url || null,
      outdoor_model_closeup_render_url: migrated.outdoor_model_closeup_render_url || null,
    }, { onConflict: "id" });

    if (error) console.log(`  ✗ Error insertando diseño: ${error.message}`);
    else console.log(`  ✓ Diseño ${d.name} migrado`);
  }

  // ── 4. Versiones ─────────────────────────────────────────────────────────────
  console.log("\n📋 Migrando versiones...");
  const versions = db.prepare("SELECT * FROM design_versions").all();
  for (const v of versions) {
    const imageUrl = v.image_url?.startsWith("/uploads/")
      ? await uploadLocalFile(v.image_url)
      : v.image_url || null;

    const { error } = await supabase.from("design_versions").upsert({
      id: v.id, design_id: v.design_id, version_number: v.version_number,
      prompt: v.prompt || null, image_url: imageUrl,
      type: v.type || "ghost", view: v.view || "front",
      created_at: v.created_at,
    }, { onConflict: "id" });

    if (error) console.log(`  ✗ Versión ${v.id}: ${error.message}`);
  }
  console.log(`  ✓ ${versions.length} versiones migradas`);

  db.close();
  console.log("\n✅ Migración completa.");
}

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
