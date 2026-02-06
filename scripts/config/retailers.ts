import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://sycfaajrlnkyczrauusx.supabase.co";

export type Retailer = {
  id: string;
  name: string;
  base_url: string;
  shop_domain: string;
  api_type: string;
  affiliate_tag: string | null;
  affiliate_url_template: string | null;
  is_active: boolean;
};

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_KEY environment variable"
    );
  }

  supabaseInstance = createClient(SUPABASE_URL, serviceKey);
  return supabaseInstance;
}

export async function getRetailers(): Promise<Retailer[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("retailers")
    .select(
      "id, name, base_url, shop_domain, api_type, affiliate_tag, affiliate_url_template, is_active"
    )
    .eq("is_active", true);

  if (error) {
    console.log(`Error fetching retailers: ${error.message}`);
    return [];
  }

  return (data ?? []) as Retailer[];
}

export function buildAffiliateUrl(
  retailer: Retailer,
  productUrl: string,
  handle: string,
  externalId?: string
): string | null {
  const template = retailer.affiliate_url_template;
  if (!template) return null;

  let url = template
    .replace("{product_url}", productUrl)
    .replace("{handle}", handle)
    .replace("{base_url}", retailer.base_url);

  if (externalId !== undefined) {
    url = url.replace("{external_id}", externalId);
  } else {
    url = url.replace("{external_id}", "");
  }

  return url;
}
