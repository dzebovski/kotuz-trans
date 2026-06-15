import { getSupabaseAdmin } from "./supabase-admin";

export type VehicleRecord = {
  id: string;
  wialon_unit_id: number;
  display_name: string;
  tractor_number: string;
  trailer_number: string | null;
  is_active: boolean;
};

export async function listActiveVehicles(): Promise<VehicleRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("vehicles")
    .select("id,wialon_unit_id,display_name,tractor_number,trailer_number,is_active")
    .eq("is_active", true)
    .order("wialon_unit_id");

  if (error) {
    throw new Error(`Failed to load vehicles: ${error.message}`);
  }
  return (data ?? []) as VehicleRecord[];
}
