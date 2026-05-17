import { useState, useEffect, useRef, ChangeEvent } from 'react';
import {
  Plus,
  Layers,
  Sparkles,
  Droplets,
  Maximize2,
  LayoutDashboard,
  Upload,
  Shirt,
  Users,
  ChevronRight,
  MoreVertical,
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import type { Design, Category, Fabric, DesignVersion, Model, ViewType } from './types';

const CATEGORIES: Category[] = ['Core', 'Moda', 'Natación Deportiva', 'Bodies', 'Resort', 'Activewear'];

const VIEW_LABELS: Record<ViewType, string> = {
  front: 'Frontal',
  back: 'Posterior',
  side: 'Lateral',
  closeup: 'Close-up',
};

// ── API helpers ────────────────────────────────────────────────────────────

async function apiUploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al subir archivo.');
  return data.url as string;
}

async function apiGenerateGhost(prompt: string, view: ViewType, sketchUrl?: string, inspirationUrl?: string): Promise<string> {
  const res = await fetch('/api/generate/ghost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, view, sketchUrl, inspirationUrl }),
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
  environment: 'studio' | 'outdoor' = 'studio'
): Promise<string> {
  const res = await fetch('/api/generate/model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, modelName, ghostRenderUrl, identityAnchorUrl, environment }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al generar imagen con modelo.');
  return data.url as string;
}

async function apiPatchDesign(id: string, fields: Partial<Design>) {
  await fetch(`/api/designs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

async function apiAddVersion(designId: string, prompt: string, imageUrl: string, type: 'ghost' | 'model', view: ViewType) {
  await fetch(`/api/designs/${designId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_url: imageUrl, type, view }),
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function App() {
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

  // Creation modal state
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');
  const [newDesignCategory, setNewDesignCategory] = useState<Category>('Core');
  const [newDesignPrompt, setNewDesignPrompt] = useState('');
  const [sketchFile, setSketchFile] = useState<File | null>(null);
  const [sketchPreview, setSketchPreview] = useState<string | null>(null);
  const [inspirationFile, setInspirationFile] = useState<File | null>(null);
  const [inspirationPreview, setInspirationPreview] = useState<string | null>(null);

  const sketchInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

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
    }
  }, [selectedDesign?.id]);

  const fetchDesigns = async () => {
    try {
      const res = await fetch('/api/designs');
      const data = await res.json();
      setDesigns(data);
      if (selectedDesign) {
        const updated = data.find((d: Design) => d.id === selectedDesign.id);
        if (updated) setSelectedDesign(updated);
      }
    } catch (e) {
      console.error('fetchDesigns', e);
    }
  };

  const fetchVersions = async (designId: string) => {
    try {
      const res = await fetch(`/api/designs/${designId}/versions`);
      setDesignVersions(await res.json());
    } catch (e) {
      console.error('fetchVersions', e);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(data);
      if (data.length > 0 && !selectedModelId) setSelectedModelId(data[0].id);
    } catch (e) {
      console.error('fetchModels', e);
    }
  };

  const fetchFabrics = async () => {
    try {
      const res = await fetch('/api/fabrics');
      const data = await res.json();
      setFabrics(data);
      if (data.length > 0) setSelectedFabric(data[0]);
    } catch (e) {
      console.error('fetchFabrics', e);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, type: 'sketch' | 'inspiration' | 'model') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'sketch') { setSketchFile(file); setSketchPreview(url); }
    else if (type === 'inspiration') { setInspirationFile(file); setInspirationPreview(url); }
    else if (type === 'model') handleUploadModel(file);
  };

  const handleUploadModel = async (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const newModel = {
        id: `m_${Math.random().toString(36).substr(2, 5)}`,
        name: file.name.split('.')[0],
        preview_url: url,
      };
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newModel),
      });
      await fetchModels();
      setSelectedModelId(newModel.id);
    } catch (e) {
      console.error('uploadModel', e);
    }
  };

  // Returns the current render URL for a design+view combination
  const getRenderUrl = (design: Design, view: ViewType): string | undefined => {
    if (design.view_mode === 'model') return design.model_render_url || undefined;
    const map: Record<ViewType, string | undefined> = {
      front: design.front_render_url,
      back: design.back_render_url,
      side: design.side_render_url,
      closeup: design.closeup_render_url,
    };
    return map[view];
  };

  const currentRenderUrl = selectedDesign ? getRenderUrl(selectedDesign, activeView) : undefined;

  // ── Create design ──────────────────────────────────────────────────────────
  const handleCreateDesign = async () => {
    if (!newDesignName.trim()) { alert('Por favor, asigne un nombre a la referencia.'); return; }
    if (!selectedModelId) { alert('Debe seleccionar o cargar una modelo.'); return; }
    if (!newDesignPrompt.trim()) { alert('Ingrese la descripción de la prenda.'); return; }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      // 1. Upload files
      let sketchUrl: string | undefined;
      let inspirationUrl: string | undefined;
      if (sketchFile) sketchUrl = await apiUploadFile(sketchFile);
      if (inspirationFile) inspirationUrl = await apiUploadFile(inspirationFile);

      // 2. Create design in DB
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
          technical_sketch_url: sketchUrl,
          inspiration_url: inspirationUrl,
        }),
      });

      // 3. Generate front render (awaited so we show it immediately)
      const frontUrl = await apiGenerateGhost(newDesignPrompt, 'front', sketchUrl, inspirationUrl);
      await apiPatchDesign(designId, { front_render_url: frontUrl, render_url: frontUrl, status: 'rendered' });
      await apiAddVersion(designId, newDesignPrompt, frontUrl, 'ghost', 'front');

      // 4. Close modal & refresh
      setIsCreating(false);
      resetCreationForm();
      await fetchDesigns();

      // 5. Generate remaining views in background
      generateRemainingViews(designId, newDesignPrompt, sketchUrl, inspirationUrl);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateRemainingViews = async (designId: string, prompt: string, sketchUrl?: string, inspirationUrl?: string) => {
    for (const view of ['back', 'side', 'closeup'] as ViewType[]) {
      try {
        const url = await apiGenerateGhost(prompt, view, sketchUrl, inspirationUrl);
        const field = `${view}_render_url` as keyof Design;
        await apiPatchDesign(designId, { [field]: url } as any);
        await apiAddVersion(designId, prompt, url, 'ghost', view);
        await fetchDesigns();
      } catch (e) {
        console.error(`Error generating ${view}:`, e);
      }
    }
  };

  // ── Generate a specific view on demand ────────────────────────────────────
  const handleGenerateView = async (view: ViewType) => {
    if (!selectedDesign || generatingView) return;
    setGeneratingView(view);
    setErrorMsg(null);
    try {
      const url = await apiGenerateGhost(
        selectedDesign.prompt || '',
        view,
        selectedDesign.technical_sketch_url,
        selectedDesign.inspiration_url
      );
      const field = `${view}_render_url` as keyof Design;
      await apiPatchDesign(selectedDesign.id, { [field]: url } as any);
      await apiAddVersion(selectedDesign.id, selectedDesign.prompt || '', url, 'ghost', view);
      await fetchDesigns();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setGeneratingView(null);
    }
  };

  // ── Model visualization ────────────────────────────────────────────────────
  const handleGenerateModelRender = async () => {
    if (!selectedDesign || isGeneratingModel) return;
    setIsGeneratingModel(true);
    setErrorMsg(null);
    try {
      const selectedModel = models.find(m => m.id === selectedDesign.model_id);
      // ghost render = garment reference (locks the design)
      // existing model_render_url = identity anchor (locks the model's face/body on re-generations)
      const url = await apiGenerateModel(
        selectedDesign.prompt || '',
        selectedModel?.name || 'modelo profesional',
        selectedDesign.front_render_url,          // garment reference
        selectedDesign.model_render_url,           // identity anchor (undefined on first run)
        modelEnvironment
      );
      await apiPatchDesign(selectedDesign.id, { model_render_url: url, view_mode: 'model' });
      await apiAddVersion(selectedDesign.id, selectedDesign.prompt || '', url, 'model', 'front');
      await fetchDesigns();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsGeneratingModel(false);
    }
  };

  // ── Switch between ghost and model view ───────────────────────────────────
  const handleSwitchViewMode = async (mode: 'ghost' | 'model') => {
    if (!selectedDesign) return;
    if (mode === 'model' && !selectedDesign.model_render_url) {
      await handleGenerateModelRender();
    } else {
      await apiPatchDesign(selectedDesign.id, { view_mode: mode });
      await fetchDesigns();
    }
  };

  // ── Re-synthesize with edited prompt ──────────────────────────────────────
  const handleReSynthesize = async () => {
    if (!selectedDesign || !editPrompt.trim()) return;
    setIsEditingPrompt(false);
    setGeneratingView('front');
    setErrorMsg(null);
    try {
      await apiPatchDesign(selectedDesign.id, { prompt: editPrompt });
      const url = await apiGenerateGhost(editPrompt, activeView, selectedDesign.technical_sketch_url, selectedDesign.inspiration_url);
      const field = `${activeView}_render_url` as keyof Design;
      await apiPatchDesign(selectedDesign.id, { [field]: url } as any);
      await apiAddVersion(selectedDesign.id, editPrompt, url, 'ghost', activeView);
      await fetchDesigns();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setGeneratingView(null);
    }
  };

  // ── Download current render ───────────────────────────────────────────────
  const handleDownload = () => {
    if (!currentRenderUrl) return;
    const a = document.createElement('a');
    a.href = currentRenderUrl;
    a.download = `${selectedDesign?.name || 'render'}_${activeView}.jpg`;
    a.click();
  };

  const handleDeleteModel = async (modelId: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta modelo? No se puede deshacer.')) return;
    try {
      await fetch(`/api/models/${modelId}`, { method: 'DELETE' });
      if (selectedModelId === modelId) setSelectedModelId(null);
      await fetchModels();
    } catch (err: any) {
      alert('No se pudo eliminar: ' + err.message);
    }
  };

  const handleDeleteDesign = async (design: Design, e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    if (!window.confirm(`¿Eliminar "${design.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/designs/${design.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      if (selectedDesign?.id === design.id) setSelectedDesign(null);
      await fetchDesigns();
    } catch (err: any) {
      alert('No se pudo eliminar: ' + err.message);
    }
  };

  const resetCreationForm = () => {
    setNewDesignName('');
    setNewDesignPrompt('');
    setNewDesignCategory('Core');
    setSketchFile(null);
    setSketchPreview(null);
    setInspirationFile(null);
    setInspirationPreview(null);
  };

  const filteredDesigns = activeCategory === 'All'
    ? designs
    : designs.filter(d => d.category === activeCategory);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-[#F2F2F2] font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-[#222] flex items-center justify-between px-8 bg-[#0D0D0D] flex-shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-brand rounded-sm flex items-center justify-center text-black font-black text-xl italic shadow-[0_0_15px_rgba(224,255,0,0.3)]">
            S
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-medium tracking-tight uppercase">ALMEJA</h1>
            <span className="text-text-dim font-light italic text-sm capitalize">Studio v.3.0</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex gap-2">
            <span className="px-3 py-1 bg-bg-accent border border-border-secondary rounded-full text-[9px] uppercase tracking-widest text-text-muted">Gemini 2.0</span>
            <span className="px-3 py-1 bg-bg-accent border border-border-secondary rounded-full text-[9px] uppercase tracking-widest text-brand">Imagen 3 Activo</span>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-brand text-black px-6 py-2 rounded-full text-xs font-bold uppercase tracking-tighter hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg shadow-brand/10"
          >
            Nueva Referencia
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <motion.aside
          initial={false}
          animate={{ width: isSidebarOpen ? 240 : 80 }}
          className="border-r border-border-main flex flex-col bg-[#0D0D0D] flex-shrink-0 transition-all duration-300"
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
                  {isSidebarOpen && <span className={cn("text-[9px] px-1.5", activeCategory === 'All' ? "bg-border-secondary" : "bg-bg-accent")}>{designs.length}</span>}
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

        {/* Main content */}
        <main className="flex-1 bg-[#111] relative flex flex-col overflow-hidden">
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
                        <div className="w-full h-full flex flex-col items-center justify-center p-8 opacity-20 border-b border-border-main">
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
                            {[design.front_render_url, design.back_render_url, design.side_render_url, design.closeup_render_url].filter(Boolean).length} Vistas
                          </span>
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
              <span>Cola de Render: {generatingView || isGeneratingModel ? 'Procesando...' : 'Óptima'}</span>
            </div>
            <div className="text-[9px] text-[#333] font-mono italic">
              © ALMEJA STUDIO // NUCLEO_IA_V3.0
            </div>
          </footer>
        </main>
      </div>

      {/* ── Creation Modal ─────────────────────────────────────────────────── */}
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
                  <div className="mb-6 flex items-start gap-3 p-4 bg-red-950/30 border border-red-800/50 rounded">
                    <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-red-300 text-xs leading-relaxed">{errorMsg}</p>
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
                        Cargar Nueva Modelo
                      </button>
                    </label>
                    <input type="file" ref={modelInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'model')} accept="image/*" />
                    <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                      {models.map(m => (
                        <div key={m.id} className={cn("flex-shrink-0 relative group/model", selectedModelId === m.id ? "opacity-100" : "opacity-40 grayscale")}>
                          <button onClick={() => setSelectedModelId(m.id)}>
                            <div className={cn("w-12 h-12 rounded-full border-2 p-0.5 transition-all", selectedModelId === m.id ? "border-brand shadow-glow" : "border-border-secondary")}>
                              <img src={m.preview_url} className="w-full h-full object-cover rounded-full" alt={m.name} referrerPolicy="no-referrer" />
                            </div>
                          </button>
                          {selectedModelId === m.id && (
                            <div className="absolute -top-1 -right-1 bg-brand text-black rounded-full p-0.5">
                              <CheckCircle2 size={8} />
                            </div>
                          )}
                          <button
                            onClick={(e) => handleDeleteModel(m.id, e)}
                            className="absolute -bottom-1 -right-1 bg-red-900 text-red-300 rounded-full p-0.5 opacity-0 group-hover/model:opacity-100 transition-opacity"
                            title="Eliminar modelo"
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

                  <div className="grid grid-cols-2 gap-4">
                    <input type="file" ref={sketchInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'sketch')} accept="image/*,.pdf,.dxf,.ai,.svg" />
                    <input type="file" ref={inspirationInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'inspiration')} accept="image/*" />
                    <button
                      onClick={() => sketchInputRef.current?.click()}
                      className={cn("flex flex-col items-center justify-center p-6 border bg-bg-secondary group transition-all relative overflow-hidden",
                        sketchPreview ? "border-brand/60" : "border-border-main hover:border-brand/40")}
                    >
                      {sketchPreview ? (
                        <>
                          <img src={sketchPreview} className="absolute inset-0 w-full h-full object-cover opacity-30" />
                          <div className="relative z-10 flex flex-col items-center">
                            <CheckCircle2 size={18} className="text-brand mb-2" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">Boceto Cargado</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload size={18} className="text-text-muted group-hover:text-brand mb-2" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Boceto / CAD</span>
                          <span className="text-[8px] text-text-muted mt-1">PNG, JPG, PDF, AI, SVG</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => inspirationInputRef.current?.click()}
                      className={cn("flex flex-col items-center justify-center p-6 border bg-bg-secondary group transition-all relative overflow-hidden",
                        inspirationPreview ? "border-brand/60" : "border-border-main hover:border-brand/40")}
                    >
                      {inspirationPreview ? (
                        <>
                          <img src={inspirationPreview} className="absolute inset-0 w-full h-full object-cover opacity-30" />
                          <div className="relative z-10 flex flex-col items-center">
                            <CheckCircle2 size={18} className="text-brand mb-2" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">Inspiración Ok</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Eye size={18} className="text-text-muted group-hover:text-brand mb-2" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Inspiración</span>
                        </>
                      )}
                    </button>
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
                    {isProcessing ? (
                      <><Cpu size={14} className="animate-spin" /> Generando render...</>
                    ) : (
                      "Ejecutar Construcción"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Detail Panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedDesign && (
          <div className="fixed inset-0 z-[110] flex justify-end">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-5xl bg-bg-main h-full shadow-2xl flex relative"
            >
              <button
                onClick={() => { setSelectedDesign(null); setErrorMsg(null); }}
                className="absolute left-[-60px] top-4 p-4 bg-bg-secondary border border-border-main text-text-muted hover:text-red-500 rounded-sm transition-all z-[120]"
              >
                <X size={24} />
              </button>

              {/* Viewport */}
              <div className="flex-1 h-full bg-[#0F0F0F] relative overflow-hidden flex items-center justify-center border-r border-border-main">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1A1A1A_0%,#0A0A0A_100%)] opacity-50" />

                {errorMsg && (
                  <div className="absolute top-4 left-4 right-4 z-30 flex items-start gap-3 p-4 bg-red-950/80 border border-red-800/50 rounded backdrop-blur">
                    <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-red-300 text-xs leading-relaxed">{errorMsg}</p>
                    <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-white"><X size={12} /></button>
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
                        <p className="text-text-muted text-sm italic">Generando vista {VIEW_LABELS[activeView]}...</p>
                      </>
                    ) : (
                      <>
                        <div className="w-24 h-[1px] bg-brand mx-auto mb-8 bg-gradient-to-r from-transparent via-brand to-transparent"></div>
                        <h3 className="text-3xl font-serif italic text-white mb-4 tracking-tight">Vista no generada</h3>
                        <p className="text-text-muted text-sm leading-relaxed mb-8 font-light italic">
                          La vista {VIEW_LABELS[activeView]} aún no ha sido sintetizada.
                        </p>
                        <button
                          onClick={() => handleGenerateView(activeView)}
                          disabled={!!generatingView}
                          className="bg-brand text-black px-10 py-3 text-[10px] uppercase tracking-[0.2em] font-black hover:bg-white transition-all flex items-center justify-center gap-2 mx-auto"
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

                {/* Top right badge */}
                <div className="absolute top-8 right-8 flex flex-col gap-3 z-20">
                  <span className="text-[8px] bg-brand text-black font-black uppercase tracking-widest px-2 py-1">
                    {selectedDesign.view_mode === 'model' ? 'MODELO' : 'GHOST'}
                  </span>
                </div>

                {/* Bottom right actions */}
                <div className="absolute bottom-8 right-8 flex gap-3 z-20">
                  <button
                    onClick={handleDownload}
                    disabled={!currentRenderUrl}
                    title="Descargar render"
                    className="p-4 bg-bg-secondary/80 backdrop-blur border border-border-main text-white hover:border-brand transition-all disabled:opacity-30"
                  >
                    <Download size={18} />
                  </button>
                </div>

                {/* View tabs */}
                <div className="absolute bottom-8 left-8 z-20">
                  <div className="flex bg-black/60 backdrop-blur border border-border-secondary p-1 rounded-sm overflow-hidden shadow-2xl">
                    {(['front', 'back', 'side', 'closeup'] as ViewType[]).map((v) => {
                      const exists = !!getRenderUrl(selectedDesign, v);
                      const isActive = activeView === v;
                      const isLoading = generatingView === v;
                      return (
                        <button
                          key={v}
                          onClick={() => {
                            setActiveView(v);
                            if (!exists && !generatingView) handleGenerateView(v);
                          }}
                          className={cn(
                            "px-4 py-2 text-[9px] uppercase transition-colors border-l border-border-secondary first:border-l-0 flex items-center gap-1.5",
                            isActive ? "bg-brand text-black font-black" : "text-text-muted hover:text-white"
                          )}
                        >
                          {isLoading && <Cpu size={8} className="animate-spin" />}
                          {VIEW_LABELS[v]}
                          {!exists && !isLoading && <span className="w-1 h-1 rounded-full bg-text-muted/50 inline-block" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Controls panel */}
              <div className="w-80 p-10 overflow-y-auto bg-bg-secondary custom-scrollbar">
                <div className="mb-10">
                  <p className="text-[9px] text-text-dim uppercase tracking-[0.3em] font-black italic mb-3">Expediente de Proyecto</p>
                  <h2 className="text-3xl font-serif italic text-white tracking-tight leading-tight">{selectedDesign.name}</h2>
                  <div className="mt-4 flex gap-2">
                    <span className="text-[8px] px-2 py-0.5 border border-border-secondary text-text-muted uppercase tracking-widest">{selectedDesign.category}</span>
                    <span className="text-[8px] px-2 py-0.5 border border-brand text-brand uppercase tracking-widest">Referencia Maestra</span>
                  </div>
                </div>

                <div className="space-y-10">
                  {/* Prompt / Modify */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-4 flex items-center gap-2">
                      Descripción de Prenda
                      <Sparkles size={10} className="text-brand" />
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
                            className="flex-1 bg-brand text-black py-2 text-[9px] uppercase tracking-widest font-black hover:bg-white transition-all flex items-center justify-center gap-1"
                          >
                            <RefreshCw size={10} />
                            Re-sintetizar
                          </button>
                          <button onClick={() => setIsEditingPrompt(false)} className="px-3 py-2 border border-border-main text-text-muted text-[9px] hover:text-white">
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="p-5 bg-bg-main border border-border-main italic text-xs leading-relaxed text-text-dim cursor-pointer hover:border-brand/40 transition-colors group"
                        onClick={() => setIsEditingPrompt(true)}
                      >
                        <p>"{selectedDesign.prompt || 'Sin descripción.'}"</p>
                        <p className="text-[8px] text-brand/50 uppercase tracking-widest mt-3 group-hover:text-brand transition-colors">Clic para modificar y re-sintetizar</p>
                      </div>
                    )}
                  </section>

                  {/* Fabric selector */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-4 italic">Propiedades del Material</h5>
                    <div className="grid grid-cols-4 gap-2">
                      {fabrics.map((fabric) => (
                        <button
                          key={fabric.id}
                          onClick={() => setSelectedFabric(fabric)}
                          className={cn("aspect-square p-0.5 border transition-all relative group",
                            selectedFabric?.id === fabric.id ? "border-brand" : "border-border-main hover:border-text-muted")}
                        >
                          <div className="w-full h-full shadow-inner" style={{ backgroundColor: fabric.color }} />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-[6px] text-white uppercase font-black text-center px-1">{fabric.finish}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    {selectedFabric && (
                      <div className="mt-4 space-y-3">
                        <div className="flex justify-between items-baseline">
                          <p className="text-[9px] text-text-main font-bold tracking-wider uppercase">{selectedFabric.name}</p>
                          <p className="text-[8px] text-text-muted italic">{selectedFabric.material}</p>
                        </div>
                        <div className="space-y-1.5">
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
                      </div>
                    )}
                  </section>

                  {/* Model identity */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-4 italic">Mapeo de Identidad Oficial</h5>
                    <div className="flex gap-6 overflow-x-auto pb-2 custom-scrollbar">
                      {models.map((model) => (
                        <div
                          key={model.id}
                          className={cn("group/det flex flex-col items-center flex-shrink-0 transition-opacity relative",
                            selectedDesign.model_id === model.id ? "opacity-100" : "opacity-30")}
                        >
                          <div className={cn("w-16 h-16 rounded-full border-2 bg-bg-main p-1 mb-2 relative",
                            selectedDesign.model_id === model.id ? "border-brand shadow-glow" : "border-border-secondary")}>
                            <img src={model.preview_url} className="w-full h-full object-cover rounded-full" alt={model.name} referrerPolicy="no-referrer" />
                            <button
                              onClick={(e) => handleDeleteModel(model.id, e)}
                              className="absolute -top-1 -right-1 bg-red-900 text-red-300 rounded-full p-0.5 opacity-0 group-hover/det:opacity-100 transition-opacity"
                              title="Eliminar modelo"
                            >
                              <X size={8} />
                            </button>
                          </div>
                          <p className="text-[8px] text-center text-text-main font-bold">{model.name}</p>
                          {selectedDesign.model_id === model.id && (
                            <p className="text-[6px] text-center text-brand uppercase tracking-tighter mt-1 font-black underline">Identidad Maestra</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Version history */}
                  <section>
                    <h5 className="text-[9px] text-text-muted uppercase tracking-[0.3em] font-black mb-4 italic">Historial de Versiones</h5>
                    <div className="space-y-2">
                      {designVersions.map((v) => (
                        <div
                          key={v.id}
                          onClick={() => {
                            if (v.image_url) {
                              setActiveView(v.view || 'front');
                            }
                          }}
                          className="flex items-center justify-between p-3 bg-bg-main border border-border-main hover:border-brand/50 cursor-pointer group transition-all"
                        >
                          {v.image_url && (
                            <img src={v.image_url} className="w-8 h-10 object-cover flex-shrink-0 mr-3" alt="" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-[10px] font-mono text-brand">V{v.version_number}</div>
                              <div className="text-[8px] text-text-dim uppercase tracking-tighter">{v.view || 'front'}</div>
                            </div>
                            <div className="text-[7px] text-text-muted">{new Date(v.created_at).toLocaleDateString()}</div>
                          </div>
                          <History size={12} className="text-text-muted group-hover:text-brand flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Actions */}
                  <div className="pt-4 space-y-3">
                    {/* Ghost / Model toggle */}
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
                        {isGeneratingModel ? <><Cpu size={10} className="animate-spin" /> Generando...</> : <><Shirt size={10} /> Con Modelo</>}
                      </button>
                    </div>

                    {/* Environment selector (only shown in model mode or when generating) */}
                    {selectedDesign.view_mode === 'model' || isGeneratingModel ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setModelEnvironment('studio')}
                          className={cn("flex-1 py-2 text-[8px] uppercase tracking-widest border transition-all",
                            modelEnvironment === 'studio' ? "border-brand text-brand" : "border-border-main text-text-muted hover:text-white")}
                        >
                          Estudio
                        </button>
                        <button
                          onClick={() => setModelEnvironment('outdoor')}
                          className={cn("flex-1 py-2 text-[8px] uppercase tracking-widest border transition-all",
                            modelEnvironment === 'outdoor' ? "border-brand text-brand" : "border-border-main text-text-muted hover:text-white")}
                        >
                          Ambiente
                        </button>
                        {selectedDesign.view_mode === 'model' && (
                          <button
                            onClick={handleGenerateModelRender}
                            disabled={isGeneratingModel}
                            className="px-3 py-2 bg-brand text-black text-[8px] uppercase font-black hover:bg-white transition-all disabled:opacity-50"
                            title="Regenerar con ambiente seleccionado"
                          >
                            <RefreshCw size={10} />
                          </button>
                        )}
                      </div>
                    ) : null}

                    {/* Reference images */}
                    {(selectedDesign.technical_sketch_url || selectedDesign.inspiration_url) && (
                      <div className="flex gap-2">
                        {selectedDesign.technical_sketch_url && (
                          <a href={selectedDesign.technical_sketch_url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-main text-text-muted text-[8px] uppercase hover:border-brand hover:text-brand transition-all">
                            <ImagePlus size={10} /> Boceto original
                          </a>
                        )}
                        {selectedDesign.inspiration_url && (
                          <a href={selectedDesign.inspiration_url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-main text-text-muted text-[8px] uppercase hover:border-brand hover:text-brand transition-all">
                            <Eye size={10} /> Inspiración
                          </a>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleDownload}
                      disabled={!currentRenderUrl}
                      className="w-full bg-bg-accent border border-border-secondary text-text-main py-4 text-[10px] uppercase tracking-[0.2em] font-black hover:bg-brand hover:text-black transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                      <Download size={12} />
                      Exportar Render
                    </button>
                    <button
                      onClick={(e) => handleDeleteDesign(selectedDesign, e)}
                      className="w-full border border-red-900/50 text-red-500/70 py-3 text-[10px] uppercase tracking-[0.2em] font-black hover:bg-red-950/40 hover:text-red-400 hover:border-red-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={12} />
                      Eliminar Referencia
                    </button>
                    <p className="text-center text-[8px] text-text-muted italic tracking-widest uppercase">Cifrado activo // SHA-256</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 2px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0A0A0A; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #222; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #E0FF00; }
      `}</style>
    </div>
  );
}
