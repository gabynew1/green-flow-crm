export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          created_at: string
          created_by: string | null
          event_description: string
          event_type: string
          id: string
          property_id: string
          related_entity_id: string | null
          related_entity_type: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_description: string
          event_type: string
          id?: string
          property_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_description?: string
          event_type?: string
          id?: string
          property_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      client_connections: {
        Row: {
          client_user_id: string
          id: string
          provider_name: string | null
          requested_at: string
          requested_by: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["connection_status"]
          tenant_id: string
        }
        Insert: {
          client_user_id: string
          id?: string
          provider_name?: string | null
          requested_at?: string
          requested_by?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          tenant_id: string
        }
        Update: {
          client_user_id?: string
          id?: string
          provider_name?: string | null
          requested_at?: string
          requested_by?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_line_items: {
        Row: {
          contract_id: string
          created_at: string
          custom_name: string | null
          frequency_type: Database["public"]["Enums"]["frequency_type"]
          id: string
          notes: string | null
          quantity: number
          service_catalog_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          custom_name?: string | null
          frequency_type?: Database["public"]["Enums"]["frequency_type"]
          id?: string
          notes?: string | null
          quantity?: number
          service_catalog_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          custom_name?: string | null
          frequency_type?: Database["public"]["Enums"]["frequency_type"]
          id?: string
          notes?: string | null
          quantity?: number
          service_catalog_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_line_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_line_items_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          archived: boolean
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          contract_name: string
          created_at: string
          end_date: string | null
          id: string
          offer_id: string | null
          property_id: string
          rejection_comment: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
          visit_frequency_count: number | null
          visit_frequency_type: string | null
        }
        Insert: {
          archived?: boolean
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          contract_name: string
          created_at?: string
          end_date?: string | null
          id?: string
          offer_id?: string | null
          property_id: string
          rejection_comment?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
          visit_frequency_count?: number | null
          visit_frequency_type?: string | null
        }
        Update: {
          archived?: boolean
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          contract_name?: string
          created_at?: string
          end_date?: string | null
          id?: string
          offer_id?: string | null
          property_id?: string
          rejection_comment?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
          visit_frequency_count?: number | null
          visit_frequency_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_address: string | null
          company_name: string | null
          contact_person_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          company_name?: string | null
          contact_person_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          company_name?: string | null
          contact_person_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          customer_user_id: string
          id: string
          rating_stars: number
          service_order_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_user_id: string
          id?: string
          rating_stars: number
          service_order_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_user_id?: string
          id?: string
          rating_stars?: number
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string
          customer_id: string
          findings: string | null
          id: string
          inspected_date: string | null
          notes: string | null
          property_id: string
          status: Database["public"]["Enums"]["inspection_status"]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by: string
          customer_id: string
          findings?: string | null
          id?: string
          inspected_date?: string | null
          notes?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["inspection_status"]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string
          customer_id?: string
          findings?: string | null
          id?: string
          inspected_date?: string | null
          notes?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["inspection_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          last_ai_update_summary: string | null
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_ai_update_summary?: string | null
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_ai_update_summary?: string | null
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: Database["public"]["Enums"]["inventory_category"]
          created_at: string
          id: string
          inventory_id: string
          name: string
          notes: string | null
          quantity: number | null
          source: Database["public"]["Enums"]["inventory_source"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["inventory_category"]
          created_at?: string
          id?: string
          inventory_id: string
          name: string
          notes?: string | null
          quantity?: number | null
          source?: Database["public"]["Enums"]["inventory_source"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["inventory_category"]
          created_at?: string
          id?: string
          inventory_id?: string
          name?: string
          notes?: string | null
          quantity?: number | null
          source?: Database["public"]["Enums"]["inventory_source"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_line_items: {
        Row: {
          created_at: string
          custom_name: string | null
          id: string
          notes: string | null
          offer_id: string
          quantity: number
          service_catalog_id: string | null
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          id?: string
          notes?: string | null
          offer_id: string
          quantity?: number
          service_catalog_id?: string | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          id?: string
          notes?: string | null
          offer_id?: string
          quantity?: number
          service_catalog_id?: string | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_line_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_line_items_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string
          customer_id: string
          id: string
          inspection_id: string | null
          notes: string | null
          offer_name: string
          property_id: string
          rejection_comment: string | null
          status: Database["public"]["Enums"]["offer_status"]
          tenant_id: string
          total_value: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by: string
          customer_id: string
          id?: string
          inspection_id?: string | null
          notes?: string | null
          offer_name: string
          property_id: string
          rejection_comment?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          tenant_id: string
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string
          customer_id?: string
          id?: string
          inspection_id?: string | null
          notes?: string | null
          offer_name?: string
          property_id?: string
          rejection_comment?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          tenant_id?: string
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          tenant_id: string | null
          unique_client_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          tenant_id?: string | null
          unique_client_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          tenant_id?: string | null
          unique_client_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          customer_id: string
          description: string | null
          geo_lat: number | null
          geo_lng: number | null
          id: string
          name: string
          status: Database["public"]["Enums"]["property_status"]
          unique_property_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          customer_id: string
          description?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["property_status"]
          unique_property_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string
          description?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["property_status"]
          unique_property_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          code: string
          created_at: string
          default_price: number | null
          default_unit: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_price?: number | null
          default_unit?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_price?: number | null
          default_unit?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          contract_line_item_id: string | null
          created_at: string
          id: string
          is_completed: boolean
          name: string
          notes: string | null
          quantity: number
          service_catalog_id: string | null
          service_order_id: string
          source: Database["public"]["Enums"]["service_order_item_source"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          contract_line_item_id?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          name: string
          notes?: string | null
          quantity?: number
          service_catalog_id?: string | null
          service_order_id: string
          source?: Database["public"]["Enums"]["service_order_item_source"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          contract_line_item_id?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          name?: string
          notes?: string | null
          quantity?: number
          service_catalog_id?: string | null
          service_order_id?: string
          source?: Database["public"]["Enums"]["service_order_item_source"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_contract_line_item_id_fkey"
            columns: ["contract_line_item_id"]
            isOneToOne: false
            referencedRelation: "contract_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_service_catalog_id_fkey"
            columns: ["service_catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          client_summary: string | null
          contract_id: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          notes: string | null
          performed_date: string | null
          period_label: string | null
          period_type: Database["public"]["Enums"]["period_type"]
          property_id: string
          scheduled_date: string | null
          status: Database["public"]["Enums"]["service_order_status"]
          updated_at: string
        }
        Insert: {
          client_summary?: string | null
          contract_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          notes?: string | null
          performed_date?: string | null
          period_label?: string | null
          period_type?: Database["public"]["Enums"]["period_type"]
          property_id: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          updated_at?: string
        }
        Update: {
          client_summary?: string | null
          contract_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          notes?: string | null
          performed_date?: string | null
          period_label?: string | null
          period_type?: Database["public"]["Enums"]["period_type"]
          property_id?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          property_id: string | null
          service_order_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          property_id?: string | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          property_id?: string | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_customer_id: { Args: { _user_id: string }; Returns: string }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_provider: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "PROVIDER_ADMIN" | "PROVIDER_STAFF" | "CLIENT_USER"
      billing_cycle: "WEEKLY" | "MONTHLY" | "ONE_TIME"
      connection_status: "PENDING" | "APPROVED" | "DENIED"
      contract_status:
        | "DRAFT"
        | "SENT_TO_CLIENT"
        | "SIGNED"
        | "ACTIVE"
        | "CLOSED"
      frequency_type: "PER_VISIT" | "PER_WEEK" | "PER_MONTH" | "ONE_TIME"
      inspection_status: "DRAFT" | "SCHEDULED" | "COMPLETED" | "OFFER_GENERATED"
      inventory_category: "TREE" | "LAWN" | "SHRUB" | "FLOWER_BED" | "OTHER"
      inventory_source: "MANUAL" | "AI_ASSISTED"
      offer_status:
        | "DRAFT"
        | "IN_PROGRESS"
        | "SENT_TO_CLIENT"
        | "ACCEPTED"
        | "REJECTED"
        | "EXPIRED"
        | "CANCELED"
      period_type: "WEEK" | "MONTH" | "ONE_TIME"
      property_status: "active" | "inactive"
      service_order_item_source: "CONTRACT" | "AD_HOC"
      service_order_status:
        | "SCHEDULED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "PENDING_APPROVAL"
        | "APPROVED"
        | "SENT_TO_CLIENT"
        | "CANCELED"
      task_status: "pending" | "in_progress" | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["PROVIDER_ADMIN", "PROVIDER_STAFF", "CLIENT_USER"],
      billing_cycle: ["WEEKLY", "MONTHLY", "ONE_TIME"],
      connection_status: ["PENDING", "APPROVED", "DENIED"],
      contract_status: [
        "DRAFT",
        "SENT_TO_CLIENT",
        "SIGNED",
        "ACTIVE",
        "CLOSED",
      ],
      frequency_type: ["PER_VISIT", "PER_WEEK", "PER_MONTH", "ONE_TIME"],
      inspection_status: ["DRAFT", "SCHEDULED", "COMPLETED", "OFFER_GENERATED"],
      inventory_category: ["TREE", "LAWN", "SHRUB", "FLOWER_BED", "OTHER"],
      inventory_source: ["MANUAL", "AI_ASSISTED"],
      offer_status: [
        "DRAFT",
        "IN_PROGRESS",
        "SENT_TO_CLIENT",
        "ACCEPTED",
        "REJECTED",
        "EXPIRED",
        "CANCELED",
      ],
      period_type: ["WEEK", "MONTH", "ONE_TIME"],
      property_status: ["active", "inactive"],
      service_order_item_source: ["CONTRACT", "AD_HOC"],
      service_order_status: [
        "SCHEDULED",
        "IN_PROGRESS",
        "COMPLETED",
        "PENDING_APPROVAL",
        "APPROVED",
        "SENT_TO_CLIENT",
        "CANCELED",
      ],
      task_status: ["pending", "in_progress", "completed"],
    },
  },
} as const
