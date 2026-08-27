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
export type PaymentMethod = "cash" | "card" | "instapay" | "agel";

// how a discount was taken off the taxed total. null means none.
export type DiscountKind = "percent" | "fixed";

// cash/card/instapay only - never agel. used when collecting a debt.
export type SettlePaymentMethod = "cash" | "card" | "instapay";
export type OrderType = "takeaway" | "dine_in" | "talabat";
export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type WasteReason =
  | "burnt"
  | "dropped"
  | "expired"
  | "spoiled"
  | "remake"
  | "other";

export type InventoryUnit = "g" | "ml" | "pcs";

export type Profile = {
  id: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  // a retired category keeps its row so old products still resolve, but stops
  // appearing on the till, the qr menu and the admin picker
  is_active: boolean;
  created_at: string;
};

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  base_price: number;
  is_available: boolean;
  sort_order: number;
  // the cuisine colour, kept on the product now that the seven cuisines are no
  // longer categories in their own right
  color: string | null;
  // dunkin-style pack: how many flavors the cashier must pick. null = normal item
  piece_count: number | null;
  // category those flavors come from (e.g. desserts for a box of six)
  contents_category_id: string | null;
  created_at: string;
};

// one flavor packed into a sold box. price is not here - the box has one price
export type BoxContent = {
  id: string;
  name: string;
  quantity: number;
};

export type Modifier = {
  id: string;
  // null means this extra is offered on every product
  product_id: string | null;
  name: string;
  extra_price: number;
  is_active: boolean;
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
  // what the customer paid, tax and all. every report, shift count and drawer
  // reconciliation sums this one column and none of them need to know whether
  // there was tax in it.
  total_amount: number;
  // the tax snapshot. what was charged on THIS sale, frozen at checkout, so a
  // rate the owner changes next month cannot re-price a receipt a customer is
  // already holding. same reason order_items.product_name is a copy.
  // optional: sales rung before the tax migration do not carry them.
  subtotal_amount?: number | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  tax_label?: string | null;
  // discount after tax. optional on sales from before this existed.
  discount_kind?: DiscountKind | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  is_diyafa?: boolean;
  diyafa_reason?: string | null;
  // agel settle: null settled_at means still owing
  agel_settled_at?: string | null;
  agel_settled_by?: string | null;
  agel_settled_payment_method?: SettlePaymentMethod | null;
  payment_method: PaymentMethod | null;
  order_type: OrderType;
  status: OrderStatus;
  notes: string | null;
  created_by: string | null;
  // the cashier's name as it stood when the sale was rung. snapshotted like
  // order_items.product_name so an old receipt still names the right person
  // after a rename, and so an offline receipt can print it with no join.
  // optional like the ticket fields: sales already sitting on a tablet from
  // before this column existed do not have it.
  created_by_name?: string | null;
  // the till session this sale belongs to. null on sales rung before shifts
  // existed, and on a sale that reached the tablet with no shift open.
  shift_id?: string | null;
  // what the customer gave, if they gave it. both optional - see the migration
  customer_name?: string | null;
  customer_phone?: string | null;
  // true after bom deduct ran for this order
  stock_deducted: boolean;
  // visible number resets every Egypt business day
  ticket_date?: string;
  ticket_number?: number;
  created_at: string;
  updated_at: string;
};

// one person's turn on the till, from taking the drawer to counting it back
export type Shift = {
  id: string;
  opened_by: string | null;
  opened_by_name: string;
  opened_at: string;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  opening_float: number;
  // null until the shift is closed, so "closed without counting" is its own
  // state rather than looking like a drawer counted at zero
  counted_cash: number | null;
  notes: string | null;
  created_at: string;
};

export type InventoryMode = "finished_goods" | "ingredients";

// added: menu prices are before tax and it goes on top of the bill.
// included: menu prices already contain it and the receipt shows the split.
export type TaxMode = "added" | "included";

export type AppSettings = {
  id: string;
  kds_enabled: boolean;
  inventory_mode: InventoryMode;
  receipt_copies: number;
  // the live tax rule - what the NEXT sale is charged. what a sale that has
  // already happened was charged lives on the order itself. optional because
  // the till has to keep ringing against a database where the tax migration
  // has not been applied yet.
  tax_enabled?: boolean;
  tax_label?: string;
  // percent, not a fraction. 14 means 14%.
  tax_rate?: number;
  tax_mode?: TaxMode;
  updated_at: string;
};

export type ProductStock = {
  product_id: string;
  current_stock: number;
  min_threshold: number;
  updated_at: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  unit: InventoryUnit;
  current_stock: number;
  min_threshold: number;
  created_at: string;
};

export type Recipe = {
  id: string;
  product_id: string;
  inventory_item_id: string;
  quantity_required: number;
  created_at: string;
};

export type ModifierRecipe = {
  id: string;
  modifier_id: string;
  inventory_item_id: string;
  quantity_required: number;
  created_at: string;
};

export type WasteLog = {
  id: string;
  inventory_item_id: string;
  quantity: number;
  reason: WasteReason;
  notes: string | null;
  logged_by: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  selected_modifiers: SelectedModifier[];
  // flavors packed into this line when the product is a box
  box_contents: BoxContent[];
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
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          role?: UserRole;
          is_active?: boolean;
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
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string | null;
          color?: string | null;
          sort_order?: number;
          is_active?: boolean;
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
          color?: string | null;
          piece_count?: number | null;
          contents_category_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string | null;
          name?: string;
          base_price?: number;
          is_available?: boolean;
          sort_order?: number;
          color?: string | null;
          piece_count?: number | null;
          contents_category_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      modifiers: {
        Row: Modifier;
        Insert: {
          id?: string;
          product_id?: string | null;
          name: string;
          extra_price?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string | null;
          name?: string;
          extra_price?: number;
          is_active?: boolean;
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
          subtotal_amount?: number | null;
          tax_amount?: number | null;
          tax_rate?: number | null;
          tax_label?: string | null;
          discount_kind?: DiscountKind | null;
          discount_value?: number | null;
          discount_amount?: number | null;
          is_diyafa?: boolean;
          diyafa_reason?: string | null;
          agel_settled_at?: string | null;
          agel_settled_by?: string | null;
          agel_settled_payment_method?: SettlePaymentMethod | null;
          payment_method?: PaymentMethod | null;
          order_type?: OrderType;
          status?: OrderStatus;
          notes?: string | null;
          created_by?: string | null;
          created_by_name?: string | null;
          shift_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          stock_deducted?: boolean;
          ticket_date?: string;
          ticket_number?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string | null;
          total_amount?: number;
          subtotal_amount?: number | null;
          tax_amount?: number | null;
          tax_rate?: number | null;
          tax_label?: string | null;
          discount_kind?: DiscountKind | null;
          discount_value?: number | null;
          discount_amount?: number | null;
          is_diyafa?: boolean;
          diyafa_reason?: string | null;
          agel_settled_at?: string | null;
          agel_settled_by?: string | null;
          agel_settled_payment_method?: SettlePaymentMethod | null;
          payment_method?: PaymentMethod | null;
          order_type?: OrderType;
          status?: OrderStatus;
          notes?: string | null;
          created_by?: string | null;
          created_by_name?: string | null;
          shift_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          stock_deducted?: boolean;
          ticket_date?: string;
          ticket_number?: number;
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
          box_contents?: BoxContent[];
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
          box_contents?: BoxContent[];
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: InventoryItem;
        Insert: {
          id?: string;
          name: string;
          unit: InventoryUnit;
          current_stock?: number;
          min_threshold?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          unit?: InventoryUnit;
          current_stock?: number;
          min_threshold?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: Recipe;
        Insert: {
          id?: string;
          product_id: string;
          inventory_item_id: string;
          quantity_required: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          inventory_item_id?: string;
          quantity_required?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      modifier_recipes: {
        Row: ModifierRecipe;
        Insert: {
          id?: string;
          modifier_id: string;
          inventory_item_id: string;
          quantity_required: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          modifier_id?: string;
          inventory_item_id?: string;
          quantity_required?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      waste_logs: {
        Row: WasteLog;
        Insert: {
          id?: string;
          inventory_item_id: string;
          quantity: number;
          reason: WasteReason;
          notes?: string | null;
          logged_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          inventory_item_id?: string;
          quantity?: number;
          reason?: WasteReason;
          notes?: string | null;
          logged_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      shifts: {
        Row: Shift;
        Insert: {
          id?: string;
          opened_by?: string | null;
          opened_by_name: string;
          opened_at?: string;
          closed_by?: string | null;
          closed_by_name?: string | null;
          closed_at?: string | null;
          opening_float?: number;
          counted_cash?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          opened_by?: string | null;
          opened_by_name?: string;
          opened_at?: string;
          closed_by?: string | null;
          closed_by_name?: string | null;
          closed_at?: string | null;
          opening_float?: number;
          counted_cash?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: AppSettings;
        Insert: {
          id: string;
          kds_enabled?: boolean;
          inventory_mode?: InventoryMode;
          receipt_copies?: number;
          tax_enabled?: boolean;
          tax_label?: string;
          tax_rate?: number;
          tax_mode?: TaxMode;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kds_enabled?: boolean;
          inventory_mode?: InventoryMode;
          receipt_copies?: number;
          tax_enabled?: boolean;
          tax_label?: string;
          tax_rate?: number;
          tax_mode?: TaxMode;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_stock: {
        Row: ProductStock;
        Insert: {
          product_id: string;
          current_stock?: number;
          min_threshold?: number;
          updated_at?: string;
        };
        Update: {
          product_id?: string;
          current_stock?: number;
          min_threshold?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      daily_ticket_counters: {
        Row: {
          business_date: string;
          next_number: number;
        };
        Insert: {
          business_date: string;
          next_number: number;
        };
        Update: {
          business_date?: string;
          next_number?: number;
        };
        Relationships: [];
      };
      product_waste_logs: {
        Row: {
          id: string;
          product_id: string;
          quantity: number;
          reason: WasteReason;
          notes: string | null;
          logged_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          quantity: number;
          reason: WasteReason;
          notes?: string | null;
          logged_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          quantity?: number;
          reason?: WasteReason;
          notes?: string | null;
          logged_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      deduct_stock_for_order: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      return_stock_for_order: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      allocate_ticket_number: {
        Args: {
          p_ticket_date?: string;
          p_requested_number?: number | null;
        };
        Returns: number;
      };
      receive_product_stock: {
        Args: { p_product_id: string; p_add_quantity: number };
        Returns: Json;
      };
      set_product_stock_threshold: {
        Args: { p_product_id: string; p_min_threshold: number };
        Returns: Json;
      };
      log_product_waste_and_deduct: {
        Args: {
          p_product_id: string;
          p_quantity: number;
          p_reason: WasteReason;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      restock_inventory_item: {
        Args: { p_item_id: string; p_add_quantity: number };
        Returns: Json;
      };
      log_waste_and_deduct: {
        Args: {
          p_inventory_item_id: string;
          p_quantity: number;
          p_reason: WasteReason;
          p_notes?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRole;
      payment_method: PaymentMethod;
      order_type: OrderType;
      order_status: OrderStatus;
      waste_reason: WasteReason;
    };
    CompositeTypes: Record<string, never>;
  };
};
