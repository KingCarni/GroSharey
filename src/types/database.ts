export type HouseholdRole = 'owner' | 'member';
export type MembershipStatus = 'active' | 'invited' | 'removed' | 'left';
export type ShoppingSessionStatus = 'active' | 'completed' | 'cancelled';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Household {
  id: string;
  name: string;
  created_by: string;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GroceryList {
  id: string;
  household_id: string;
  name: string;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GroceryItem {
  id: string;
  list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  brand: string | null;
  category: string | null;
  notes: string | null;
  position: number;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ShoppingSession {
  id: string;
  household_id: string;
  list_id: string;
  shopper_id: string;
  store_name: string | null;
  status: ShoppingSessionStatus;
  started_at: string;
  ended_at: string | null;
}
