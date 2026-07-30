// hand-written types for phase 1 tables
// later we can replace this with supabase generated types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "cashier" | "kitchen";
export type PaymentMethod = "cash" | "card" | "instapay";
export type OrderType = "takeaway" | "dine_in" | "talabat";
export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type Profile = {
  id: string;
  name: string;
  role: UserRole;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
};

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  base_price: number;
  is_available: boolean;
  sort_order: number;
  created_at: string;
};

export type Modifier = {
  id: string;
  product_id: string;
  name: string;
  extra_price: number;
  created_at: string;
};

// one chosen modifier saved on an order line
export type SelectedModifier = {
  id: string;
  name: string;
  extra_price: number;
};

export type Order = {
  id: string;
  // used later for offline sync
  client_id: string | null;
  total_amount: number;
  payment_method: PaymentMethod | null;
  order_type: OrderType;
  status: OrderStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  selected_modifiers: SelectedModifier[];
  notes: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          name: string;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: {
          id?: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string | null;
          color?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: {
          id?: string;
          category_id?: string | null;
          name: string;
          base_price: number;
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string | null;
          name?: string;
          base_price?: number;
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      modifiers: {
        Row: Modifier;
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          extra_price?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: string;
          extra_price?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: Order;
        Insert: {
          id?: string;
          client_id?: string | null;
          total_amount?: number;
          payment_method?: PaymentMethod | null;
          order_type?: OrderType;
          status?: OrderStatus;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string | null;
          total_amount?: number;
          payment_method?: PaymentMethod | null;
          order_type?: OrderType;
          status?: OrderStatus;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: OrderItem;
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity?: number;
          unit_price: number;
          selected_modifiers?: SelectedModifier[];
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit_price?: number;
          selected_modifiers?: SelectedModifier[];
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      payment_method: PaymentMethod;
      order_type: OrderType;
      order_status: OrderStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
