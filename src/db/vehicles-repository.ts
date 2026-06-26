import { getSupabaseAdmin } from "./supabase-admin";

export type VehicleRecord = {
  id: string;
  wialon_unit_id: number;
  display_name: string;
  tractor_number: string;
  trailer_number: string | null;
  consumption_tier: 30 | 32 | null;
  is_active: boolean;
};

export async function listActiveVehicles(): Promise<VehicleRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("vehicles")
    .select(
      "id,wialon_unit_id,display_name,tractor_number,trailer_number,consumption_tier,is_active",
    )
    .eq("is_active", true)
    .order("wialon_unit_id");

  if (error) {
    throw new Error(`Failed to load vehicles: ${error.message}`);
  }
  return (data ?? []) as VehicleRecord[];
}

export async function listVehiclesByIds(ids: string[]): Promise<VehicleRecord[]> {
  if (ids.length === 0) {
    return [];
  }
  const { data, error } = await getSupabaseAdmin()
    .from("vehicles")
    .select(
      "id,wialon_unit_id,display_name,tractor_number,trailer_number,consumption_tier,is_active",
    )
    .in("id", ids)
    .order("wialon_unit_id");
  if (error) {
    throw new Error(`Failed to load vehicles by id: ${error.message}`);
  }
  return (data ?? []) as VehicleRecord[];
}

export async function getVehicleById(
  id: string,
): Promise<VehicleRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("vehicles")
    .select(
      "id,wialon_unit_id,display_name,tractor_number,trailer_number,consumption_tier,is_active",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load vehicle: ${error.message}`);
  }
  return (data as VehicleRecord | null) ?? null;
}
