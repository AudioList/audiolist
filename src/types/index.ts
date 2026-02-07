export type CategoryId =
  | 'iem' | 'headphone' | 'dac' | 'amp' | 'speaker' | 'cable' | 'dap' | 'microphone'
  | 'iem_tips' | 'iem_cable' | 'iem_filter' | 'hp_pads' | 'hp_cable';

export type TargetType = 'df' | 'harman';

export interface Category {
  id: CategoryId;
  name: string;
  sort_order: number;
  icon: string;
  has_ppi: boolean;
  parent_category: CategoryId | null;
}

export interface Product {
  id: string;
  source_id: string | null;
  category_id: CategoryId;
  name: string;
  brand: string | null;
  price: number | null;
  image_url: string | null;
  affiliate_url: string | null;
  ppi_score: number | null;
  ppi_stdev: number | null;
  ppi_slope: number | null;
  ppi_avg_error: number | null;
  source_domain: string | null;
  rig_type: string | null;
  pinna: string | null;
  quality: string | null;
  specs: Record<string, unknown>;
  product_family_id: string | null;
  variant_type: string | null;
  variant_value: string | null;
  source_type: string | null;
  in_stock: boolean;
  first_seen: string | null;
  // Spinorama fields (speakers)
  pref_score: number | null;
  pref_score_wsub: number | null;
  lfx_hz: number | null;
  nbd_on_axis: number | null;
  sm_pred_in_room: number | null;
  speaker_type: string | null;
  spinorama_origin: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductFamily {
  id: string;
  canonical_name: string;
  base_product_id: string | null;
  category_id: CategoryId;
  created_at: string;
}

export type VariantType = 'pads' | 'tips' | 'apex' | 'nozzle' | 'dsp' | 'cable' | 'sample' | 'fit';

export interface Build {
  id: string;
  share_code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface BuildItem {
  id: string;
  build_id: string;
  category_id: CategoryId;
  product_id: string;
  custom_price: number | null;
  quantity: number;
  product?: Product;
}

export interface BuildSelection {
  category_id: CategoryId;
  product: Product;
  custom_price?: number;
  quantity: number;
}

export type SortField = 'ppi_score' | 'price' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface ProductFilters {
  search: string;
  brands: string[];
  priceMin: number | null;
  priceMax: number | null;
  ppiMin: number | null;
  ppiMax: number | null;
  quality: string | null;
  rigType: string | null;
  retailers: string[];
  hideOutOfStock: boolean;
}

export interface ProductSort {
  field: SortField;
  direction: SortDirection;
}

export interface Retailer {
  id: string;
  name: string;
  base_url: string;
  is_active: boolean;
}

export interface PriceListing {
  id: string;
  product_id: string;
  retailer_id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  product_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  last_checked: string;
  retailer?: Retailer;
}
