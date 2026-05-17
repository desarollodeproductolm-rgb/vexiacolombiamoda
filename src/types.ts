export type DesignStatus = 'sketch' | 'draft' | 'rendered';

export type ViewType = 'front' | 'back' | 'side' | 'closeup';

export interface DesignVersion {
  id: string;
  design_id: string;
  version_number: number;
  prompt: string;
  image_url: string;
  type: 'ghost' | 'model';
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
  render_url?: string;
  front_render_url?: string;
  back_render_url?: string;
  side_render_url?: string;
  closeup_render_url?: string;
  model_render_url?: string;
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
  texture_url: string;
  normal_map_url?: string;
  roughness_map_url?: string;
  elasticity: number;
  finish: 'mate' | 'brillante' | 'satinado' | 'texturizado';
}

export type Category = 'Core' | 'Moda' | 'Natación Deportiva' | 'Bodies' | 'Resort' | 'Activewear';
