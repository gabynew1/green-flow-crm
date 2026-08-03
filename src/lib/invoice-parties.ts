import { supabase } from "@/integrations/supabase/client";

/**
 * Fiscal / contact details live on `profiles` (single source of truth),
 * not on `tenants` / `customers`. These helpers read them from there.
 */
export type PartyInfo = {
  name: string | null;
  company_name: string | null;
  cui: string | null;
  cnp: string | null;
  vat_id: string | null;
  address_city: string | null;
  address_street: string | null;
  address_number: string | null;
  email: string | null;
  phone: string | null;
};

const EMPTY: PartyInfo = {
  name: null, company_name: null, cui: null, cnp: null, vat_id: null,
  address_city: null, address_street: null, address_number: null,
  email: null, phone: null,
};

const FISCAL_COLS =
  "full_name, company_name, cui, cnp, vat_id, address_city, address_street, address_number, contact_email, contact_phone, email, phone";

const fromProfile = (p: any, fallbackName: string | null): PartyInfo => ({
  name: p?.company_name || p?.full_name || fallbackName,
  company_name: p?.company_name ?? null,
  cui: p?.cui ?? null,
  cnp: p?.cnp ?? null,
  vat_id: p?.vat_id ?? null,
  address_city: p?.address_city ?? null,
  address_street: p?.address_street ?? null,
  address_number: p?.address_number ?? null,
  email: p?.contact_email || p?.email || null,
  phone: p?.contact_phone || p?.phone || null,
});

/** Seller = the provider workspace owner profile for this tenant. */
export async function fetchSellerParty(tenantId: string | null | undefined): Promise<PartyInfo> {
  if (!tenantId) return EMPTY;
  const [{ data: t }, { data: p }] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    supabase
      .from("profiles")
      .select(FISCAL_COLS)
      .eq("tenant_id", tenantId)
      .is("customer_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return fromProfile(p, (t as any)?.name ?? null);
}

/** Buyer = the client profile linked to this customer record. */
export async function fetchBuyerParty(customerId: string | null | undefined): Promise<PartyInfo> {
  if (!customerId) return EMPTY;
  const [{ data: c }, { data: p }] = await Promise.all([
    supabase.from("customers").select("name, company_name, email, phone").eq("id", customerId).maybeSingle(),
    supabase
      .from("profiles")
      .select(FISCAL_COLS)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const base = fromProfile(p, (c as any)?.company_name || (c as any)?.name || null);
  return {
    ...base,
    company_name: base.company_name ?? (c as any)?.company_name ?? null,
    email: base.email ?? (c as any)?.email ?? null,
    phone: base.phone ?? (c as any)?.phone ?? null,
  };
}
