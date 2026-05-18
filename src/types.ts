export type DesignStatus = 'sketch' | 'draft' | 'rendered';

export type ViewType = 'front' | 'back' | 'side' | 'closeup';

export interface DesignVersion {
  id: string;
  design_id: string;
  version_number: number;
  prompt: string;
  image_url: string;
  type: 'ghost' | 'model' | 'variant' | 'edit';
  view: ViewType;
  created_at: string;
}

export interface Model {
  id: string;
  name: string;
  preview_url: string;
}

export interface Design {
  id: string;
  name: string;
  category: string;
  status: DesignStatus;
  technical_sketch_url?: string;
  inspiration_url?: string;
  sketch_urls?: string;      // JSON array of multiple sketch/CAD URLs
  inspiration_urls?: string; // JSON array of multiple inspiration URLs
  render_url?: string;
  // Ghost renders (siempre studio, fondo blanco)
  front_render_url?: string;
  back_render_url?: string;
  side_render_url?: string;
  closeup_render_url?: string;
  // Legacy (compatibilidad hacia atrás)
  model_render_url?: string;
  // Model renders - Studio, por vista
  model_front_render_url?: string;
  model_back_render_url?: string;
  model_side_render_url?: string;
  model_closeup_render_url?: string;
  // Model renders - Outdoor, por vista
  outdoor_model_front_render_url?: string;
  outdoor_model_back_render_url?: string;
  outdoor_model_side_render_url?: string;
  outdoor_model_closeup_render_url?: string;
  prompt?: string;
  model_id?: string;
  view_mode: 'ghost' | 'model';
  created_at: string;
}

export interface Fabric {
  id: string;
  name: string;
  material: string;
  color: string;
  texture_url?: string;
  normal_map_url?: string;
  roughness_map_url?: string;
  elasticity: number;
  finish: 'mate' | 'brillante' | 'satinado' | 'texturizado';
  file_url?: string;
  is_custom?: number;
}

export type Category = 'Core' | 'Moda' | 'Natación Deportiva' | 'Bodies' | 'Resort' | 'Activewear';
