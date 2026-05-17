import type { Design } from '../types';

export type CatalogImageEntry = {
  key: string;
  label: string;
  url: string;
  type: 'ghost' | 'model' | 'outdoor';
};

export function getDesignCatalogImages(design: Design): CatalogImageEntry[] {
  const imgs: CatalogImageEntry[] = [];

  if (design.front_render_url)   imgs.push({ key: 'ghost_front',    label: 'Ghost Frontal',    url: design.front_render_url,   type: 'ghost' });
  if (design.back_render_url)    imgs.push({ key: 'ghost_back',     label: 'Ghost Posterior',   url: design.back_render_url,    type: 'ghost' });
  if (design.side_render_url)    imgs.push({ key: 'ghost_side',     label: 'Ghost Lateral',     url: design.side_render_url,    type: 'ghost' });
  if (design.closeup_render_url) imgs.push({ key: 'ghost_closeup',  label: 'Ghost Close-up',    url: design.closeup_render_url, type: 'ghost' });

  const mf = design.model_front_render_url || design.model_render_url;
  if (mf)                               imgs.push({ key: 'model_front',   label: 'Modelo Frontal',   url: mf,                                    type: 'model' });
  if (design.model_back_render_url)     imgs.push({ key: 'model_back',    label: 'Modelo Posterior',  url: design.model_back_render_url,           type: 'model' });
  if (design.model_side_render_url)     imgs.push({ key: 'model_side',    label: 'Modelo Lateral',    url: design.model_side_render_url,           type: 'model' });
  if (design.model_closeup_render_url)  imgs.push({ key: 'model_closeup', label: 'Modelo Close-up',   url: design.model_closeup_render_url,        type: 'model' });

  if (design.outdoor_model_front_render_url)   imgs.push({ key: 'outdoor_front',   label: 'Outdoor Frontal',   url: design.outdoor_model_front_render_url,   type: 'outdoor' });
  if (design.outdoor_model_back_render_url)    imgs.push({ key: 'outdoor_back',    label: 'Outdoor Posterior',  url: design.outdoor_model_back_render_url,    type: 'outdoor' });
  if (design.outdoor_model_side_render_url)    imgs.push({ key: 'outdoor_side',    label: 'Outdoor Lateral',    url: design.outdoor_model_side_render_url,    type: 'outdoor' });
  if (design.outdoor_model_closeup_render_url) imgs.push({ key: 'outdoor_closeup', label: 'Outdoor Close-up',   url: design.outdoor_model_closeup_render_url, type: 'outdoor' });

  return imgs;
}

export async function imageToDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* Split prompt text into short editorial sentences */
function editorialDesc(prompt: string): string {
  if (!prompt) return '';
  // Capitalize first letter, ensure period at end
  const clean = prompt.trim().replace(/\.+$/, '');
  return clean.charAt(0).toUpperCase() + clean.slice(1) + '.';
}

/* Build the per-design page(s) — returns one or more page divs as a string */
function buildDesignSpreads(
  design: Design,
  imgs: string[],
  idx: number,
): string {
  if (imgs.length === 0) return '';

  const n    = String(idx + 1).padStart(2, '0');
  const name = esc(design.name);
  const cat  = esc(design.category);
  const desc = editorialDesc(design.prompt || '');

  const img = (src: string, alt = name, cls = '') =>
    `<img src="${esc(src)}" alt="${alt}" loading="lazy" class="${cls}"/>`;

  const infoPanel = `
    <div class="info-panel">
      <div class="ip-num">${n}</div>
      <h2 class="ip-name">${name}</h2>
      <div class="ip-cat">${cat}</div>
      <div class="ip-line"></div>
      ${desc ? `<p class="ip-desc">${esc(desc)}</p>` : ''}
      <div class="ip-details">
        <div class="ip-detail-row"><span class="ip-detail-label">Referencia</span><span class="ip-detail-val">${name}</span></div>
        <div class="ip-detail-row"><span class="ip-detail-label">Línea</span><span class="ip-detail-val">${cat}</span></div>
        <div class="ip-detail-row"><span class="ip-detail-label">Temporada</span><span class="ip-detail-val">Colección Vexia</span></div>
      </div>
      <div class="ip-footer">vexia · almeja studio</div>
    </div>`;

  const pages: string[] = [];

  if (imgs.length === 1) {
    pages.push(`
    <div class="page spread-single">
      <div class="ss-img">${img(imgs[0])}</div>
      ${infoPanel}
    </div>`);

  } else if (imgs.length === 2) {
    pages.push(`
    <div class="page spread-double">
      <div class="sd-main">${img(imgs[0])}</div>
      <div class="sd-side">
        ${infoPanel}
        <div class="sd-sec">${img(imgs[1])}</div>
      </div>
    </div>`);

  } else {
    // First page: large main + info + up to 2 secondary images
    const firstSecondary = imgs.slice(1, 3);
    const remaining = imgs.slice(3);

    const secCells = firstSecondary.map(u => `<div class="ms-cell">${img(u)}</div>`).join('');

    pages.push(`
    <div class="page spread-main">
      <div class="sm-left">${img(imgs[0])}</div>
      <div class="sm-right">
        ${infoPanel}
        ${firstSecondary.length > 0 ? `<div class="ms-row ms-${firstSecondary.length}">${secCells}</div>` : ''}
      </div>
    </div>`);

    // Additional pages: grids of up to 6 images
    if (remaining.length > 0) {
      const groups = chunk(remaining, 6);
      groups.forEach((group, gi) => {
        const gridClass = `g${Math.min(group.length, 6)}`;
        const cells = group.map((u, i) =>
          `<div class="gc ${i === 0 && gi === 0 ? 'gc-main' : ''}">${img(u)}</div>`
        ).join('');
        pages.push(`
    <div class="page spread-gallery">
      <div class="sg-header">
        <span class="sg-num">${n}</span>
        <span class="sg-name">${name}</span>
        <span class="sg-cat">${cat}</span>
        <span class="sg-cont">vistas ${gi + 2} / ${groups.length + 1}</span>
      </div>
      <div class="img-grid ${gridClass}">${cells}</div>
      <div class="sg-footer">vexia · almeja studio</div>
    </div>`);
      });
    }
  }

  return pages.join('\n');
}

export function generateCatalogHTML(
  selectedDesigns: Design[],
  imageSelections: Record<string, string[]>,
  catalogTitle: string,
  catalogSeason: string,
): string {
  const dateStr = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const totalRefs = selectedDesigns.length;

  const introThumbs = selectedDesigns.slice(0, 9).map(d => {
    const firstImg = (imageSelections[d.id] || [])[0] || '';
    return `
    <div class="it">
      <div class="it-img">${firstImg ? `<img src="${esc(firstImg)}" alt="${esc(d.name)}" loading="lazy"/>` : ''}</div>
      <div class="it-label">${esc(d.name)}</div>
    </div>`;
  }).join('');

  const spreads = selectedDesigns.map((design, idx) =>
    buildDesignSpreads(design, imageSelections[design.id] || [], idx)
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(catalogTitle)} — Vexia ${esc(catalogSeason)}</title>
<style>
:root{--or:#e5662d;--bk:#000;--cr:#f0e8dc;--crd:#ede5d8;--gy:#6b5a4e;--wh:#fff;--gy2:#9a8a7a}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--cr);color:var(--bk)}
img{display:block;width:100%;height:100%;object-fit:contain;background:var(--crd)}

/* PAGE */
.page{width:297mm;min-height:210mm;position:relative;overflow:hidden;page-break-after:always;page-break-inside:avoid;break-inside:avoid}

/* COVER */
.cover{background:var(--bk);display:grid;grid-template-columns:2fr 3fr;min-height:210mm}
.cv-l{background:var(--or);display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding:44px}
.cv-vexia{font-size:110px;font-weight:900;line-height:.85;letter-spacing:-4px;color:var(--bk);text-transform:lowercase}
.cv-r{display:flex;flex-direction:column;justify-content:space-between;padding:44px;background:var(--bk)}
.cv-studio{font-size:9px;letter-spacing:.35em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:4px}
.cv-prop{font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:rgba(229,102,45,.6)}
.cv-collabel{font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:10px}
.cv-title{font-size:30px;font-weight:700;color:var(--wh);letter-spacing:-.5px;line-height:1.1}
.cv-season{font-size:12px;color:var(--or);letter-spacing:.25em;text-transform:uppercase;margin-top:10px}
.cv-date{font-size:9px;color:rgba(255,255,255,.15);letter-spacing:.08em;margin-top:48px}

/* INTRO */
.intro{display:grid;grid-template-columns:1fr 1fr;min-height:210mm}
.in-l{background:var(--or);display:flex;flex-direction:column;justify-content:flex-end;padding:48px}
.in-l h2{font-size:52px;font-weight:900;color:var(--bk);line-height:1;letter-spacing:-1.5px}
.in-l p{font-size:12px;color:rgba(0,0,0,.55);line-height:1.7;margin-top:18px}
.in-r{background:var(--cr);padding:48px;display:flex;flex-direction:column}
.in-label{font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:var(--gy);margin-bottom:20px}
.in-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;flex:1;align-content:start}
.it-img{aspect-ratio:2/3;overflow:hidden;background:var(--crd)}
.it-label{font-size:8px;letter-spacing:.04em;color:var(--gy);padding:4px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* INFO PANEL */
.info-panel{display:flex;flex-direction:column;height:100%;padding:36px}
.ip-num{font-size:56px;font-weight:900;color:rgba(0,0,0,.04);line-height:1;letter-spacing:-2px;margin-bottom:-6px}
.ip-name{font-size:22px;font-weight:700;letter-spacing:-.4px;color:var(--bk);line-height:1.1}
.ip-cat{font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:var(--or);margin-top:6px}
.ip-line{width:28px;height:2px;background:var(--or);margin:18px 0}
.ip-desc{font-size:10.5px;line-height:1.8;color:var(--gy);margin-bottom:20px}
.ip-details{margin-top:auto;border-top:1px solid rgba(0,0,0,.06);padding-top:14px;display:flex;flex-direction:column;gap:8px}
.ip-detail-row{display:flex;justify-content:space-between;align-items:baseline}
.ip-detail-label{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--gy2)}
.ip-detail-val{font-size:10px;font-weight:600;color:var(--bk)}
.ip-footer{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,0,0,.13);margin-top:20px;padding-top:12px;border-top:1px solid rgba(0,0,0,.05)}

/* SINGLE SPREAD */
.spread-single{display:grid;grid-template-columns:3fr 2fr;min-height:210mm}
.ss-img{overflow:hidden;background:var(--crd)}

/* DOUBLE SPREAD */
.spread-double{display:grid;grid-template-columns:3fr 2fr;min-height:210mm}
.sd-main{overflow:hidden;background:var(--crd)}
.sd-side{display:flex;flex-direction:column;background:var(--wh)}
.sd-sec{height:200px;overflow:hidden;background:var(--crd);margin:0 36px 36px}

/* MULTI-IMAGE MAIN SPREAD */
.spread-main{display:grid;grid-template-columns:3fr 2fr;min-height:210mm}
.sm-left{overflow:hidden;background:var(--crd)}
.sm-right{background:var(--wh);display:flex;flex-direction:column}
.ms-row{display:grid;gap:6px;padding:0 36px 36px;margin-top:auto}
.ms-1{grid-template-columns:1fr}
.ms-2{grid-template-columns:1fr 1fr}
.ms-cell{aspect-ratio:1;overflow:hidden;background:var(--crd)}

/* GALLERY SPREAD */
.spread-gallery{background:var(--wh);padding:32px 36px;min-height:210mm;display:flex;flex-direction:column;gap:14px}
.sg-header{display:flex;align-items:baseline;gap:14px;padding-bottom:14px;border-bottom:1px solid rgba(0,0,0,.06)}
.sg-num{font-size:28px;font-weight:900;color:rgba(0,0,0,.06)}
.sg-name{font-size:18px;font-weight:700;color:var(--bk);flex:1}
.sg-cat{font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:var(--or)}
.sg-cont{font-size:8px;letter-spacing:.15em;color:var(--gy2)}
.sg-footer{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,0,0,.12);margin-top:auto;text-align:right}
.img-grid{display:grid;gap:8px;flex:1}
.img-grid .gc{overflow:hidden;background:var(--crd)}
.g1{grid-template-columns:1fr}
.g2{grid-template-columns:1fr 1fr}
.g3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr}.g3 .gc:first-child{grid-row:span 2}
.g4{grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr}.g4 .gc:first-child{grid-row:span 2}
.g5{grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr}.g5 .gc:first-child{grid-column:span 2}
.g6{grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr}

/* BACK COVER */
.back-cover{background:var(--bk);min-height:210mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0}
.bc-vexia{font-size:88px;font-weight:900;color:var(--wh);letter-spacing:-3px;line-height:1}
.bc-vexia span{color:var(--or)}
.bc-line{width:56px;height:2px;background:var(--or);margin:20px 0}
.bc-tag{font-size:10px;letter-spacing:.4em;text-transform:uppercase;color:rgba(255,255,255,.25)}
.bc-date{font-size:9px;color:rgba(255,255,255,.12);letter-spacing:.08em;margin-top:20px}

/* TOOLBAR */
.toolbar{position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,.97);padding:14px 36px;display:flex;align-items:center;justify-content:space-between;z-index:100;backdrop-filter:blur(12px)}
.tb-brand{font-size:13px;font-weight:700;letter-spacing:.12em;color:#f0e8dc;text-transform:uppercase}
.tb-brand span{color:#e5662d}
.tb-actions{display:flex;gap:10px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 24px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border:none;transition:all .15s}
.btn-p{background:#e5662d;color:#fff}
.btn-p:hover{background:#c4541e;transform:scale(1.02)}
.btn-o{background:transparent;color:#f0e8dc;border:1px solid #3a3028}
.btn-o:hover{border-color:#e5662d;color:#e5662d}

/* PRINT */
@media print{
  .toolbar{display:none!important}
  body{padding:0!important;background:#fff}
  .page{width:100%;min-height:100vh;page-break-after:always}
  .cover,.in-l,.back-cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4 landscape;margin:0}
}
@media screen{
  body{padding-bottom:72px}
  .page{max-width:1190px;margin:0 auto 12px;box-shadow:0 4px 40px rgba(0,0,0,.12)}
}
</style>
</head>
<body>

<!-- COVER -->
<div class="page cover">
  <div class="cv-l">
    <div class="cv-vexia">ve<br/>xia</div>
  </div>
  <div class="cv-r">
    <div>
      <div class="cv-studio">almeja studio</div>
      <div class="cv-prop">desarrollos con propósito</div>
    </div>
    <div>
      <div class="cv-collabel">Catálogo de Diseños</div>
      <div class="cv-title">${esc(catalogTitle)}</div>
      <div class="cv-season">${esc(catalogSeason)}</div>
    </div>
    <div class="cv-date">Generado el ${dateStr} &nbsp;·&nbsp; ${totalRefs} referencia${totalRefs !== 1 ? 's' : ''}</div>
  </div>
</div>

<!-- INTRO -->
<div class="page intro">
  <div class="in-l">
    <h2>La<br/>colección.</h2>
    <p>${totalRefs} referencia${totalRefs !== 1 ? 's' : ''} de swimwear y activewear<br/>diseñadas con inteligencia artificial.</p>
  </div>
  <div class="in-r">
    <div class="in-label">Referencias incluidas</div>
    <div class="in-grid">${introThumbs}</div>
  </div>
</div>

<!-- DESIGN SPREADS -->
${spreads}

<!-- BACK COVER -->
<div class="page back-cover">
  <div class="bc-vexia">ve<span>x</span>ia</div>
  <div class="bc-line"></div>
  <div class="bc-tag">desarrollos con propósito &nbsp;·&nbsp; est. 2011</div>
  <div class="bc-date">almeja studio &nbsp;·&nbsp; ${dateStr}</div>
</div>

<!-- TOOLBAR -->
<div class="toolbar">
  <div class="tb-brand">ve<span>x</span>ia &nbsp;·&nbsp; almeja studio</div>
  <div class="tb-actions">
    <button class="btn btn-o" onclick="dlHTML()">Descargar HTML</button>
    <button class="btn btn-p" onclick="window.print()">Guardar PDF</button>
  </div>
</div>

<script>
function dlHTML(){
  var clone=document.documentElement.cloneNode(true);
  var tb=clone.querySelector('.toolbar');if(tb)tb.remove();
  var sc=clone.querySelector('script');if(sc)sc.remove();
  var html='<!DOCTYPE html>'+clone.outerHTML;
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='catalogo-vexia-${esc(catalogTitle.replace(/\s+/g, '-').toLowerCase())}-${dateStr.replace(/\s/g,'')}.html';
  a.click();URL.revokeObjectURL(a.href);
}
</script>
</body>
</html>`;
}
