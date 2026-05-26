import { useState, useEffect, useRef, ChangeEvent, MouseEvent } from 'react';
import {
  Plus,
  Layers,
  Sparkles,
  LayoutDashboard,
  Upload,
  Shirt,
  Users,
  Download,
  Eye,
  Settings,
  Menu,
  X,
  Cpu,
  History,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ImagePlus,
  Trash2,
  BookOpen,
  Palette,
  Gem,
  ChevronDown,
  ChevronUp,
  FileImage,
  Pencil,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import type { Design, Category, Fabric, DesignVersion, Model, ViewType } from './types';
import { getDesignCatalogImages, generateCatalogHTML, imageToDataUrl } from './lib/catalogGenerator';
import type { EnrichedDesignContent } from './lib/catalogGenerator';

const CATEGORIES: Category[] = ['Core', 'Moda', 'Natación Deportiva', 'Bodies', 'Resort', 'Activewear'];

const VIEW_LABELS: Record<ViewType, string> = {
  front: 'Frontal',
  back: 'Posterior',
  side: 'Lateral',
  closeup: 'Close-up',
};

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiUploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al subir archivo.');
  return data.url as string;
}

async function apiGenerateGhost(
  prompt: string,
  view: ViewType,
  sketchUrls?: string[],
  inspirationUrls?: string[],
  frontRenderUrl?: string
): Promise<string> {
  const res = await fetch('/api/generate/ghost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, view, sketchUrls: sketchUrls || [], inspirationUrls: inspirationUrls || [], frontRenderUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al generar render.');
  return data.url as string;
}

async function apiGenerateModel(
  prompt: string,
  modelName: string,
  ghostRenderUrl?: string,
  identityAnchorUrl?: string,
  environment: 'studio' | 'outdoor' = 'studio',
  view: ViewType = 'front',
  category?: string
): Promise<string> {
  const res = await fetch('/api/generate/model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, modelName, ghostRenderUrl, identityAnchorUrl, environment, view, category }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al generar imagen con modelo.');
  return data.url as string;
}

async function apiGenerateVariant(
  baseRenderUrl: string,
  prompt: string,
  fabric: Fabric
): Promise<string> {
  const res = await fetch('/api/generate/variant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseRenderUrl,
      prompt,
      fabricName: fabric.name,
      fabricColor: fabric.color,
      fabricMaterial: fabric.material,
      fabricFinish: fabric.finish,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al generar variante.');
  return data.url as string;
}

async function apiPatchDesign(id: string, fields: Partial<Design>) {
  await fetch(`/api/designs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

async function apiAddVersion(
  designId: string,
  prompt: string,
  imageUrl: string,
  type: 'ghost' | 'model' | 'variant' | 'edit',
  view: ViewType
) {
  await fetch(`/api/designs/${designId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_url: imageUrl, type, view }),
  });
}

async function apiTestAI(): Promise<{ ok: boolean; error?: string; cause?: string; model?: string }> {
  const res = await fetch('/api/test-ai');
  return res.json();
}

async function apiListModels(): Promise<{ models?: string[]; error?: string }> {
  const res = await fetch('/api/list-models');
  return res.json();
}

async function apiGenerateEditView(
  baseRenderUrl: string,
  editInstructions: string,
  prompt: string,
  view: ViewType
): Promise<string> {
  const res = await fetch('/api/generate/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRenderUrl, editInstructions, prompt, view }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al editar imagen.');
  return data.url as string;
}

// ── Design URL array helpers ───────────────────────────────────────────────────
function getSketchUrls(design: Design): string[] {
  try { if (design.sketch_urls) return JSON.parse(design.sketch_urls); } catch {}
  return design.technical_sketch_url ? [design.technical_sketch_url] : [];
}
function getInspirationUrls(design: Design): string[] {
  try { if (design.inspiration_urls) return JSON.parse(design.inspiration_urls); } catch {}
  return design.inspiration_url ? [design.inspiration_url] : [];
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function App() {
  // ── Core state ───────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All');
  const [designs, setDesigns] = useState<Design[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedFabric, setSelectedFabric] = useState<Fabric | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [designVersions, setDesignVersions] = useState<DesignVersion[]>([]);
  const [activeView, setActiveView] = useState<ViewType>('front');
  const [generatingView, setGeneratingView] = useState<ViewType | null>(null);
  const [isGeneratingModel, setIsGeneratingModel] = useState(false);
  const [modelEnvironment, setModelEnvironment] = useState<'studio' | 'outdoor'>('studio');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  // Selected version in history (overrides current render in viewport)
  const [previewVersion, setPreviewVersion] = useState<DesignVersion | null>(null);

  // Creation modal state
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');
  const [newDesignCategory, setNewDesignCategory] = useState<Category>('Core');
  const [newDesignPrompt, setNewDesignPrompt] = useState('');
  const [sketchFiles, setSketchFiles] = useState<File[]>([]);
  const [sketchPreviews, setSketchPreviews] = useState<string[]>([]);
  const [inspirationFiles, setInspirationFiles] = useState<File[]>([]);
  const [inspirationPreviews, setInspirationPreviews] = useState<string[]>([]);

  // AI connectivity test
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [aiTestMsg, setAiTestMsg] = useState('');

  // Variant generation state
  const [isGeneratingVariant, setIsGeneratingVariant] = useState(false);

  // Fabric management modal
  const [isFabricModalOpen, setFabricModalOpen] = useState(false);
  const [newFabricName, setNewFabricName] = useState('');
  const [newFabricMaterial, setNewFabricMaterial] = useState('');
  const [newFabricColor, setNewFabricColor] = useState('#1a1a1a');
  const [newFabricElasticity, setNewFabricElasticity] = useState(0.5);
  const [newFabricFinish, setNewFabricFinish] = useState<Fabric['finish']>('mate');
  const [newFabricFile, setNewFabricFile] = useState<File | null>(null);
  const [newFabricFileName, setNewFabricFileName] = useState('');
  const [isUploadingFabric, setIsUploadingFabric] = useState(false);

  // UI toggles
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // ── Catalog Builder state ────────────────────────────────────────────────────
  const [isCatalogBuilderOpen, setIsCatalogBuilderOpen] = useState(false);
  const [catalogStep, setCatalogStep] = useState<1 | 2>(1);
  const [catalogSelectedIds, setCatalogSelectedIds] = useState<Set<string>>(new Set());
  const [catalogImageSelections, setCatalogImageSelections] = useState<Record<string, string[]>>({});
  const [catalogTitle, setCatalogTitle] = useState('Colección');
  const [catalogSeason, setCatalogSeason] = useState('2025');
  const [isGeneratingCatalog, setIsGeneratingCatalog] = useState(false);
  const [catalogStatusText, setCatalogStatusText] = useState('');

  // View editing (Improvement 2)
  const [editingView, setEditingView] = useState<ViewType | null>(null);
  const [viewEditInstructions, setViewEditInstructions] = useState('');
  const [isEditingView, setIsEditingView] = useState(false);

  // Multi-view variant (Improvement 3B)
  const [variantViewSelections, setVariantViewSelections] = useState<Set<ViewType>>(new Set(['front']));
  const [variantProgress, setVariantProgress] = useState<{ current: number; total: number } | null>(null);

  // Inline rename
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');

  // Inline category change
  const [isEditingCategory, setIsEditingCategory] = useState(false);

  // Mobile UI
  const [isMobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Refs
  const sketchInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const fabricFileInputRef = useRef<HTMLInputElement>(null);

  // ── Effects ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchDesigns();
    fetchFabrics();
    fetchModels();
  }, []);

  useEffect(() => {
    if (selectedDesign) {
      fetchVersions(selectedDesign.id);
      setEditPrompt(selectedDesign.prompt || '');
      setActiveView('front');
      setPreviewVersion(null);
    }
  }, [selectedDesign?.id]);

  // ── Data fetchers ─────────────────────────────────────────────────────────────
  const fetchDesigns = async () => {
    try {
      const res = await fetch('/api/designs');
      const data = await res.json();
      setDesigns(data);
      if (selectedDesign) {
        const updated = data.find((d: Design) => d.id === selectedDesign.id);
        if (updated) setSelectedDesign(updated);
      }
    } catch (e) { console.error('fetchDesigns', e); }
  };

  const fetchVersions = async (designId: string) => {
    try {
      const res = await fetch(`/api/designs/${designId}/versions`);
      setDesignVersions(await res.json());
    } catch (e) { console.error('fetchVersions', e); }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(data);
      if (data.length > 0 && !selectedModelId) setSelectedModelId(data[0].id);
    } catch (e) { console.error('fetchModels', e); }
  };

  const fetchFabrics = async () => {
    try {
      const res = await fetch('/api/fabrics');
      const data = await res.json();
      setFabrics(data);
      if (data.length > 0 && !selectedFabric) setSelectedFabric(data[0]);
    } catch (e) { console.error('fetchFabrics', e); }
  };

  // ── Render URL resolver ───────────────────────────────────────────────────────
  // Returns the stored render URL for the current mode/view/environment (never regenerates)
  const getRenderUrl = (design: Design, view: ViewType): string | undefined => {
    if (design.view_mode === 'model') {
      if (modelEnvironment === 'outdoor') {
        const map: Record<ViewType, string | undefined> = {
          front: design.outdoor_model_front_render_url,
          back: design.outdoor_model_back_render_url,
          side: design.outdoor_model_side_render_url,
          closeup: design.outdoor_model_closeup_render_url,
        };
        return map[view];
      }
      // Studio model
      const map: Record<ViewType, string | undefined> = {
        front: design.model_front_render_url || design.model_render_url,
        back: design.model_back_render_url,
        side: design.model_side_render_url,
        closeup: design.model_closeup_render_url,
      };
      return map[view];
    }
    // Ghost mode (always studio)
    const map: Record<ViewType, string | undefined> = {
      front: design.front_render_url,
      back: design.back_render_url,
      side: design.side_render_url,
      closeup: design.closeup_render_url,
    };
    return map[view];
  };

  // Returns true if a render exists in the given mode/env for any view of this design
  const hasAnyModelRender = (design: Design): boolean =>
    !!(design.model_front_render_url || design.model_render_url);

  // The viewport shows the previewVersion image OR the stored render for the current view
  const currentRenderUrl = previewVersion?.image_url || (selectedDesign ? getRenderUrl(selectedDesign, activeView) : undefined);

  // ── AI connectivity test ──────────────────────────────────────────────────────
  const handleTestAI = async () => {
    setAiTestStatus('loading');
    setAiTestMsg('Verificando API y modelos disponibles...');
    try {
      const [testResult, modelsResult] = await Promise.all([apiTestAI(), apiListModels()]);
      if (testResult.ok) {
        const imageModels = modelsResult.models?.filter(m => m.toLowerCase().includes('image') || m.toLowerCase().includes('imagen')) ?? [];
        const modelHint = imageModels.length > 0 ? ` | Modelos imagen: ${imageModels.slice(0, 3).join(', ')}` : '';
        setAiTestStatus('ok');
        setAiTestMsg(`Conexión OK${modelHint}`);
      } else {
        const models = modelsResult.models?.slice(0, 5).join(', ') || '';
        const hint = models ? ` | Modelos disponibles: ${models}` : '';
        setAiTestStatus('error');
        setAiTestMsg((testResult.cause ? `${testResult.error} — ${testResult.cause}` : testResult.error || 'Error desconocido') + hint);
      }
    } catch (e: any) {
      setAiTestStatus('error');
      setAiTestMsg(`No se pudo conectar al servidor: ${e.message}`);
    }
  };

  // ── Create design ─────────────────────────────────────────────────────────────
  const handleCreateDesign = async () => {
    if (!newDesignName.trim()) { alert('Por favor, asigne un nombre a la referencia.'); return; }
    if (!selectedModelId) { alert('Debe seleccionar o cargar una modelo.'); return; }
    if (!newDesignPrompt.trim()) { alert('Ingrese la descripción de la prenda.'); return; }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      // Upload all sketch and inspiration files in parallel
      const uploadedSketchUrls = sketchFiles.length > 0
        ? await Promise.all(sketchFiles.map(f => apiUploadFile(f)))
        : [];
      const uploadedInspirationUrls = inspirationFiles.length > 0
        ? await Promise.all(inspirationFiles.map(f => apiUploadFile(f)))
        : [];

      const designId = Math.random().toString(36).substr(2, 9);
      await fetch('/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: designId,
          name: newDesignName,
          category: newDesignCategory,
          prompt: newDesignPrompt,
          model_id: selectedModelId,
          // Legacy single-URL fields (first file for backward compat)
          technical_sketch_url: uploadedSketchUrls[0] || null,
          inspiration_url: uploadedInspirationUrls[0] || null,
          // Full arrays as JSON
          sketch_urls: uploadedSketchUrls.length > 0 ? JSON.stringify(uploadedSketchUrls) : null,
          inspiration_urls: uploadedInspirationUrls.length > 0 ? JSON.stringify(uploadedInspirationUrls) : null,
        }),
      });

      // Phase 1: generate front view (creative mode — no front ref yet)
      const frontUrl = await apiGenerateGhost(newDesignPrompt, 'front', uploadedSketchUrls, uploadedInspirationUrls);
      await apiPatchDesign(designId, { front_render_url: frontUrl, render_url: frontUrl, status: 'rendered' });
      await apiAddVersion(designId, newDesignPrompt, frontUrl, 'ghost', 'front');

      setIsCreating(false);
      resetCreationForm();
      await fetchDesigns();

      // Phase 2: generate back/side/closeup using the approved front render as anchor
      generateRemainingGhostViews(designId, newDesignPrompt, uploadedSketchUrls, uploadedInspirationUrls, frontUrl);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateRemainingGhostViews = async (
    designId: string,
    prompt: string,
    sketchUrls: string[] = [],
    inspirationUrls: string[] = [],
    frontRenderUrl?: string  // anchor for design consistency
  ) => {
    for (const view of ['back', 'side', 'closeup'] as ViewType[]) {
      try {
        const url = await apiGenerateGhost(prompt, view, sketchUrls, inspirationUrls, frontRenderUrl);
        await apiPatchDesign(designId, { [`${view}_render_url`]: url } as any);
        await apiAddVersion(designId, prompt, url, 'ghost', view);
        await fetchDesigns();
      } catch (e) { console.error(`Error generating ghost ${view}:`, e); }
    }
  };

  // ── Generate ghost view on demand ─────────────────────────────────────────────
  const handleGenerateGhostView = async (view: ViewType) => {
    if (!selectedDesign || generatingView) return;
    setGeneratingView(view);
    setPreviewVersion(null);
    setErrorMsg(null);
    try {
      const skUrls = getSketchUrls(selectedDesign);
      const insUrls = getInspirationUrls(selectedDesign);
      // For non-front views, use the existing front render as anchor (Phase 2)
      const frontAnchor = view !== 'front' ? selectedDesign.front_render_url : undefined;
      const url = await apiGenerateGhost(selectedDesign.prompt || '', view, skUrls, insUrls, frontAnchor);
      await apiPatchDesign(selectedDesign.id, { [`${view}_render_url`]: url } as any);
      await apiAddVersion(selectedDesign.id, selectedDesign.prompt || '', url, 'ghost', view);
      await fetchDesigns();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setGeneratingView(null);
    }
  };

  // ── Generate model view on demand (per view + per environment) ────────────────
  const handleGenerateModelView = async (view: ViewType, env: 'studio' | 'outdoor' = modelEnvironment) => {
    if (!selectedDesign || isGeneratingModel) return;
    setIsGeneratingModel(true);
    setGeneratingView(view);
    setPreviewVersion(null);
    setErrorMsg(null);

    try {
      const selectedModel = models.find(m => m.id === selectedDesign.model_id);

      // Ghost render for this view (garment reference)
      const ghostByView: Record<ViewType, string | undefined> = {
        front: selectedDesign.front_render_url,
        back: selectedDesign.back_render_url,
        side: selectedDesign.side_render_url,
        closeup: selectedDesign.closeup_render_url,
      };
      const ghostRef = ghostByView[view] || selectedDesign.front_render_url;

      // Identity anchor = model's actual PHOTO (preview_url), NOT a previous render.
      // This is the primary reference for preserving face/body identity.
      const identityAnchor = selectedModel?.preview_url;

      const url = await apiGenerateModel(
        selectedDesign.prompt || '',
        selectedModel?.name || 'modelo profesional',
        ghostRef,
        identityAnchor,
        env,
        view,
        selectedDesign.category
      );

      // Save to correct column based on env × view
      const colKey = env === 'outdoor'
        ? `outdoor_model_${view}_render_url`
        : `model_${view}_render_url`;

      const patch: Partial<Design> = {
        [colKey]: url,
        view_mode: 'model',
      };
      // Keep legacy model_render_url in sync for studio front
      if (env === 'studio' && view === 'front') patch.model_render_url = url;

      await apiPatchDesign(selectedDesign.id, patch);
      await apiAddVersion(selectedDesign.id, selectedDesign.prompt || '', url, 'model', view);
      await fetchDesigns();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsGeneratingModel(false);
      setGeneratingView(null);
    }
  };

  // ── Switch ghost ↔ model view mode ────────────────────────────────────────────
  const handleSwitchViewMode = async (mode: 'ghost' | 'model') => {
    if (!selectedDesign) return;
    setPreviewVersion(null);
    if (mode === 'model') {
      if (!hasAnyModelRender(selectedDesign)) {
        // First time: generate studio front render
        await handleGenerateModelView('front', 'studio');
      } else {
        await apiPatchDesign(selectedDesign.id, { view_mode: 'model' });
        await fetchDesigns();
      }
    } else {
      await apiPatchDesign(selectedDesign.id, { view_mode: 'ghost' });
      await fetchDesigns();
    }
  };

  // ── Re-synthesize ghost with edited prompt ────────────────────────────────────
  const handleReSynthesize = async () => {
    if (!selectedDesign || !editPrompt.trim()) return;
    setIsEditingPrompt(false);
    setGeneratingView(activeView);
    setPreviewVersion(null);
    setErrorMsg(null);
    try {
      await apiPatchDesign(selectedDesign.id, { prompt: editPrompt });
      const skUrls = getSketchUrls(selectedDesign);
      const insUrls = getInspirationUrls(selectedDesign);
      // Re-synth on front → Phase 1 (creative). Other views → Phase 2 (documentation with front anchor)
      const frontAnchor = activeView !== 'front' ? selectedDesign.front_render_url : undefined;
      const url = await apiGenerateGhost(editPrompt, activeView, skUrls, insUrls, frontAnchor);
      await apiPatchDesign(selectedDesign.id, { [`${activeView}_render_url`]: url } as any);
      await apiAddVersion(selectedDesign.id, editPrompt, url, 'ghost', activeView);
      await fetchDesigns();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setGeneratingView(null);
    }
  };

  // ── Edit a single view with text instructions ─────────────────────────────────
  // Returns the DB column key for the current view/mode/environment
  const getRenderColKey = (view: ViewType, design: Design): string => {
    if (design.view_mode === 'model') {
      if (modelEnvironment === 'outdoor') return `outdoor_model_${view}_render_url`;
      return `model_${view}_render_url`;
    }
    return `${view}_render_url`;
  };

  const handleEditView = async () => {
    if (!selectedDesign || !editingView || !viewEditInstructions.trim()) return;
    const baseUrl = getRenderUrl(selectedDesign, editingView);
    if (!baseUrl) { setErrorMsg('No hay imagen para editar en esta vista.'); return; }

    setIsEditingView(true);
    setErrorMsg(null);
    try {
      // Save original to history before editing
      await apiAddVersion(selectedDesign.id, `Pre-edición (${editingView})`, baseUrl, 'ghost', editingView);

      const url = await apiGenerateEditView(baseUrl, viewEditInstructions, selectedDesign.prompt || '', editingView);
      await apiAddVersion(selectedDesign.id, `Edición: ${viewEditInstructions}`, url, 'edit', editingView);

      // Persist the edited image as the new main render for this view
      const colKey = getRenderColKey(editingView, selectedDesign);
      await apiPatchDesign(selectedDesign.id, { [colKey]: url } as any);
      await fetchDesigns();       // auto-updates selectedDesign with new URL
      await fetchVersions(selectedDesign.id);

      setShowVersionHistory(true);
      setEditingView(null);
      setViewEditInstructions('');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsEditingView(false);
    }
  };

  // Promote any version from history to become the current main render
  const handleSetVersionAsMain = async (v: DesignVersion) => {
    if (!selectedDesign || !v.image_url) return;
    try {
      const colKey = getRenderColKey((v.view || 'front') as ViewType, selectedDesign);
      await apiPatchDesign(selectedDesign.id, { [colKey]: v.image_url } as any);
      await fetchDesigns();
      setPreviewVersion(null);
      setActiveView((v.view || 'front') as ViewType);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // ── Generate material/color variant (single or multi-view) ────────────────────
  const handleGenerateVariant = async () => {
    if (!selectedDesign || !selectedFabric) return;
    const views = Array.from(variantViewSelections) as ViewType[];
    if (views.length === 0) return;

    setIsGeneratingVariant(true);
    setVariantProgress({ current: 0, total: views.length });
    setPreviewVersion(null);
    setErrorMsg(null);

    let lastUrl = '';
    let lastView: ViewType = 'front';

    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      setVariantProgress({ current: i + 1, total: views.length });
      const baseUrl = getRenderUrl(selectedDesign, view);
      if (!baseUrl) continue;
      try {
        // Save original to history before modifying
        await apiAddVersion(selectedDesign.id, `Pre-variante: ${selectedFabric.name} (${view})`, baseUrl, 'ghost', view);
        const url = await apiGenerateVariant(baseUrl, selectedDesign.prompt || '', selectedFabric);
        await apiAddVersion(selectedDesign.id, `Variante: ${selectedFabric.name} (${selectedFabric.color})`, url, 'variant', view);
        lastUrl = url;
        lastView = view;
      } catch (e) { console.error(`Error generating variant for ${view}:`, e); }
    }

    await fetchVersions(selectedDesign.id);
    setVariantProgress(null);

    if (lastUrl) {
      setPreviewVersion({
        id: 'preview',
        design_id: selectedDesign.id,
        version_number: 0,
        prompt: `Variante: ${selectedFabric.name}`,
        image_url: lastUrl,
        type: 'variant',
        view: lastView,
        created_at: new Date().toISOString(),
      } as DesignVersion);
      setActiveView(lastView);
      setShowVersionHistory(true);
    }

    setIsGeneratingVariant(false);
  };

  // ── Fabric management ─────────────────────────────────────────────────────────
  const handleUploadFabric = async () => {
    if (!newFabricName.trim()) { alert('Ingrese un nombre para el material.'); return; }
    setIsUploadingFabric(true);
    try {
      const formData = new FormData();
      formData.append('id', `f_${Date.now()}`);
      formData.append('name', newFabricName.trim());
      formData.append('material', newFabricMaterial.trim());
      formData.append('color', newFabricColor);
      formData.append('elasticity', newFabricElasticity.toString());
      formData.append('finish', newFabricFinish);
      if (newFabricFile) formData.append('file', newFabricFile);

      const res = await fetch('/api/fabrics', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear material.');

      await fetchFabrics();
      resetFabricForm();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsUploadingFabric(false);
    }
  };

  const handleDeleteFabric = async (fabricId: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar este material? No se puede deshacer.')) return;
    try {
      const res = await fetch(`/api/fabrics/${fabricId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar.');
      if (selectedFabric?.id === fabricId) setSelectedFabric(fabrics.find(f => f.id !== fabricId) || null);
      await fetchFabrics();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const resetFabricForm = () => {
    setNewFabricName('');
    setNewFabricMaterial('');
    setNewFabricColor('#1a1a1a');
    setNewFabricElasticity(0.5);
    setNewFabricFinish('mate');
    setNewFabricFile(null);
    setNewFabricFileName('');
  };

  // ── Catalog Builder ───────────────────────────────────────────────────────────
  const handleGenerateCatalog = () => {
    setCatalogSelectedIds(new Set());
    setCatalogImageSelections({});
    setCatalogStep(1);
    setIsCatalogBuilderOpen(true);
  };

  const openCatalog = async (format: 'html' | 'pdf') => {
    const selected = (Array.from(catalogSelectedIds) as string[])
      .map(id => designs.find(d => d.id === id))
      .filter(Boolean) as Design[];
    if (selected.length === 0) return;

    setIsGeneratingCatalog(true);
    let enriched: Record<string, EnrichedDesignContent> = {};
    try {
      // Phase 1 — AI editorial enrichment
      setCatalogStatusText('Generando contenido editorial...');
      try {
        const enrichRes = await fetch('/api/ai/enrich-catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            designs: selected.map(d => ({
              id: d.id,
              name: d.name,
              category: d.category,
              prompt: d.prompt,
            })),
          }),
        });
        if (enrichRes.ok) {
          const data = await enrichRes.json();
          enriched = data.enriched || {};
        }
      } catch {
        // Enrichment failed silently — catalog still builds with raw prompts
      }

      // Phase 2 — Build catalog HTML
      setCatalogStatusText('Construyendo catálogo...');
      let selections = catalogImageSelections;

      if (format === 'html') {
        const b64Sels: Record<string, string[]> = {};
        for (const d of selected) {
          const urls = catalogImageSelections[d.id] || [];
          b64Sels[d.id] = await Promise.all(urls.map(u => imageToDataUrl(u)));
        }
        selections = b64Sels;
      }

      const html = generateCatalogHTML(selected, selections, catalogTitle, catalogSeason, enriched);

      if (format === 'pdf') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.addEventListener('load', () => setTimeout(() => win.print(), 800));
        }
      } else {
        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `catalogo-vexia-${catalogTitle.toLowerCase().replace(/\s+/g, '-')}.html`;
        a.click();
        URL.revokeObjectURL(a.href);
      }

      setIsCatalogBuilderOpen(false);
    } finally {
      setIsGeneratingCatalog(false);
      setCatalogStatusText('');
    }
  };

  // ── Download & delete ─────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!currentRenderUrl) return;
    const a = document.createElement('a');
    a.href = currentRenderUrl;
    a.download = `${selectedDesign?.name || 'render'}_${activeView}.jpg`;
    a.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, type: 'sketch' | 'inspiration' | 'model') => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files: File[] = Array.from(fileList);
    // Reset input so the same file can be selected again
    e.target.value = '';
    if (type === 'sketch') {
      setSketchFiles(prev => [...prev, ...files]);
      setSketchPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    } else if (type === 'inspiration') {
      setInspirationFiles(prev => [...prev, ...files]);
      setInspirationPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    } else if (type === 'model') handleUploadModel(files[0]);
  };

  const handleUploadModel = async (file: File) => {
    try {
      // Upload file to server first → get a permanent /uploads/ URL
      const uploadedUrl = await apiUploadFile(file);
      const modelId = `m_${Math.random().toString(36).substr(2, 5)}`;
      const modelName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: modelId, name: modelName, preview_url: uploadedUrl }),
      });
      await fetchModels();
      setSelectedModelId(modelId);
    } catch (e) { console.error('uploadModel', e); }
  };

  const handleDeleteModel = async (modelId: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta modelo? No se puede deshacer.')) return;
    try {
      await fetch(`/api/models/${modelId}`, { method: 'DELETE' });
      if (selectedModelId === modelId) setSelectedModelId(null);
      await fetchModels();
    } catch (err: any) { alert('No se pudo eliminar: ' + err.message); }
  };

  const handleRenameDesign = async () => {
    if (!selectedDesign || !editingName.trim()) return;
    await apiPatchDesign(selectedDesign.id, { name: editingName.trim() } as any);
    setIsEditingName(false);
    await fetchDesigns();
  };

  const handleChangeDesignModel = async (modelId: string) => {
    if (!selectedDesign || selectedDesign.model_id === modelId) return;
    await apiPatchDesign(selectedDesign.id, { model_id: modelId } as any);
    await fetchDesigns();
  };

  const handleChangeDesignCategory = async (category: Category) => {
    if (!selectedDesign || selectedDesign.category === category) { setIsEditingCategory(false); return; }
    await apiPatchDesign(selectedDesign.id, { category } as any);
    setIsEditingCategory(false);
    await fetchDesigns();
  };

  const handleDeleteDesign = async (design: Design, e?: MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(`¿Eliminar "${design.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/designs/${design.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      if (selectedDesign?.id === design.id) setSelectedDesign(null);
      await fetchDesigns();
    } catch (err: any) { alert('No se pudo eliminar: ' + err.message); }
  };

  const resetCreationForm = () => {
    setNewDesignName('');
    setNewDesignPrompt('');
    setNewDesignCategory('Core');
    setSketchFiles([]);
    setSketchPreviews([]);
    setInspirationFiles([]);
    setInspirationPreviews([]);
  };

  const filteredDesigns = activeCategory === 'All'
    ? designs
    : designs.filter(d => d.category === activeCategory);

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-[#F2F2F2] font-sans overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="h-16 border-b border-border-main flex items-center justify-between px-8 bg-bg-secondary flex-shrink-0 z-50">
        <div className="flex items-center gap-4">
          {/* Vexia Logo Mark */}
          <div className="flex items-center gap-1">
            <div className="w-8 h-8 bg-brand rounded-sm flex items-center justify-center shadow-[0_0_15px_rgba(229,102,45,0.35)]">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <rect x="2" y="2" width="20" height="20" rx="4" stroke="white" strokeWidth="1.5"/>
                <path d="M7 15h10M7 18h6M12 7l3 8H9l3-8z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className="h-6 w-px bg-border-secondary" />
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-bold tracking-[0.12em] uppercase text-text-main">ALMEJA</h1>
            <span className="text-text-dim text-[10px] tracking-[0.1em] uppercase">Studio · Vexia</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex gap-2">
            <span className="px-3 py-1 bg-bg-accent border border-border-secondary rounded-full text-[9px] uppercase tracking-widest text-text-muted">Gemini 2.0</span>
            <span className="px-3 py-1 bg-bg-accent border border-border-secondary rounded-full text-[9px] uppercase tracking-widest text-brand">Imagen 3 Activo</span>
          </div>
          <button
            onClick={handleGenerateCatalog}
            className="hidden md:flex items-center gap-2 border border-border-secondary text-text-dim px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-tighter hover:border-brand hover:text-brand transition-all cursor-pointer"
          >
            <BookOpen size={12} />
            Catálogo
          </button>
          <button
            onClick={() => setFabricModalOpen(true)}
            className="hidden md:flex items-center gap-2 border border-border-secondary text-text-dim px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-tighter hover:border-brand hover:text-brand transition-all cursor-pointer"
          >
            <Gem size={12} />
            Materiales
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-brand text-black px-4 md:px-6 py-2 rounded-full text-xs font-bold uppercase tracking-tighter hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg shadow-brand/10"
          >
            <span className="hidden md:inline">Nueva Referencia</span>
            <Plus size={16} className="md:hidden" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <motion.aside
          initial={false}
          animate={{ width: isSidebarOpen ? 240 : 80 }}
          className="border-r border-border-main hidden md:flex flex-col bg-[#0D0D0D] flex-shrink-0"
        >
          <div className="p-6 flex flex-col h-full overflow-hidden">
            <div className="mb-8">
              <h2 className="text-[10px] uppercase text-text-muted tracking-[0.2em] mb-4 whitespace-nowrap overflow-hidden">Colecciones</h2>
              <ul className="space-y-4">
                <li
                  onClick={() => setActiveCategory('All')}
                  className={cn("text-sm flex items-center justify-between group cursor-pointer transition-colors",
                    activeCategory === 'All' ? "text-brand" : "text-text-dim hover:text-white")}
                >
                  <span className="flex items-center gap-3">
                    <LayoutDashboard size={14} />
                    {isSidebarOpen && "Todos los Diseños"}
                  </span>
                  {isSidebarOpen && (
                    <span className={cn("text-[9px] px-1.5", activeCategory === 'All' ? "bg-border-secondary" : "bg-bg-accent")}>
                      {designs.length}
                    </span>
                  )}
                </li>
                {CATEGORIES.map(cat => (
                  <li
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn("text-sm flex items-center justify-between group cursor-pointer transition-colors",
                      activeCategory === cat ? "text-brand" : "text-text-dim hover:text-white")}
                  >
                    <span className="flex items-center gap-3">
                      <Layers size={14} />
                      {isSidebarOpen && cat}
                    </span>
                    {isSidebarOpen && (
                      <span className={cn("text-[9px] px-1.5 transition-colors",
                        activeCategory === cat ? "bg-bg-secondary text-brand" : "bg-bg-accent text-text-muted")}>
                        {designs.filter(d => d.category === cat).length.toString().padStart(2, '0')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-auto space-y-6 pt-6 border-t border-border-main">
              <div className="space-y-3">
                <h2 className="text-[10px] uppercase text-text-muted tracking-[0.2em] mb-2 whitespace-nowrap overflow-hidden">Sistema</h2>
                <button
                  onClick={() => setFabricModalOpen(true)}
                  className="flex items-center gap-3 text-text-dim hover:text-white transition-colors w-full group"
                >
                  <Gem size={14} />
                  {isSidebarOpen && <span className="text-xs font-medium">Biblioteca de Materiales</span>}
                </button>
                <button
                  onClick={handleGenerateCatalog}
                  className="flex items-center gap-3 text-text-dim hover:text-brand transition-colors w-full group"
                >
                  <BookOpen size={14} />
                  {isSidebarOpen && <span className="text-xs font-medium">Generar Catálogo</span>}
                </button>
                <button className="flex items-center gap-3 text-text-dim hover:text-white transition-colors w-full group">
                  <Users size={14} />
                  {isSidebarOpen && <span className="text-xs font-medium">Diseñadores</span>}
                </button>
                <button className="flex items-center gap-3 text-text-dim hover:text-white transition-colors w-full group">
                  <Settings size={14} />
                  {isSidebarOpen && <span className="text-xs font-medium">Motor de IA</span>}
                </button>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="mt-6 self-end p-2 text-text-muted hover:text-white transition-colors">
              {isSidebarOpen ? <X size={14} /> : <Menu size={14} />}
            </button>
          </div>
        </motion.aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main className="flex-1 bg-[#111] relative flex flex-col overflow-hidden pb-14 md:pb-0">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="mb-10">
              <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2 italic">Vista Actual</p>
              <h2 className="text-4xl font-serif italic text-white tracking-tight">{activeCategory === 'All' ? 'Resumen del Sistema' : activeCategory}</h2>
            </div>

            {filteredDesigns.length === 0 ? (
              <div className="w-full h-96 flex flex-col items-center justify-center border border-dashed border-border-secondary rounded-2xl bg-bg-secondary/50">
                <Shirt className="text-border-secondary w-12 h-12 mb-4" />
                <p className="text-text-dim font-serif italic text-lg">El inventario está vacío</p>
                <button onClick={() => setIsCreating(true)} className="mt-4 text-brand text-[10px] uppercase tracking-widest font-bold hover:underline">
                  Publicar Primera Referencia
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {filteredDesigns.map((design) => (
                  <motion.div
                    key={design.id}
                    layoutId={design.id}
                    onClick={() => setSelectedDesign(design)}
                    className="group relative bg-bg-secondary border border-border-main hover:border-brand/30 transition-all duration-500 cursor-pointer overflow-hidden rounded-sm"
                  >
                    <div className="aspect-[4/5] relative bg-bg-main overflow-hidden">
                      {design.front_render_url || design.render_url ? (
                        <img
                          src={design.front_render_url || design.render_url}
                          className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
                          alt={design.name}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-8 opacity-20">
                          <Cpu size={40} className="mb-4 text-brand animate-pulse" />
                          <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-center">Generando...</span>
                        </div>
                      )}
                      <div className="absolute top-4 left-4">
                        <span className="px-2 py-0.5 bg-black/80 backdrop-blur border border-border-secondary rounded-sm text-[8px] font-bold uppercase tracking-widest">
                          {design.status}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                        <p className="text-[10px] text-brand uppercase font-bold tracking-widest mb-2">Ver Cuatricromía Técnica</p>
                      </div>
                    </div>
                    <div className="p-6 border-t border-border-main flex justify-between items-center group-hover:bg-bg-accent transition-colors">
                      <div>
                        <h4 className="font-serif italic text-xl text-white mb-1">{design.name}</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-text-muted uppercase tracking-widest font-bold">{design.category}</span>
                          <div className="w-1 h-1 bg-brand rounded-full"></div>
                          <span className="text-[8px] text-brand/60 uppercase font-black">
                            {[design.front_render_url, design.back_render_url, design.side_render_url, design.closeup_render_url].filter(Boolean).length} Vistas Ghost
                          </span>
                          {hasAnyModelRender(design) && (
                            <>
                              <div className="w-1 h-1 bg-brand rounded-full"></div>
                              <span className="text-[8px] text-brand uppercase font-black">Modelo ✓</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteDesign(design, e)}
                        className="p-2 text-text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Eliminar diseño"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <footer className="h-8 border-t border-border-main bg-bg-main flex items-center px-8 justify-between flex-shrink-0 z-40">
            <div className="flex gap-6 text-[9px] text-text-muted uppercase tracking-[0.15em]">
              <span className="flex items-center gap-1.5"><div className="w-1 h-1 bg-brand rounded-full animate-pulse"></div> Gemini API: Conectado</span>
              <span>Cola: {generatingView || isGeneratingModel || isGeneratingVariant ? 'Procesando...' : 'Óptima'}</span>
            </div>
            <div className="text-[9px] text-[#333] font-mono italic">© ALMEJA STUDIO // NUCLEO_IA_V3.0</div>
          </footer>
        </main>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Fabric Library Modal ─────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isFabricModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-bg-main/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-[#0D0D0D] border border-border-secondary shadow-[0_0_100px_rgba(0,0,0,0.5)] w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-lg flex flex-col"
            >
              <div className="p-8 border-b border-border-main flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-[10px] uppercase text-brand tracking-[0.4em] font-black mb-1">Sistema de Materiales</h2>
                  <h3 className="text-2xl font-serif italic text-white">Biblioteca de Tejidos</h3>
                </div>
                <button onClick={() => { setFabricModalOpen(false); resetFabricForm(); }} className="p-2 text-text-muted hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Fabric list */}
                <div className="w-1/2 border-r border-border-main overflow-y-auto custom-scrollbar p-6 space-y-3">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-text-muted mb-4">Tejidos Registrados ({fabrics.length})</p>
                  {fabrics.map(fabric => (
                    <div
                      key={fabric.id}
                      onClick={() => setSelectedFabric(fabric)}
                      className={cn(
                        "p-4 border cursor-pointer group transition-all flex items-center gap-4",
                        selectedFabric?.id === fabric.id
                          ? "border-brand bg-bg-accent"
                          : "border-border-main hover:border-text-muted bg-bg-main"
                      )}
                    >
                      <div className="w-10 h-10 flex-shrink-0 rounded-full border-2 border-border-secondary shadow-inner" style={{ backgroundColor: fabric.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-white truncate">{fabric.name}</p>
                          {fabric.is_custom ? (
                            <span className="text-[7px] px-1.5 py-0.5 bg-brand/20 text-brand border border-brand/30 uppercase tracking-wide flex-shrink-0">Custom</span>
                          ) : null}
                        </div>
                        <p className="text-[9px] text-text-muted truncate">{fabric.material} · {fabric.finish} · {Math.round(fabric.elasticity * 100)}% elast.</p>
                        {fabric.file_url && (
                          <div className="flex items-center gap-1 mt-1">
                            <FileImage size={8} className="text-brand/60" />
                            <span className="text-[7px] text-brand/60">Archivo adjunto</span>
                          </div>
                        )}
                      </div>
                      {fabric.is_custom ? (
                        <button
                          onClick={(e) => handleDeleteFabric(fabric.id, e)}
                          className="p-1.5 text-text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          title="Eliminar material"
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : (
                        <div className="w-6 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Add new fabric form */}
                <div className="w-1/2 p-6 overflow-y-auto custom-scrollbar">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-text-muted mb-6">Añadir Nuevo Material</p>
                  <div className="space-y-5">
                    <div>
                      <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic block mb-2">Nombre del Material *</label>
                      <input
                        type="text"
                        value={newFabricName}
                        onChange={e => setNewFabricName(e.target.value)}
                        placeholder="Ej: Lycra Performance Plus"
                        className="w-full bg-bg-main border border-border-main focus:border-brand p-3 text-xs outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic block mb-2">Composición</label>
                      <input
                        type="text"
                        value={newFabricMaterial}
                        onChange={e => setNewFabricMaterial(e.target.value)}
                        placeholder="Ej: 80% Poliamida / 20% Elastano"
                        className="w-full bg-bg-main border border-border-main focus:border-brand p-3 text-xs outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic block mb-2 flex items-center gap-1">
                          <Palette size={8} /> Color
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={newFabricColor}
                            onChange={e => setNewFabricColor(e.target.value)}
                            className="w-10 h-10 bg-transparent border border-border-main cursor-pointer"
                          />
                          <input
                            type="text"
                            value={newFabricColor}
                            onChange={e => setNewFabricColor(e.target.value)}
                            className="flex-1 bg-bg-main border border-border-main focus:border-brand p-2 text-xs outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic block mb-2">Acabado</label>
                        <select
                          value={newFabricFinish}
                          onChange={e => setNewFabricFinish(e.target.value as Fabric['finish'])}
                          className="w-full bg-bg-main border border-border-main focus:border-brand p-3 text-xs outline-none appearance-none uppercase"
                        >
                          <option value="mate">Mate</option>
                          <option value="brillante">Brillante</option>
                          <option value="satinado">Satinado</option>
                          <option value="texturizado">Texturizado</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic block mb-2">
                        Elasticidad: {Math.round(newFabricElasticity * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0" max="1" step="0.05"
                        value={newFabricElasticity}
                        onChange={e => setNewFabricElasticity(parseFloat(e.target.value))}
                        className="w-full accent-brand"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic block mb-2">
                        Archivo de Referencia (imagen o PDF)
                      </label>
                      <input
                        type="file"
                        ref={fabricFileInputRef}
                        className="hidden"
                        accept="image/*,.pdf"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) { setNewFabricFile(file); setNewFabricFileName(file.name); }
                        }}
                      />
                      <button
                        onClick={() => fabricFileInputRef.current?.click()}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 p-4 border text-xs transition-all",
                          newFabricFile ? "border-brand text-brand" : "border-border-main text-text-muted hover:border-brand/40"
                        )}
                      >
                        {newFabricFile ? (
                          <><CheckCircle2 size={12} className="text-brand" /> {newFabricFileName}</>
                        ) : (
                          <><Upload size={12} /> Cargar imagen / PDF de muestra</>
                        )}
                      </button>
                    </div>
                    <button
                      onClick={handleUploadFabric}
                      disabled={isUploadingFabric || !newFabricName.trim()}
                      className={cn(
                        "w-full py-4 text-[10px] uppercase tracking-widest font-black transition-all flex items-center justify-center gap-2",
                        isUploadingFabric || !newFabricName.trim()
                          ? "bg-bg-accent text-text-muted cursor-not-allowed"
                          : "bg-brand text-black hover:bg-white"
                      )}
                    >
                      {isUploadingFabric ? <><Cpu size={12} className="animate-spin" /> Guardando...</> : <><Plus size={12} /> Registrar Material</>}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Creation Modal ───────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-bg-main/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-[#0D0D0D] border border-border-secondary shadow-[0_0_100px_rgba(0,0,0,0.5)] w-full max-w-xl overflow-hidden rounded-lg"
            >
              <div className="p-10">
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <h2 className="text-[10px] uppercase text-brand tracking-[0.4em] font-black mb-2">Iniciación de Referencia</h2>
                    <h3 className="text-4xl font-serif italic text-white tracking-tight">Entrada de Datos Técnicos</h3>
                  </div>
                  <button onClick={() => { setIsCreating(false); resetCreationForm(); }} className="p-2 text-text-muted hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>

                {errorMsg && (
                  <div className="mb-6 space-y-3">
                    <div className="flex items-start gap-3 p-4 bg-red-950/30 border border-red-800/50 rounded">
                      <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-red-300 text-xs leading-relaxed">{errorMsg}</p>
                        {(errorMsg.toLowerCase().includes('fetch') || errorMsg.toLowerCase().includes('connect') || errorMsg.toLowerCase().includes('api')) && (
                          <p className="text-red-400/60 text-[10px] mt-2 leading-relaxed">
                            Puede ser un problema de conectividad con la API de Gemini. Verifica que el servidor esté corriendo con <code className="bg-red-950/50 px-1 rounded">npm run dev</code> y que tienes acceso a internet.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleTestAI}
                        disabled={aiTestStatus === 'loading'}
                        className="text-[9px] uppercase tracking-widest font-bold px-3 py-2 border border-border-secondary text-text-dim hover:text-white hover:border-brand/50 transition-all disabled:opacity-40"
                      >
                        {aiTestStatus === 'loading' ? 'Probando...' : 'Probar conexión IA'}
                      </button>
                      {aiTestStatus !== 'idle' && aiTestStatus !== 'loading' && (
                        <span className={`text-[10px] ${aiTestStatus === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                          {aiTestStatus === 'ok' ? '✓' : '✗'} {aiTestMsg}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-7">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic">Identificación</label>
                      <input
                        type="text"
                        value={newDesignName}
                        onChange={(e) => setNewDesignName(e.target.value)}
                        placeholder="Ref: SS25-OP-01"
                        className="w-full bg-bg-main border border-border-main focus:border-brand p-4 text-xs tracking-wider outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic">Clasificación</label>
                      <select
                        value={newDesignCategory}
                        onChange={(e) => setNewDesignCategory(e.target.value as Category)}
                        className="w-full bg-bg-main border border-border-main focus:border-brand p-4 text-xs tracking-wider outline-none transition-all appearance-none uppercase"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic flex items-center justify-between">
                      Mapeo de Identidad
                      <button onClick={() => modelInputRef.current?.click()} className="text-brand hover:underline">
                        + Nueva Modelo
                      </button>
                    </label>
                    <input type="file" ref={modelInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'model')} accept="image/*" />
                    <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                      {models.map(m => (
                        <div key={m.id} className={cn("flex-shrink-0 relative group/model", selectedModelId === m.id ? "opacity-100" : "opacity-40 grayscale")}>
                          <button onClick={() => setSelectedModelId(m.id)}>
                            <div className={cn("w-12 h-12 rounded-full border-2 p-0.5 transition-all", selectedModelId === m.id ? "border-brand" : "border-border-secondary")}>
                              {m.preview_url && !m.preview_url.startsWith('blob:') ? (
                                <img
                                  src={m.preview_url}
                                  className="w-full h-full object-cover rounded-full"
                                  alt={m.name}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                                />
                              ) : null}
                              <div className={cn("w-full h-full rounded-full bg-bg-accent flex items-center justify-center", m.preview_url && !m.preview_url.startsWith('blob:') ? 'hidden' : '')}>
                                <Users size={16} className="text-text-muted" />
                              </div>
                            </div>
                          </button>
                          <p className="text-[7px] text-text-muted text-center mt-1 w-12 truncate">{m.name.split(/[\s—]/)[0]}</p>
                          {selectedModelId === m.id && (
                            <div className="absolute -top-1 -right-1 bg-brand text-black rounded-full p-0.5">
                              <CheckCircle2 size={8} />
                            </div>
                          )}
                          <button
                            onClick={(e) => handleDeleteModel(m.id, e)}
                            className="absolute -bottom-4 -right-1 bg-red-900 text-red-300 rounded-full p-0.5 opacity-0 group-hover/model:opacity-100 transition-opacity"
                          >
                            <X size={8} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic flex items-center gap-2">
                      Descripción de la Prenda
                      <Sparkles size={10} className="text-brand" />
                    </label>
                    <textarea
                      value={newDesignPrompt}
                      onChange={(e) => setNewDesignPrompt(e.target.value)}
                      placeholder="Ej: Traje de baño de una pieza, corte alto en cadera, escote en V, tiras cruzadas en la espalda, tejido liso color negro..."
                      rows={4}
                      className="w-full bg-bg-main border border-border-main focus:border-brand p-4 text-xs leading-relaxed outline-none resize-none transition-all"
                    />
                  </div>

                  {/* ── Multi-file references ── */}
                  <input type="file" ref={sketchInputRef} className="hidden" multiple onChange={(e) => handleFileChange(e, 'sketch')} accept="image/*,.pdf,.dxf,.ai,.svg" />
                  <input type="file" ref={inspirationInputRef} className="hidden" multiple onChange={(e) => handleFileChange(e, 'inspiration')} accept="image/*" />

                  <div className="grid grid-cols-2 gap-4">
                    {/* Bocetos / CAD */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic flex items-center gap-1">
                          <Upload size={8} /> Bocetos / CAD
                        </label>
                        <button
                          type="button"
                          onClick={() => sketchInputRef.current?.click()}
                          className="text-[8px] text-brand hover:underline uppercase tracking-wide font-bold"
                        >
                          + Añadir
                        </button>
                      </div>
                      {sketchPreviews.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {sketchPreviews.map((src, i) => (
                            <div key={i} className="relative group/thumb aspect-square border border-border-main overflow-hidden bg-bg-main">
                              <img src={src} className="w-full h-full object-cover" alt="" />
                              <button
                                type="button"
                                onClick={() => {
                                  setSketchFiles(p => p.filter((_, j) => j !== i));
                                  setSketchPreviews(p => p.filter((_, j) => j !== i));
                                }}
                                className="absolute top-0.5 right-0.5 bg-red-900 text-white rounded-full p-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                              >
                                <X size={7} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => sketchInputRef.current?.click()}
                            className="aspect-square border border-dashed border-border-main flex items-center justify-center text-text-muted hover:border-brand hover:text-brand transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => sketchInputRef.current?.click()}
                          className="w-full flex flex-col items-center justify-center p-5 border border-dashed border-border-main bg-bg-secondary hover:border-brand/50 transition-all group"
                        >
                          <Upload size={16} className="text-text-muted group-hover:text-brand mb-1.5" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-text-dim">Boceto / CAD</span>
                          <span className="text-[7px] text-text-muted mt-0.5">PNG, JPG, PDF, AI, SVG</span>
                        </button>
                      )}
                    </div>

                    {/* Inspiración */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] uppercase font-black tracking-widest text-text-dim italic flex items-center gap-1">
                          <Eye size={8} /> Inspiración
                        </label>
                        <button
                          type="button"
                          onClick={() => inspirationInputRef.current?.click()}
                          className="text-[8px] text-brand hover:underline uppercase tracking-wide font-bold"
                        >
                          + Añadir
                        </button>
                      </div>
                      {inspirationPreviews.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {inspirationPreviews.map((src, i) => (
                            <div key={i} className="relative group/thumb aspect-square border border-border-main overflow-hidden bg-bg-main">
                              <img src={src} className="w-full h-full object-cover" alt="" />
                              <button
                                type="button"
                                onClick={() => {
                                  setInspirationFiles(p => p.filter((_, j) => j !== i));
                                  setInspirationPreviews(p => p.filter((_, j) => j !== i));
                                }}
                                className="absolute top-0.5 right-0.5 bg-red-900 text-white rounded-full p-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                              >
                                <X size={7} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => inspirationInputRef.current?.click()}
                            className="aspect-square border border-dashed border-border-main flex items-center justify-center text-text-muted hover:border-brand hover:text-brand transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => inspirationInputRef.current?.click()}
                          className="w-full flex flex-col items-center justify-center p-5 border border-dashed border-border-main bg-bg-secondary hover:border-brand/50 transition-all group"
                        >
                          <Eye size={16} className="text-text-muted group-hover:text-brand mb-1.5" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-text-dim">Imágenes</span>
                          <span className="text-[7px] text-text-muted mt-0.5">Múltiples referencias</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 mt-10">
                  <button
                    onClick={() => { setIsCreating(false); resetCreationForm(); }}
                    className="flex-1 px-8 py-4 border border-border-main text-text-dim text-xs uppercase tracking-widest font-bold hover:text-white transition-all"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={handleCreateDesign}
                    disabled={isProcessing}
                    className={cn("flex-1 px-8 py-4 bg-brand text-black text-xs uppercase tracking-widest font-black transition-all flex items-center justify-center gap-2",
                      isProcessing ? "opacity-50 cursor-wait" : "hover:bg-white")}
                  >
                    {isProcessing ? <><Cpu size={14} className="animate-spin" /> Generando render...</> : "Ejecutar Construcción"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Detail Panel ─────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedDesign && (
          <div className="fixed inset-0 z-[110] flex bg-[#0A0A0A]">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full bg-bg-main h-full shadow-2xl flex flex-col md:flex-row relative"
            >
              {/* Close button — top-left inside panel on desktop */}
              <button
                onClick={() => { setSelectedDesign(null); setErrorMsg(null); setPreviewVersion(null); }}
                className="hidden md:block absolute left-4 top-4 p-2 bg-bg-secondary/80 backdrop-blur border border-border-main text-text-muted hover:text-red-500 rounded-sm transition-all z-[120]"
              >
                <X size={16} />
              </button>

              {/* ── Viewport ──────────────────────────────────────────────── */}
              <div className="flex-1 min-h-[50vh] md:min-h-0 md:h-full flex border-b border-border-main md:border-b-0 md:border-r md:border-border-main">

                {/* Ghost reference strip — visible only in model mode on desktop */}
                {selectedDesign.view_mode === 'model' && (
                  <div className="hidden md:flex flex-col w-44 flex-shrink-0 border-r border-white/5 bg-[#080808]">
                    <div className="px-3 py-2 border-b border-white/5 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand/40" />
                      <span className="text-[7px] text-text-muted/40 uppercase tracking-widest">Ghost · {VIEW_LABELS[activeView]}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
                      {(() => {
                        const gUrl: Record<ViewType, string | undefined> = {
                          front: selectedDesign.front_render_url,
                          back: selectedDesign.back_render_url,
                          side: selectedDesign.side_render_url,
                          closeup: selectedDesign.closeup_render_url,
                        };
                        return gUrl[activeView]
                          ? <img src={gUrl[activeView]} className="max-w-full max-h-full object-contain opacity-80" alt="Ghost reference" />
                          : <p className="text-[8px] text-text-muted/20 text-center leading-relaxed px-2">Sin ghost render para esta vista</p>;
                      })()}
                    </div>
                    <div className="px-3 py-2 border-t border-white/5">
                      <p className="text-[6px] text-text-muted/20 uppercase tracking-widest">Referencia</p>
                    </div>
                  </div>
                )}

                {/* Main render area */}
                <div className="flex-1 bg-[#0F0F0F] relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1A1A1A_0%,#0A0A0A_100%)] opacity-50" />

                {errorMsg && (
                  <div className="absolute top-4 left-4 right-4 z-30 flex items-start gap-3 p-4 bg-red-950/80 border border-red-800/50 rounded backdrop-blur">
                    <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-red-300 text-xs leading-relaxed">{errorMsg}</p>
                    <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-white"><X size={12} /></button>
                  </div>
                )}

                {/* Preview version indicator */}
                {previewVersion && (
                  <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-2 bg-brand/10 border border-brand/30 backdrop-blur rounded-sm">
                    <History size={10} className="text-brand" />
                    <span className="text-[9px] text-brand uppercase tracking-widest font-black">
                      {previewVersion.type === 'variant' ? `Variante: ${previewVersion.prompt?.replace('Variante: ', '')}` : `V${previewVersion.version_number}`}
                    </span>
                    <button onClick={() => setPreviewVersion(null)} className="ml-1 text-brand/60 hover:text-brand">
                      <X size={8} />
                    </button>
                  </div>
                )}

                {currentRenderUrl ? (
                  <img
                    src={currentRenderUrl}
                    className="w-full h-full object-contain relative z-10"
                    alt={selectedDesign.name}
                  />
                ) : (
                  <div className="relative z-10 text-center max-w-md p-10">
                    {generatingView === activeView ? (
                      <>
                        <Cpu size={32} className="animate-spin text-brand mx-auto mb-6" />
                        <p className="text-text-muted text-sm italic">
                          Generando vista {VIEW_LABELS[activeView]}
                          {selectedDesign.view_mode === 'model' ? ` — ${modelEnvironment === 'outdoor' ? 'Exterior' : 'Estudio'}` : ''}...
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-24 h-[1px] bg-brand mx-auto mb-8 bg-gradient-to-r from-transparent via-brand to-transparent"></div>
                        <h3 className="text-3xl font-serif italic text-white mb-4 tracking-tight">Vista no generada</h3>
                        <p className="text-text-muted text-sm leading-relaxed mb-8 font-light italic">
                          La vista {VIEW_LABELS[activeView]}
                          {selectedDesign.view_mode === 'model' ? ` (${modelEnvironment === 'outdoor' ? 'Exterior' : 'Estudio'})` : ''} aún no ha sido sintetizada.
                        </p>
                        <button
                          onClick={() => {
                            if (selectedDesign.view_mode === 'model') {
                              handleGenerateModelView(activeView, modelEnvironment);
                            } else {
                              handleGenerateGhostView(activeView);
                            }
                          }}
                          disabled={!!generatingView || isGeneratingModel}
                          className="bg-brand text-black px-10 py-3 text-[10px] uppercase tracking-[0.2em] font-black hover:bg-white transition-all flex items-center justify-center gap-2 mx-auto disabled:opacity-50"
                        >
                          <Sparkles size={12} />
                          Sintetizar Vista {VIEW_LABELS[activeView]}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Generating overlay */}
                {generatingView === activeView && currentRenderUrl && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="text-center">
                      <Cpu size={32} className="animate-spin text-brand mx-auto mb-4" />
                      <p className="text-white text-sm">Regenerando...</p>
                    </div>
                  </div>
                )}

                {/* Mode badge */}
                <div className="absolute top-8 right-8 flex flex-col gap-2 z-20">
                  <span className="text-[8px] bg-brand text-black font-black uppercase tracking-widest px-2 py-1 text-center">
                    {selectedDesign.view_mode === 'model' ? `MODELO — ${modelEnvironment === 'outdoor' ? 'EXTERIOR' : 'ESTUDIO'}` : 'GHOST MANNEQUIN'}
                  </span>
                </div>

                {/* Download + Edit */}
                <div className="absolute bottom-8 right-8 flex gap-3 z-20">
                  <button
                    onClick={() => { setEditingView(activeView); setViewEditInstructions(''); }}
                    disabled={!currentRenderUrl}
                    title={`Editar vista ${VIEW_LABELS[activeView]} con instrucciones`}
                    className="flex items-center gap-2 px-3 py-3 bg-bg-secondary/80 backdrop-blur border border-border-main text-white hover:border-brand hover:text-brand transition-all disabled:opacity-30 text-[9px] uppercase tracking-widest font-bold"
                  >
                    <Pencil size={14} />
                    <span className="hidden md:inline">Editar</span>
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={!currentRenderUrl}
                    title="Descargar render"
                    className="p-4 bg-bg-secondary/80 backdrop-blur border border-border-main text-white hover:border-brand transition-all disabled:opacity-30"
                  >
                    <Download size={18} />
                  </button>
                </div>

                {/* View tabs — ghost always navigates instantly; model shows generate if missing */}
                <div className="absolute bottom-8 left-8 z-20">
                  <div className="flex bg-black/60 backdrop-blur border border-border-secondary p-1 rounded-sm shadow-2xl">
                    {(['front', 'back', 'side', 'closeup'] as ViewType[]).map((v) => {
                      const exists = !!getRenderUrl(selectedDesign, v);
                      const isActive = activeView === v;
                      const isLoading = generatingView === v;
                      return (
                        <button
                          key={v}
                          onClick={() => {
                            setActiveView(v);
                            setPreviewVersion(null);
                            // Ghost mode: auto-generate if missing. Model mode: user clicks generate button.
                            if (selectedDesign.view_mode === 'ghost' && !exists && !generatingView) {
                              handleGenerateGhostView(v);
                            }
                          }}
                          className={cn(
                            "px-4 py-2 text-[9px] uppercase transition-colors border-l border-border-secondary first:border-l-0 flex items-center gap-1.5",
                            isActive ? "bg-brand text-black font-black" : "text-text-muted hover:text-white"
                          )}
                        >
                          {isLoading && <Cpu size={8} className="animate-spin" />}
                          {VIEW_LABELS[v]}
                          {/* Dot: green if generated, grey if not */}
                          <span className={cn("w-1.5 h-1.5 rounded-full inline-block",
                            exists ? "bg-brand/60" : "bg-text-muted/30")} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                </div>{/* end: Main render area */}
              </div>{/* end: Viewport wrapper */}

              {/* ── Controls panel ─────────────────────────────────────────── */}
              <div className="w-full md:w-80 flex-shrink-0 p-8 overflow-y-auto bg-bg-secondary custom-scrollbar">
                {/* Mobile close button */}
                <div className="flex items-center justify-between mb-4 md:hidden">
                  <p className="text-[9px] text-text-dim uppercase tracking-[0.3em] font-black italic">Expediente</p>
                  <button
                    onClick={() => { setSelectedDesign(null); setErrorMsg(null); setPreviewVersion(null); }}
                    className="p-2 text-text-muted hover:text-red-500 transition-colors border border-border-main"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="mb-8">
                  <p className="text-[9px] text-text-dim uppercase tracking-[0.3em] font-black italic mb-3 hidden md:block">Expediente de Proyecto</p>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameDesign(); if (e.key === 'Escape') setIsEditingName(false); }}
                        autoFocus
                        className="flex-1 bg-bg-main border border-brand p-2 text-xl font-serif italic text-white outline-none tracking-tight"
                      />
                      <button onClick={handleRenameDesign} className="p-1.5 text-brand hover:text-white transition-colors" title="Guardar">
                        <CheckCircle2 size={14} />
                      </button>
                      <button onClick={() => setIsEditingName(false)} className="p-1.5 text-text-muted hover:text-white transition-colors" title="Cancelar">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group/name">
                      <h2 className="text-2xl font-serif italic text-white tracking-tight leading-tight">{selectedDesign.name}</h2>
                      <button
                        onClick={() => { setEditingName(selectedDesign.name); setIsEditingName(true); }}
                        className="opacity-0 group-hover/name:opacity-100 transition-opacity p-1 text-text-muted hover:text-brand"
                        title="Renombrar referencia"
                      >
                        <Pencil size={10} />
                      </button>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2 flex-wrap items-center">
                    {isEditingCategory ? (
                      <select
                        autoFocus
                        value={selectedDesign.category}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChangeDesignCategory(e.target.value as Category)}
                        onBlur={() => setIsEditingCategory(false)}
                        className="text-[8px] px-2 py-0.5 bg-bg-main border border-brand text-white uppercase tracking-widest outline-none cursor-pointer"
                      >
                        {CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setIsEditingCategory(true)}
                        className="text-[8px] px-2 py-0.5 border border-border-secondary text-text-muted uppercase tracking-widest hover:border-brand hover:text-brand transition-colors"
                        title="Cambiar colección"
                      >
                        {selectedDesign.category}
                      </button>
                    )}
                    <span className="text-[8px] px-2 py-0.5 border border-brand text-brand uppercase tracking-widest">Ref. Maestra</span>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* ── Edit current view ── */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-3 italic flex items-center gap-2">
                      <Pencil size={9} className="text-brand" /> Editar Vista Actual
                    </h5>
                    {editingView === activeView ? (
                      <div className="space-y-2">
                        <textarea
                          value={viewEditInstructions}
                          onChange={e => setViewEditInstructions(e.target.value)}
                          placeholder="Ej: Cambiar el color del lazo a rojo coral, añadir bordado dorado en el escote..."
                          rows={3}
                          className="w-full bg-bg-main border border-brand p-3 text-xs leading-relaxed outline-none resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleEditView}
                            disabled={isEditingView || !viewEditInstructions.trim()}
                            className="flex-1 bg-brand text-black py-2 text-[9px] uppercase tracking-widest font-black hover:bg-white transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            {isEditingView
                              ? <><Cpu size={10} className="animate-spin" /> Editando...</>
                              : <><Sparkles size={10} /> Aplicar edición</>}
                          </button>
                          <button
                            onClick={() => { setEditingView(null); setViewEditInstructions(''); }}
                            className="px-3 py-2 border border-border-main text-text-muted text-[9px] hover:text-white"
                          >
                            <X size={10} />
                          </button>
                        </div>
                        <p className="text-[7px] text-text-muted leading-relaxed">
                          El original se guarda en el historial automáticamente.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingView(activeView); setViewEditInstructions(''); }}
                        disabled={!currentRenderUrl}
                        className="w-full flex items-center gap-2 py-2.5 px-3 border border-border-main text-text-muted text-[9px] uppercase hover:border-brand/50 hover:text-brand transition-all disabled:opacity-30"
                      >
                        <Pencil size={10} /> Editar vista {VIEW_LABELS[activeView]}
                        {!currentRenderUrl && <span className="ml-auto text-[7px] opacity-60">— genera la vista primero</span>}
                      </button>
                    )}
                  </section>

                  {/* ── Description / Re-synthesize ── */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-3 flex items-center gap-2">
                      Descripción <Sparkles size={10} className="text-brand" />
                    </h5>
                    {isEditingPrompt ? (
                      <div className="space-y-3">
                        <textarea
                          value={editPrompt}
                          onChange={e => setEditPrompt(e.target.value)}
                          rows={5}
                          className="w-full bg-bg-main border border-brand p-3 text-xs leading-relaxed outline-none resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleReSynthesize}
                            disabled={!!generatingView}
                            className="flex-1 bg-brand text-black py-2 text-[9px] uppercase tracking-widest font-black hover:bg-white transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <RefreshCw size={10} /> Re-sintetizar
                          </button>
                          <button onClick={() => setIsEditingPrompt(false)} className="px-3 py-2 border border-border-main text-text-muted text-[9px] hover:text-white">
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="p-4 bg-bg-main border border-border-main italic text-xs leading-relaxed text-text-dim cursor-pointer hover:border-brand/40 transition-colors group"
                        onClick={() => setIsEditingPrompt(true)}
                      >
                        <p>"{selectedDesign.prompt || 'Sin descripción.'}"</p>
                        <p className="text-[8px] text-brand/50 uppercase tracking-widest mt-2 group-hover:text-brand transition-colors">Clic para modificar</p>
                      </div>
                    )}
                  </section>

                  {/* ── Ghost / Model toggle ── */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-3 italic">Modo de Visualización</h5>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSwitchViewMode('ghost')}
                        className={cn("flex-1 py-3 text-[9px] uppercase tracking-widest font-black transition-all border",
                          selectedDesign.view_mode === 'ghost'
                            ? "bg-brand text-black border-brand"
                            : "border-border-main text-text-dim hover:text-white")}
                      >
                        Ghost Render
                      </button>
                      <button
                        onClick={() => handleSwitchViewMode('model')}
                        disabled={isGeneratingModel}
                        className={cn("flex-1 py-3 text-[9px] uppercase tracking-widest font-black transition-all border flex items-center justify-center gap-1",
                          selectedDesign.view_mode === 'model'
                            ? "bg-brand text-black border-brand"
                            : "border-border-main text-text-dim hover:text-white",
                          isGeneratingModel && "opacity-50 cursor-wait")}
                      >
                        {isGeneratingModel && generatingView === 'front'
                          ? <><Cpu size={10} className="animate-spin" /> Generando...</>
                          : <><Shirt size={10} /> Con Modelo</>}
                      </button>
                    </div>

                    {/* Environment tabs — only in model mode */}
                    {selectedDesign.view_mode === 'model' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => { setModelEnvironment('studio'); setPreviewVersion(null); }}
                          className={cn("flex-1 py-2 text-[8px] uppercase tracking-widest border transition-all",
                            modelEnvironment === 'studio' ? "border-brand text-brand" : "border-border-main text-text-muted hover:text-white")}
                        >
                          Estudio
                        </button>
                        <button
                          onClick={() => { setModelEnvironment('outdoor'); setPreviewVersion(null); }}
                          className={cn("flex-1 py-2 text-[8px] uppercase tracking-widest border transition-all",
                            modelEnvironment === 'outdoor' ? "border-brand text-brand" : "border-border-main text-text-muted hover:text-white")}
                        >
                          Exterior
                        </button>
                        {/* Force regenerate current model view */}
                        <button
                          onClick={() => handleGenerateModelView(activeView, modelEnvironment)}
                          disabled={isGeneratingModel}
                          title={`Regenerar vista ${VIEW_LABELS[activeView]} — ${modelEnvironment}`}
                          className="px-3 py-2 bg-bg-accent border border-border-main text-text-muted text-[8px] uppercase hover:border-brand hover:text-brand transition-all disabled:opacity-50"
                        >
                          <RefreshCw size={10} />
                        </button>
                      </div>
                    )}

                    {/* Model views status grid */}
                    {selectedDesign.view_mode === 'model' && (
                      <div className="mt-3 grid grid-cols-4 gap-1">
                        {(['front', 'back', 'side', 'closeup'] as ViewType[]).map(v => {
                          const url = getRenderUrl(selectedDesign, v);
                          return (
                            <button
                              key={v}
                              onClick={() => { setActiveView(v); setPreviewVersion(null); }}
                              className={cn(
                                "py-1.5 text-[7px] uppercase tracking-wide border transition-all flex items-center justify-center gap-1",
                                activeView === v ? "border-brand text-brand" : "border-border-main text-text-muted hover:text-white"
                              )}
                            >
                              <span className={cn("w-1 h-1 rounded-full", url ? "bg-brand" : "bg-text-muted/30")} />
                              {VIEW_LABELS[v]}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* ── Material & Color variant ── */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-3 italic flex items-center justify-between">
                      <span>Material y Color</span>
                      <button
                        onClick={() => setFabricModalOpen(true)}
                        className="text-brand/60 hover:text-brand transition-colors text-[8px] uppercase tracking-wide font-normal"
                      >
                        + Gestionar
                      </button>
                    </h5>
                    <div className="flex flex-wrap gap-3 mb-3">
                      {fabrics.map((fabric) => (
                        <button
                          key={fabric.id}
                          onClick={() => setSelectedFabric(fabric)}
                          title={`${fabric.name} — ${fabric.material} — ${fabric.finish}`}
                          className="flex flex-col items-center gap-1.5 group"
                        >
                          <div
                            className={cn(
                              "w-9 h-9 rounded-full border-2 shadow-inner transition-all relative",
                              selectedFabric?.id === fabric.id
                                ? "border-brand scale-110 ring-1 ring-brand/30"
                                : "border-border-main group-hover:border-text-muted"
                            )}
                            style={{ backgroundColor: fabric.color }}
                          >
                            {fabric.is_custom ? (
                              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand rounded-full" />
                            ) : null}
                          </div>
                          <span className={cn(
                            "text-[7px] text-center leading-tight max-w-[44px] truncate transition-colors",
                            selectedFabric?.id === fabric.id ? "text-brand font-bold" : "text-text-muted group-hover:text-white"
                          )}>
                            {fabric.name.split(/\s/)[0]}
                          </span>
                        </button>
                      ))}
                    </div>

                    {selectedFabric && (
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between items-baseline">
                          <p className="text-[9px] text-text-main font-bold uppercase">{selectedFabric.name}</p>
                          <p className="text-[8px] text-text-muted italic">{selectedFabric.material}</p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[7px] uppercase tracking-widest text-[#666]">
                            <span>Elasticidad</span>
                            <span>{Math.round(selectedFabric.elasticity * 100)}%</span>
                          </div>
                          <div className="h-0.5 bg-bg-main w-full">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${selectedFabric.elasticity * 100}%` }}
                              className="h-full bg-brand"
                            />
                          </div>
                        </div>
                        {selectedFabric.file_url && (
                          <a
                            href={selectedFabric.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[8px] text-brand/60 hover:text-brand transition-colors"
                          >
                            <FileImage size={9} /> Ver archivo adjunto
                          </a>
                        )}
                      </div>
                    )}

                    {/* View selection for multi-view variant */}
                    <div className="mb-3">
                      <p className="text-[7px] uppercase tracking-widest text-text-muted mb-2">Aplicar a vistas:</p>
                      <div className="flex gap-2 flex-wrap">
                        {(['front', 'back', 'side', 'closeup'] as ViewType[]).map(v => {
                          const hasRender = !!getRenderUrl(selectedDesign, v);
                          const isSel = variantViewSelections.has(v);
                          return (
                            <button
                              key={v}
                              onClick={() => {
                                if (!hasRender) return;
                                const next = new Set(variantViewSelections);
                                if (isSel) next.delete(v); else next.add(v);
                                setVariantViewSelections(next);
                              }}
                              disabled={!hasRender}
                              className={cn(
                                "px-2 py-1 text-[7px] uppercase border transition-all flex items-center gap-1",
                                !hasRender
                                  ? "border-border-main text-text-muted/30 cursor-not-allowed"
                                  : isSel
                                  ? "border-brand bg-brand/10 text-brand"
                                  : "border-border-main text-text-muted hover:text-white"
                              )}
                            >
                              {isSel && <CheckCircle2 size={7} />}
                              {VIEW_LABELS[v]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {variantProgress && (
                      <div className="mb-3 space-y-1">
                        <p className="text-[8px] text-brand uppercase tracking-widest">
                          {variantProgress.current}/{variantProgress.total} vistas procesadas...
                        </p>
                        <div className="h-0.5 bg-bg-main w-full">
                          <div
                            className="h-full bg-brand transition-all duration-500"
                            style={{ width: `${(variantProgress.current / variantProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Variant generation button */}
                    <button
                      onClick={handleGenerateVariant}
                      disabled={isGeneratingVariant || !selectedFabric || variantViewSelections.size === 0}
                      title="Genera variantes de material para las vistas seleccionadas. El original se guarda en historial."
                      className={cn(
                        "w-full py-3 text-[9px] uppercase tracking-widest font-black transition-all border flex items-center justify-center gap-2",
                        isGeneratingVariant
                          ? "border-brand/50 text-brand/50 cursor-wait"
                          : !selectedFabric || variantViewSelections.size === 0
                          ? "border-border-main text-text-muted opacity-40 cursor-not-allowed"
                          : "border-border-main text-text-dim hover:border-brand hover:text-brand"
                      )}
                    >
                      {isGeneratingVariant
                        ? <><Cpu size={10} className="animate-spin" /> Generando variante...</>
                        : <><Palette size={10} /> Aplicar: {selectedFabric?.name || 'Seleccione material'}{variantViewSelections.size > 1 ? ` (${variantViewSelections.size} vistas)` : ''}</>}
                    </button>
                    <p className="text-[7px] text-text-muted mt-1.5 leading-relaxed">
                      Solo cambia el tejido. Los originales se guardan en el historial.
                    </p>
                  </section>

                  {/* ── Model identity ── */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-3 italic">Identidad de Modelo</h5>
                    <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                      {models.map((model) => (
                        <div
                          key={model.id}
                          onClick={() => handleChangeDesignModel(model.id)}
                          className={cn("group/det flex flex-col items-center flex-shrink-0 transition-opacity relative cursor-pointer",
                            selectedDesign.model_id === model.id ? "opacity-100" : "opacity-30 hover:opacity-70")}
                        >
                          <div className={cn("w-14 h-14 rounded-full border-2 bg-bg-main p-1 mb-2 relative",
                            selectedDesign.model_id === model.id ? "border-brand" : "border-border-secondary group-hover/det:border-brand/50")}>
                            <img src={model.preview_url} className="w-full h-full object-cover rounded-full" alt={model.name} referrerPolicy="no-referrer" />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteModel(model.id, e); }}
                              className="absolute -top-1 -right-1 bg-red-900 text-red-300 rounded-full p-0.5 opacity-0 group-hover/det:opacity-100 transition-opacity"
                            >
                              <X size={8} />
                            </button>
                          </div>
                          <p className="text-[7px] text-center text-text-main font-bold max-w-[60px] truncate">{model.name}</p>
                          {selectedDesign.model_id === model.id ? (
                            <p className="text-[6px] text-center text-brand uppercase tracking-tighter mt-1 font-black">Maestra</p>
                          ) : (
                            <p className="text-[6px] text-center text-text-muted uppercase tracking-tighter mt-1 font-black opacity-0 group-hover/det:opacity-100 transition-opacity">Cambiar</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* ── Version history ── */}
                  <section>
                    <button
                      onClick={() => setShowVersionHistory(!showVersionHistory)}
                      className="w-full flex items-center justify-between text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-3 italic hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <History size={10} /> Historial ({designVersions.length})
                      </span>
                      {showVersionHistory ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    </button>
                    {showVersionHistory && (
                      <div>
                          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                            {designVersions.map((v) => {
                              const isPreview = previewVersion?.image_url === v.image_url;
                              const isCurrentMain = !previewVersion && getRenderUrl(selectedDesign, (v.view || 'front') as ViewType) === v.image_url;
                              const typeColors: Record<string, string> = {
                                ghost: 'text-text-muted',
                                model: 'text-brand/80',
                                variant: 'text-purple-400',
                                edit: 'text-yellow-400',
                              };
                              return (
                                <div
                                  key={v.id}
                                  className={cn(
                                    "flex items-start p-3 border transition-all",
                                    isPreview
                                      ? "border-brand bg-bg-accent"
                                      : isCurrentMain
                                        ? "border-brand/30 bg-bg-accent/40"
                                        : "border-border-main bg-bg-main"
                                  )}
                                >
                                  {/* Thumbnail — click to preview */}
                                  <button
                                    onClick={() => { setPreviewVersion(v); setActiveView((v.view || 'front') as ViewType); }}
                                    className="flex-shrink-0 mr-3"
                                  >
                                    {v.image_url && (
                                      <img src={v.image_url} className="w-8 h-10 object-cover border border-border-main hover:border-brand transition-colors" alt="" />
                                    )}
                                  </button>
                                  {/* Info */}
                                  <div
                                    className="flex-1 min-w-0 cursor-pointer"
                                    onClick={() => { setPreviewVersion(v); setActiveView((v.view || 'front') as ViewType); }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="text-[10px] font-mono text-brand">V{v.version_number}</div>
                                      <div className={cn("text-[7px] uppercase tracking-tighter", typeColors[v.type] || 'text-text-muted')}>
                                        {v.type === 'variant' ? 'variante' : v.type}
                                      </div>
                                      <div className="text-[7px] text-text-muted/60 uppercase">{v.view}</div>
                                    </div>
                                    {(v.type === 'variant' || v.type === 'edit') && (
                                      <p className="text-[7px] text-text-muted truncate mt-0.5">{v.prompt}</p>
                                    )}
                                    <div className="text-[7px] text-text-muted">{new Date(v.created_at).toLocaleDateString()}</div>
                                    {isCurrentMain && (
                                      <div className="text-[6px] text-brand uppercase tracking-widest mt-0.5 font-black">Principal actual</div>
                                    )}
                                  </div>
                                  {/* Set as main button */}
                                  {!isCurrentMain && v.image_url && (
                                    <button
                                      onClick={() => handleSetVersionAsMain(v)}
                                      title="Establecer como render principal de esta vista"
                                      className="flex-shrink-0 ml-2 p-1.5 border border-border-main text-text-muted hover:border-brand hover:text-brand transition-all"
                                    >
                                      <CheckCircle2 size={10} />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {previewVersion && (
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handleSetVersionAsMain(previewVersion)}
                                className="flex-1 py-2 text-[8px] uppercase tracking-widest text-black bg-brand border border-brand hover:bg-white transition-colors font-black flex items-center justify-center gap-1"
                              >
                                <CheckCircle2 size={10} /> Establecer como principal
                              </button>
                              <button
                                onClick={() => setPreviewVersion(null)}
                                className="px-3 py-2 text-[8px] uppercase tracking-widest text-text-muted border border-border-main hover:text-white transition-colors"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          )}
                      </div>
                    )}
                  </section>

                  {/* ── Reference files ── */}
                  {(selectedDesign.technical_sketch_url || selectedDesign.inspiration_url) && (
                    <section>
                      <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-3 italic">Referencias Originales</h5>
                      <div className="flex gap-2">
                        {selectedDesign.technical_sketch_url && (
                          <a href={selectedDesign.technical_sketch_url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-main text-text-muted text-[8px] uppercase hover:border-brand hover:text-brand transition-all">
                            <ImagePlus size={10} /> Boceto
                          </a>
                        )}
                        {selectedDesign.inspiration_url && (
                          <a href={selectedDesign.inspiration_url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-main text-text-muted text-[8px] uppercase hover:border-brand hover:text-brand transition-all">
                            <Eye size={10} /> Inspiración
                          </a>
                        )}
                      </div>
                    </section>
                  )}

                  {/* ── Actions ── */}
                  <div className="pt-2 space-y-3">
                    <button
                      onClick={handleDownload}
                      disabled={!currentRenderUrl}
                      className="w-full bg-bg-accent border border-border-secondary text-text-main py-4 text-[10px] uppercase tracking-[0.2em] font-black hover:bg-brand hover:text-black transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                      <Download size={12} /> Exportar Render Actual
                    </button>
                    <button
                      onClick={handleGenerateCatalog}
                      className="w-full border border-border-secondary text-text-dim py-3 text-[10px] uppercase tracking-[0.2em] font-black hover:border-brand hover:text-brand transition-all flex items-center justify-center gap-2"
                    >
                      <BookOpen size={12} /> Generar Catálogo Completo
                    </button>
                    <button
                      onClick={(e) => handleDeleteDesign(selectedDesign, e)}
                      className="w-full border border-red-900/50 text-red-500/70 py-3 text-[10px] uppercase tracking-[0.2em] font-black hover:bg-red-950/40 hover:text-red-400 hover:border-red-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={12} /> Eliminar Referencia
                    </button>
                    <p className="text-center text-[8px] text-text-muted italic tracking-widest uppercase">Cifrado activo // SHA-256</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Catalog Builder Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {isCatalogBuilderOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/92 flex items-center justify-center p-4"
            onClick={() => !isGeneratingCatalog && setIsCatalogBuilderOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 12 }}
              transition={{ duration: 0.22 }}
              className="bg-bg-secondary border border-border-secondary w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-8 py-5 border-b border-border-main flex-shrink-0">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.25em] text-text-muted mb-1">
                    {catalogStep === 1 ? 'Paso 1 de 2 — Selección de referencias' : 'Paso 2 de 2 — Selección de imágenes'}
                  </p>
                  <h2 className="text-base font-bold tracking-tight text-text-main">
                    {catalogStep === 1 ? 'Construir Catálogo' : 'Elegir Imágenes por Diseño'}
                  </h2>
                </div>

                {/* Step pills */}
                <div className="flex items-center gap-2">
                  <div className={cn('w-6 h-6 rounded-full border text-[9px] font-black flex items-center justify-center transition-all',
                    catalogStep >= 1 ? 'bg-brand border-brand text-white' : 'border-border-secondary text-text-muted')}>1</div>
                  <div className="w-6 h-px bg-border-secondary" />
                  <div className={cn('w-6 h-6 rounded-full border text-[9px] font-black flex items-center justify-center transition-all',
                    catalogStep >= 2 ? 'bg-brand border-brand text-white' : 'border-border-secondary text-text-muted')}>2</div>
                </div>

                <button onClick={() => !isGeneratingCatalog && setIsCatalogBuilderOpen(false)}
                  className="text-text-muted hover:text-text-main transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {catalogStep === 1 ? (
                  /* ── STEP 1: Select designs ─────────────────────────────── */
                  <div className="p-8">
                    {/* Catalog metadata */}
                    <div className="grid grid-cols-2 gap-4 mb-8 p-5 border border-border-main bg-bg-accent">
                      <div>
                        <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted block mb-2">Título del Catálogo</label>
                        <input
                          value={catalogTitle}
                          onChange={e => setCatalogTitle(e.target.value)}
                          className="w-full bg-bg-main border border-border-main text-text-main text-sm px-3 py-2 outline-none focus:border-brand transition-colors"
                          placeholder="Colección SS 2025"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted block mb-2">Temporada / Año</label>
                        <input
                          value={catalogSeason}
                          onChange={e => setCatalogSeason(e.target.value)}
                          className="w-full bg-bg-main border border-border-main text-text-main text-sm px-3 py-2 outline-none focus:border-brand transition-colors"
                          placeholder="SS 2025"
                        />
                      </div>
                    </div>

                    {/* Selection controls */}
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-xs text-text-dim">
                        <span className="text-brand font-bold">{catalogSelectedIds.size}</span> de {designs.length} diseños seleccionados
                      </span>
                      <div className="flex gap-4">
                        <button onClick={() => setCatalogSelectedIds(new Set(designs.map(d => d.id)))}
                          className="text-[10px] text-brand hover:underline font-bold uppercase tracking-wide">
                          Seleccionar todos
                        </button>
                        <button onClick={() => setCatalogSelectedIds(new Set())}
                          className="text-[10px] text-text-muted hover:text-text-main uppercase tracking-wide">
                          Limpiar
                        </button>
                      </div>
                    </div>

                    {/* Design grid */}
                    {designs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                        <Shirt size={40} className="mb-4 opacity-30" />
                        <p className="text-sm">No hay diseños para incluir en el catálogo.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {designs.map(design => {
                          const isSelected = catalogSelectedIds.has(design.id);
                          const thumb = design.front_render_url || design.model_front_render_url || design.render_url;
                          return (
                            <button
                              key={design.id}
                              onClick={() => {
                                const next = new Set(catalogSelectedIds);
                                if (isSelected) next.delete(design.id);
                                else next.add(design.id);
                                setCatalogSelectedIds(next);
                              }}
                              className={cn(
                                'relative group border-2 overflow-hidden text-left transition-all duration-200',
                                isSelected
                                  ? 'border-brand shadow-[0_0_12px_rgba(229,102,45,0.25)]'
                                  : 'border-transparent hover:border-border-secondary'
                              )}
                            >
                              <div className="aspect-[3/4] bg-[#f8f6f2] overflow-hidden flex items-center justify-center">
                                {thumb
                                  ? <img src={thumb} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" alt={design.name} />
                                  : <div className="w-full h-full flex items-center justify-center"><Shirt size={28} className="text-border-secondary" /></div>
                                }
                              </div>
                              <div className="p-2.5 bg-bg-accent border-t border-border-main">
                                <p className="text-[11px] font-bold text-text-main truncate">{design.name}</p>
                                <p className="text-[9px] text-brand uppercase tracking-wider mt-0.5">{design.category}</p>
                              </div>
                              {/* Checkbox indicator */}
                              <div className={cn(
                                'absolute top-2 right-2 w-5 h-5 rounded-sm border-2 flex items-center justify-center transition-all',
                                isSelected
                                  ? 'bg-brand border-brand'
                                  : 'bg-black/50 border-white/30 group-hover:border-white/60'
                              )}>
                                {isSelected && <CheckCircle2 size={11} className="text-white" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── STEP 2: Select images per design ───────────────────── */
                  <div className="p-8 space-y-6">
                    {(Array.from(catalogSelectedIds) as string[]).map(designId => {
                      const design = designs.find(d => d.id === designId);
                      if (!design) return null;
                      const availableImgs = getDesignCatalogImages(design);
                      const selectedImgs = catalogImageSelections[designId] || [];

                      const typeLabel: Record<string, string> = {
                        ghost: 'Ghost', model: 'Modelo', outdoor: 'Outdoor',
                      };
                      const typeBadge: Record<string, string> = {
                        ghost: 'bg-bg-accent text-text-dim',
                        model: 'bg-brand/10 text-brand',
                        outdoor: 'bg-blue-900/20 text-blue-400',
                      };

                      return (
                        <div key={designId} className="border border-border-main overflow-hidden">
                          {/* Design header */}
                          <div className="flex items-center justify-between px-5 py-4 bg-bg-accent border-b border-border-main">
                            <div>
                              <h3 className="text-sm font-bold text-text-main">{design.name}</h3>
                              <p className="text-[9px] uppercase tracking-widest text-brand mt-0.5">{design.category}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-[10px] text-text-muted">
                                <span className="text-brand font-bold">{selectedImgs.length}</span> / {availableImgs.length} imágenes
                              </span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setCatalogImageSelections(p => ({
                                    ...p, [designId]: availableImgs.map(i => i.url),
                                  }))}
                                  className="text-[9px] text-brand hover:underline font-bold uppercase tracking-wide"
                                >Todas</button>
                                <button
                                  onClick={() => setCatalogImageSelections(p => ({
                                    ...p, [designId]: availableImgs.length > 0 ? [availableImgs[0].url] : [],
                                  }))}
                                  className="text-[9px] text-text-muted hover:text-text-main uppercase tracking-wide"
                                >Solo principal</button>
                                <button
                                  onClick={() => setCatalogImageSelections(p => ({ ...p, [designId]: [] }))}
                                  className="text-[9px] text-red-500/70 hover:text-red-400 uppercase tracking-wide"
                                >Ninguna</button>
                              </div>
                            </div>
                          </div>

                          {/* Images */}
                          {availableImgs.length === 0 ? (
                            <div className="p-6 text-center text-text-muted text-xs italic">
                              Este diseño no tiene renders disponibles aún.
                            </div>
                          ) : (
                            <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                              {availableImgs.map(img => {
                                const isSel = selectedImgs.includes(img.url);
                                return (
                                  <button
                                    key={img.key}
                                    onClick={() => {
                                      const next = isSel
                                        ? selectedImgs.filter(u => u !== img.url)
                                        : [...selectedImgs, img.url];
                                      setCatalogImageSelections(p => ({ ...p, [designId]: next }));
                                    }}
                                    className={cn(
                                      'relative border-2 overflow-hidden transition-all duration-150 text-left group',
                                      isSel
                                        ? 'border-brand shadow-[0_0_8px_rgba(229,102,45,0.2)]'
                                        : 'border-transparent hover:border-border-secondary'
                                    )}
                                  >
                                    <div className="aspect-[3/4] overflow-hidden bg-bg-accent">
                                      <img src={img.url} alt={img.label}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                    </div>
                                    <div className="px-1.5 py-1.5 bg-bg-secondary">
                                      <div className={cn('inline-block px-1.5 py-0.5 rounded-sm text-[7px] font-bold uppercase tracking-wide mb-0.5', typeBadge[img.type])}>
                                        {typeLabel[img.type]}
                                      </div>
                                      <p className="text-[8px] text-text-muted truncate leading-tight">{img.label.replace(/^(Ghost|Modelo|Outdoor)\s/, '')}</p>
                                    </div>
                                    {isSel && (
                                      <div className="absolute top-1 right-1 w-4 h-4 bg-brand rounded-sm flex items-center justify-center">
                                        <CheckCircle2 size={9} className="text-white" />
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-border-main px-8 py-5 flex items-center justify-between flex-shrink-0 bg-bg-secondary">
                {catalogStep === 1 ? (
                  <>
                    <button onClick={() => setIsCatalogBuilderOpen(false)}
                      className="text-xs text-text-muted hover:text-text-main transition-colors uppercase tracking-wide">
                      Cancelar
                    </button>
                    <button
                      disabled={catalogSelectedIds.size === 0}
                      onClick={() => {
                        if (catalogSelectedIds.size === 0) return;
                        const init: Record<string, string[]> = {};
                        (Array.from(catalogSelectedIds) as string[]).forEach(id => {
                          const d = designs.find(x => x.id === id);
                          if (d) {
                            const imgs = getDesignCatalogImages(d);
                            init[id] = imgs.length > 0 ? [imgs[0].url] : [];
                          }
                        });
                        setCatalogImageSelections(init);
                        setCatalogStep(2);
                      }}
                      className={cn(
                        'px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all',
                        catalogSelectedIds.size > 0
                          ? 'bg-brand text-white hover:scale-105 cursor-pointer'
                          : 'bg-bg-accent text-text-muted cursor-not-allowed'
                      )}
                    >
                      Siguiente ({catalogSelectedIds.size}) →
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setCatalogStep(1)}
                      className="text-xs text-text-muted hover:text-text-main transition-colors uppercase tracking-wide">
                      ← Atrás
                    </button>
                    <div className="flex items-center gap-3">
                      {isGeneratingCatalog && (
                        <div className="flex items-center gap-2 text-text-dim text-[10px] uppercase tracking-wide">
                          <RefreshCw size={11} className="animate-spin text-brand" />
                          {catalogStatusText || 'Generando...'}
                        </div>
                      )}
                      <button
                        disabled={isGeneratingCatalog}
                        onClick={() => openCatalog('html')}
                        className={cn(
                          'flex items-center gap-2 border border-border-secondary px-5 py-2 text-xs font-bold uppercase tracking-wide transition-all',
                          isGeneratingCatalog
                            ? 'opacity-40 cursor-not-allowed text-text-muted'
                            : 'text-text-dim hover:border-brand hover:text-brand cursor-pointer'
                        )}
                      >
                        <Download size={12} />
                        HTML
                      </button>
                      <button
                        disabled={isGeneratingCatalog}
                        onClick={() => openCatalog('pdf')}
                        className={cn(
                          'flex items-center gap-2 px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all',
                          isGeneratingCatalog
                            ? 'bg-bg-accent text-text-muted cursor-not-allowed'
                            : 'bg-brand text-white hover:scale-105 cursor-pointer'
                        )}
                      >
                        <BookOpen size={12} />
                        Generar PDF
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile Sidebar Drawer ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isMobileDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[65] bg-black/70 md:hidden"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-14 z-[66] w-[260px] bg-[#0D0D0D] border-r border-border-main flex flex-col md:hidden overflow-y-auto"
            >
              <div className="p-6 flex flex-col h-full">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-[10px] uppercase text-text-muted tracking-[0.2em]">Colecciones</h2>
                  <button onClick={() => setMobileDrawerOpen(false)} className="text-text-muted hover:text-white">
                    <X size={16} />
                  </button>
                </div>
                <ul className="space-y-4">
                  <li
                    onClick={() => { setActiveCategory('All'); setMobileDrawerOpen(false); }}
                    className={cn("text-sm flex items-center justify-between cursor-pointer transition-colors",
                      activeCategory === 'All' ? "text-brand" : "text-text-dim hover:text-white")}
                  >
                    <span className="flex items-center gap-3"><LayoutDashboard size={14} /> Todos los Diseños</span>
                    <span className={cn("text-[9px] px-1.5", activeCategory === 'All' ? "bg-border-secondary" : "bg-bg-accent")}>{designs.length}</span>
                  </li>
                  {CATEGORIES.map(cat => (
                    <li
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setMobileDrawerOpen(false); }}
                      className={cn("text-sm flex items-center justify-between cursor-pointer transition-colors",
                        activeCategory === cat ? "text-brand" : "text-text-dim hover:text-white")}
                    >
                      <span className="flex items-center gap-3"><Layers size={14} /> {cat}</span>
                      <span className={cn("text-[9px] px-1.5",
                        activeCategory === cat ? "bg-bg-secondary text-brand" : "bg-bg-accent text-text-muted")}>
                        {designs.filter(d => d.category === cat).length.toString().padStart(2, '0')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Mobile Bottom Tab Bar ─────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[50] bg-bg-secondary border-t border-border-main">
        <div className="flex">
          {([
            { icon: LayoutDashboard, label: 'Colecciones', action: () => setMobileDrawerOpen(v => !v) },
            { icon: Plus, label: 'Nueva Ref', action: () => setIsCreating(true) },
            { icon: BookOpen, label: 'Catálogo', action: handleGenerateCatalog },
            { icon: Gem, label: 'Materiales', action: () => setFabricModalOpen(true) },
          ] as { icon: any; label: string; action: () => void }[]).map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-text-muted hover:text-brand transition-colors active:text-brand"
            >
              <Icon size={18} />
              <span className="text-[8px] uppercase tracking-wide">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 2px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0A0A0A; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #222; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #e5662d; }
      `}</style>
    </div>
  );
}
