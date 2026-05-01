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
      action_task_comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          task_id: string
          tenant_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
          tenant_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "action_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      action_task_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["action_task_event_type"]
          id: string
          meta: Json
          task_id: string
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["action_task_event_type"]
          id?: string
          meta?: Json
          task_id: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["action_task_event_type"]
          id?: string
          meta?: Json
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "action_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      action_tasks: {
        Row: {
          created_at: string
          due_at: string | null
          id: string
          initiator_role: string | null
          initiator_user_id: string
          payload: Json
          status: Database["public"]["Enums"]["action_task_status"]
          subject_entity_id: string | null
          subject_entity_type: string | null
          target_role: string | null
          target_user_id: string | null
          task_type: Database["public"]["Enums"]["action_task_type"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          id?: string
          initiator_role?: string | null
          initiator_user_id: string
          payload?: Json
          status?: Database["public"]["Enums"]["action_task_status"]
          subject_entity_id?: string | null
          subject_entity_type?: string | null
          target_role?: string | null
          target_user_id?: string | null
          task_type: Database["public"]["Enums"]["action_task_type"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          id?: string
          initiator_role?: string | null
          initiator_user_id?: string
          payload?: Json
          status?: Database["public"]["Enums"]["action_task_status"]
          subject_entity_id?: string | null
          subject_entity_type?: string | null
          target_role?: string | null
          target_user_id?: string | null
          task_type?: Database["public"]["Enums"]["action_task_type"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      contract_closure_events: {
        Row: {
          canceled_visits_count: number
          canceled_visits_snapshot: Json
          closed_at_utc: string
          closed_by_user_id: string
          closed_on_local_date: string
          contract_id: string
          created_at: string
          id: string
          reason: string
          tenant_id: string
        }
        Insert: {
          canceled_visits_count?: number
          canceled_visits_snapshot?: Json
          closed_at_utc?: string
          closed_by_user_id: string
          closed_on_local_date: string
          contract_id: string
          created_at?: string
          id?: string
          reason: string
          tenant_id: string
        }
        Update: {
          canceled_visits_count?: number
          canceled_visits_snapshot?: Json
          closed_at_utc?: string
          closed_by_user_id?: string
          closed_on_local_date?: string
          contract_id?: string
          created_at?: string
          id?: string
          reason?: string
          tenant_id?: string
        }
        Relationships: []
      }
      contract_line_items: {
        Row: {
          contract_id: string
          created_at: string
          custom_name: string | null
          frequency_type: Database["public"]["Enums"]["frequency_type"]
          id: string
          max_occurrences_per_period: number | null
          notes: string | null
          quantity: number
          service_catalog_id: string
          tenant_id: string
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          custom_name?: string | null
          frequency_type?: Database["public"]["Enums"]["frequency_type"]
          id?: string
          max_occurrences_per_period?: number | null
          notes?: string | null
          quantity?: number
          service_catalog_id: string
          tenant_id: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          custom_name?: string | null
          frequency_type?: Database["public"]["Enums"]["frequency_type"]
          id?: string
          max_occurrences_per_period?: number | null
          notes?: string | null
          quantity?: number
          service_catalog_id?: string
          tenant_id?: string
          unit?: string | null
          unit_price?: number | null
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
          {
            foreignKeyName: "contract_line_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          status: string
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
          status?: string
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
          status?: string
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          customer_user_id: string
          id: string
          rating_stars: number
          service_order_id: string
          tenant_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_user_id: string
          id?: string
          rating_stars: number
          service_order_id: string
          tenant_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_user_id?: string
          id?: string
          rating_stars?: number
          service_order_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      global_holidays: {
        Row: {
          country_code: string
          created_at: string
          date: string
          id: string
          name: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          date: string
          id?: string
          name: string
        }
        Update: {
          country_code?: string
          created_at?: string
          date?: string
          id?: string
          name?: string
        }
        Relationships: []
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
          inventory_marked_complete_at: string | null
          inventory_marked_complete_by: string | null
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
          inventory_marked_complete_at?: string | null
          inventory_marked_complete_by?: string | null
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
          inventory_marked_complete_at?: string | null
          inventory_marked_complete_by?: string | null
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
      integrations: {
        Row: {
          created_at: string
          google_access_token: string | null
          google_connected: boolean
          google_email: string | null
          google_refresh_token: string | null
          google_token_expires_at: string | null
          id: string
          last_sync_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_access_token?: string | null
          google_connected?: boolean
          google_email?: string | null
          google_refresh_token?: string | null
          google_token_expires_at?: string | null
          id?: string
          last_sync_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          google_access_token?: string | null
          google_connected?: boolean
          google_email?: string | null
          google_refresh_token?: string | null
          google_token_expires_at?: string | null
          id?: string
          last_sync_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          last_ai_update_summary: string | null
          property_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_ai_update_summary?: string | null
          property_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_ai_update_summary?: string | null
          property_id?: string
          tenant_id?: string
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
          {
            foreignKeyName: "inventory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dedupe: {
        Row: {
          created_at: string
          dedupe_key: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
        }
        Relationships: []
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "offer_line_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          address_city: string | null
          address_county: string | null
          address_number: string | null
          address_street: string | null
          avatar_url: string | null
          client_type: string
          cnp: string | null
          company_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          cui: string | null
          customer_id: string | null
          email: string | null
          fiscal_representative: string | null
          full_name: string | null
          id: string
          is_locked: boolean
          license_type: string
          phone: string | null
          provider_permission: string | null
          temporary_password: string | null
          tenant_id: string | null
          unique_client_id: string | null
          updated_at: string
          user_id: string
          vat_id: string | null
        }
        Insert: {
          address_city?: string | null
          address_county?: string | null
          address_number?: string | null
          address_street?: string | null
          avatar_url?: string | null
          client_type?: string
          cnp?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          cui?: string | null
          customer_id?: string | null
          email?: string | null
          fiscal_representative?: string | null
          full_name?: string | null
          id?: string
          is_locked?: boolean
          license_type?: string
          phone?: string | null
          provider_permission?: string | null
          temporary_password?: string | null
          tenant_id?: string | null
          unique_client_id?: string | null
          updated_at?: string
          user_id: string
          vat_id?: string | null
        }
        Update: {
          address_city?: string | null
          address_county?: string | null
          address_number?: string | null
          address_street?: string | null
          avatar_url?: string | null
          client_type?: string
          cnp?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          cui?: string | null
          customer_id?: string | null
          email?: string | null
          fiscal_representative?: string | null
          full_name?: string | null
          id?: string
          is_locked?: boolean
          license_type?: string
          phone?: string | null
          provider_permission?: string | null
          temporary_password?: string | null
          tenant_id?: string | null
          unique_client_id?: string | null
          updated_at?: string
          user_id?: string
          vat_id?: string | null
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string | null
          id: string
          related_user_id: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          description?: string | null
          id?: string
          related_user_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string | null
          id?: string
          related_user_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
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
          tenant_id: string
          unit: string | null
          unit_price: number | null
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
          tenant_id: string
          unit?: string | null
          unit_price?: number | null
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
          tenant_id?: string
          unit?: string | null
          unit_price?: number | null
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
          {
            foreignKeyName: "service_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          scheduled_end_time: string | null
          scheduled_start_time: string | null
          status: Database["public"]["Enums"]["service_order_status"]
          team_id: string | null
          tenant_id: string | null
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
          scheduled_end_time?: string | null
          scheduled_start_time?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          team_id?: string | null
          tenant_id?: string | null
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
          scheduled_end_time?: string | null
          scheduled_start_time?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          team_id?: string | null
          tenant_id?: string | null
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
          {
            foreignKeyName: "service_orders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          tenant_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_non_workdays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_non_workdays_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          ai_tier: string
          created_at: string
          created_by: string | null
          currency: string
          feature_flags: Json
          id: string
          max_client_seats: number
          max_provider_seats: number
          max_teams: number
          name: string
          status: string
          subscription_tier: string
          timezone: string
          trial_expires_at: string | null
          unique_tenant_id: string | null
          updated_at: string
        }
        Insert: {
          ai_tier?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          feature_flags?: Json
          id?: string
          max_client_seats?: number
          max_provider_seats?: number
          max_teams?: number
          name?: string
          status?: string
          subscription_tier?: string
          timezone?: string
          trial_expires_at?: string | null
          unique_tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_tier?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          feature_flags?: Json
          id?: string
          max_client_seats?: number
          max_provider_seats?: number
          max_teams?: number
          name?: string
          status?: string
          subscription_tier?: string
          timezone?: string
          trial_expires_at?: string | null
          unique_tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trial_extensions: {
        Row: {
          created_at: string
          days: number
          extended_by: string
          id: string
          new_expiry: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          days?: number
          extended_by: string
          id?: string
          new_expiry: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          days?: number
          extended_by?: string
          id?: string
          new_expiry?: string
          tenant_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at: string | null
          task_id: string | null
          tenant_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          task_id?: string | null
          tenant_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          task_id?: string | null
          tenant_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "action_tasks"
            referencedColumns: ["id"]
          },
        ]
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
      _apply_task_side_effects: {
        Args: { _action: string; _task_id: string }
        Returns: undefined
      }
      _client_user_id_for_customer: {
        Args: { _customer_id: string }
        Returns: string
      }
      _emit_notification: {
        Args: {
          _body: string
          _entity_id: string
          _entity_type: string
          _kind: Database["public"]["Enums"]["notification_kind"]
          _task_id: string
          _tenant_id: string
          _title: string
          _user_id: string
        }
        Returns: string
      }
      _provider_admin_user_ids: {
        Args: { _tenant_id: string }
        Returns: string[]
      }
      act_on_task:
        | {
            Args: { _action: string; _comment: string; _task_id: string }
            Returns: Json
          }
        | {
            Args: {
              _action: string
              _comment?: string
              _payload_patch?: Json
              _task_id: string
            }
            Returns: Json
          }
      add_task_comment: {
        Args: { _body: string; _task_id: string }
        Returns: string
      }
      apply_tier_limits: {
        Args: { _tenant_id: string; _tier: string }
        Returns: undefined
      }
      create_action_task: {
        Args: {
          _due_at: string
          _payload: Json
          _subject_entity_id: string
          _subject_entity_type: string
          _target_role: string
          _target_user_id: string
          _task_type: Database["public"]["Enums"]["action_task_type"]
          _tenant_id: string
        }
        Returns: string
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_exists: { Args: { _email: string }; Returns: boolean }
      emit_contract_response_task: {
        Args: { _contract_id: string }
        Returns: string
      }
      emit_inspection_confirmation_task: {
        Args: { _inspection_id: string; _scheduled_date: string }
        Returns: string
      }
      emit_offer_response_task: { Args: { _offer_id: string }; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_stale_action_tasks: { Args: never; Returns: number }
      expire_trials_to_patio: { Args: never; Returns: undefined }
      extend_trial_15: { Args: { _tenant_id: string }; Returns: string }
      get_user_customer_id: { Args: { _user_id: string }; Returns: string }
      get_user_email: { Args: { _user_id: string }; Returns: string }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_default_service_catalog: { Args: never; Returns: Json }
      is_provider: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workday: {
        Args: { _date: string; _tenant_id: string }
        Returns: boolean
      }
      log_super_admin_action: {
        Args: {
          _action: string
          _metadata?: Json
          _target_id?: string
          _target_type?: string
        }
        Returns: undefined
      }
      lookup_client_by_code: {
        Args: { _code: string }
        Returns: {
          customer_id: string
          email: string
          full_name: string
          unique_client_id: string
          user_id: string
        }[]
      }
      lookup_invite_by_token: {
        Args: { _token: string }
        Returns: {
          expires_at: string
          role: string
          tenant_name: string
        }[]
      }
      lookup_tenant_by_code: {
        Args: { _code: string }
        Returns: {
          id: string
          name: string
          unique_tenant_id: string
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notifications_read: { Args: { _ids: string[] }; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      notify_contract_renewals: { Args: never; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      action_task_event_type:
        | "created"
        | "approved"
        | "rejected"
        | "cancelled"
        | "expired"
        | "commented"
        | "auto_approved"
      action_task_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "expired"
      action_task_type:
        | "link_request"
        | "offer_response"
        | "contract_response"
        | "inspection_confirmation"
        | "contract_renewal"
      app_role: "PROVIDER_ADMIN" | "PROVIDER_STAFF" | "CLIENT_USER"
      billing_cycle: "MONTHLY" | "YEARLY" | "ONE_TIME"
      connection_status: "PENDING" | "APPROVED" | "DENIED"
      contract_status:
        | "DRAFT"
        | "SENT_TO_CLIENT"
        | "SIGNED"
        | "ACTIVE"
        | "CLOSED"
        | "REJECTED"
      frequency_type:
        | "PER_VISIT"
        | "PER_WEEK"
        | "PER_MONTH"
        | "ONE_TIME"
        | "PER_YEAR"
      inspection_status: "DRAFT" | "SCHEDULED" | "COMPLETED" | "OFFER_GENERATED"
      inventory_category:
        | "TREE"
        | "LAWN"
        | "SHRUB"
        | "FLOWER_BED"
        | "OTHER"
        | "HEDGE"
        | "IRRIGATION"
        | "PAVING"
        | "PLANTER"
        | "LIGHTING"
        | "FENCE"
      inventory_source: "MANUAL" | "AI_ASSISTED"
      notification_kind:
        | "task_created"
        | "task_approved"
        | "task_rejected"
        | "task_commented"
        | "task_expired"
        | "inspection_scheduled"
        | "inspection_completed"
        | "offer_sent"
        | "offer_accepted"
        | "offer_rejected"
        | "contract_sent"
        | "contract_signed"
        | "contract_rejected"
        | "contract_expiring_soon"
        | "contract_renewed"
        | "feedback_received"
        | "connection_approved"
        | "connection_revoked"
        | "contract_closed"
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
      action_task_event_type: [
        "created",
        "approved",
        "rejected",
        "cancelled",
        "expired",
        "commented",
        "auto_approved",
      ],
      action_task_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "expired",
      ],
      action_task_type: [
        "link_request",
        "offer_response",
        "contract_response",
        "inspection_confirmation",
        "contract_renewal",
      ],
      app_role: ["PROVIDER_ADMIN", "PROVIDER_STAFF", "CLIENT_USER"],
      billing_cycle: ["MONTHLY", "YEARLY", "ONE_TIME"],
      connection_status: ["PENDING", "APPROVED", "DENIED"],
      contract_status: [
        "DRAFT",
        "SENT_TO_CLIENT",
        "SIGNED",
        "ACTIVE",
        "CLOSED",
        "REJECTED",
      ],
      frequency_type: [
        "PER_VISIT",
        "PER_WEEK",
        "PER_MONTH",
        "ONE_TIME",
        "PER_YEAR",
      ],
      inspection_status: ["DRAFT", "SCHEDULED", "COMPLETED", "OFFER_GENERATED"],
      inventory_category: [
        "TREE",
        "LAWN",
        "SHRUB",
        "FLOWER_BED",
        "OTHER",
        "HEDGE",
        "IRRIGATION",
        "PAVING",
        "PLANTER",
        "LIGHTING",
        "FENCE",
      ],
      inventory_source: ["MANUAL", "AI_ASSISTED"],
      notification_kind: [
        "task_created",
        "task_approved",
        "task_rejected",
        "task_commented",
        "task_expired",
        "inspection_scheduled",
        "inspection_completed",
        "offer_sent",
        "offer_accepted",
        "offer_rejected",
        "contract_sent",
        "contract_signed",
        "contract_rejected",
        "contract_expiring_soon",
        "contract_renewed",
        "feedback_received",
        "connection_approved",
        "connection_revoked",
        "contract_closed",
      ],
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
