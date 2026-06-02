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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
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
      api_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          revoked: boolean
          token_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          last_used_at?: string | null
          revoked?: boolean
          token_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          revoked?: boolean
          token_hash?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: number
          review_email_html: string | null
          review_email_subject: string | null
          review_email_template_uuid: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          review_email_html?: string | null
          review_email_subject?: string | null
          review_email_template_uuid?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          review_email_html?: string | null
          review_email_subject?: string | null
          review_email_template_uuid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_automations: {
        Row: {
          client_id: string
          client_project_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          client_project_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_project_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_automations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_automations_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_checklist_items: {
        Row: {
          client_id: string
          client_project_id: string | null
          completed: boolean
          created_at: string
          id: string
          label: string
          order_index: number
        }
        Insert: {
          client_id: string
          client_project_id?: string | null
          completed?: boolean
          created_at?: string
          id?: string
          label: string
          order_index?: number
        }
        Update: {
          client_id?: string
          client_project_id?: string | null
          completed?: boolean
          created_at?: string
          id?: string
          label?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_checklist_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string | null
          order_index: number
          phone: string | null
          role: string | null
          surecontact_contact_uuid: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string | null
          order_index?: number
          phone?: string | null
          role?: string | null
          surecontact_contact_uuid?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string | null
          order_index?: number
          phone?: string | null
          role?: string | null
          surecontact_contact_uuid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          agency_countersigned_at: string
          agency_signer_name: string
          client_audit: Json | null
          client_id: string
          client_ip: string | null
          client_project_id: string | null
          client_signature_data: string
          client_signature_name: string
          client_signature_type: string
          client_signed_at: string
          client_user_agent: string | null
          created_at: string
          id: string
          pdf_generated_at: string | null
          pdf_path: string | null
          pdf_url: string | null
          template_version: string
          tier: string
          updated_at: string
        }
        Insert: {
          agency_countersigned_at?: string
          agency_signer_name?: string
          client_audit?: Json | null
          client_id: string
          client_ip?: string | null
          client_project_id?: string | null
          client_signature_data: string
          client_signature_name: string
          client_signature_type: string
          client_signed_at?: string
          client_user_agent?: string | null
          created_at?: string
          id?: string
          pdf_generated_at?: string | null
          pdf_path?: string | null
          pdf_url?: string | null
          template_version: string
          tier: string
          updated_at?: string
        }
        Update: {
          agency_countersigned_at?: string
          agency_signer_name?: string
          client_audit?: Json | null
          client_id?: string
          client_ip?: string | null
          client_project_id?: string | null
          client_signature_data?: string
          client_signature_name?: string
          client_signature_type?: string
          client_signed_at?: string
          client_user_agent?: string | null
          created_at?: string
          id?: string
          pdf_generated_at?: string | null
          pdf_path?: string | null
          pdf_url?: string | null
          template_version?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_deliveries: {
        Row: {
          client_id: string
          client_project_id: string | null
          created_at: string
          delivery_date: string
          description: string | null
          id: string
          link_url: string | null
          title: string
        }
        Insert: {
          client_id: string
          client_project_id?: string | null
          created_at?: string
          delivery_date?: string
          description?: string | null
          id?: string
          link_url?: string | null
          title: string
        }
        Update: {
          client_id?: string
          client_project_id?: string | null
          created_at?: string
          delivery_date?: string
          description?: string | null
          id?: string
          link_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_deliveries_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_email_tracking: {
        Row: {
          client_id: string
          day3_opened_at: string | null
          day3_sent_at: string | null
          delivery_opened_at: string | null
          delivery_sent_at: string | null
          kickoff_opened_at: string | null
          kickoff_sent_at: string | null
          scope_opened_at: string | null
          scope_sent_at: string | null
          updated_at: string
          welcome_opened_at: string | null
          welcome_sent_at: string | null
        }
        Insert: {
          client_id: string
          day3_opened_at?: string | null
          day3_sent_at?: string | null
          delivery_opened_at?: string | null
          delivery_sent_at?: string | null
          kickoff_opened_at?: string | null
          kickoff_sent_at?: string | null
          scope_opened_at?: string | null
          scope_sent_at?: string | null
          updated_at?: string
          welcome_opened_at?: string | null
          welcome_sent_at?: string | null
        }
        Update: {
          client_id?: string
          day3_opened_at?: string | null
          day3_sent_at?: string | null
          delivery_opened_at?: string | null
          delivery_sent_at?: string | null
          kickoff_opened_at?: string | null
          kickoff_sent_at?: string | null
          scope_opened_at?: string | null
          scope_sent_at?: string | null
          updated_at?: string
          welcome_opened_at?: string | null
          welcome_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_email_tracking_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_projects: {
        Row: {
          business_name: string | null
          client_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          source_order_id: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          client_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          source_order_id?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          source_order_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_proposals: {
        Row: {
          agency_countersigned_at: string | null
          agency_signer_name: string
          client_audit: Json | null
          client_id: string
          client_ip: string | null
          client_project_id: string
          client_signature_data: string | null
          client_signature_name: string | null
          client_signature_type: string | null
          client_signed_at: string | null
          client_user_agent: string | null
          created_at: string
          description: string | null
          id: string
          pdf_generated_at: string | null
          signed_pdf_path: string | null
          source_pdf_path: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agency_countersigned_at?: string | null
          agency_signer_name?: string
          client_audit?: Json | null
          client_id: string
          client_ip?: string | null
          client_project_id: string
          client_signature_data?: string | null
          client_signature_name?: string | null
          client_signature_type?: string | null
          client_signed_at?: string | null
          client_user_agent?: string | null
          created_at?: string
          description?: string | null
          id?: string
          pdf_generated_at?: string | null
          signed_pdf_path?: string | null
          source_pdf_path: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agency_countersigned_at?: string | null
          agency_signer_name?: string
          client_audit?: Json | null
          client_id?: string
          client_ip?: string | null
          client_project_id?: string
          client_signature_data?: string | null
          client_signature_name?: string | null
          client_signature_type?: string | null
          client_signed_at?: string | null
          client_user_agent?: string | null
          created_at?: string
          description?: string | null
          id?: string
          pdf_generated_at?: string | null
          signed_pdf_path?: string | null
          source_pdf_path?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          archived: boolean
          brand_kit_conversation: Json
          brand_kit_intake: Json | null
          brand_kit_intake_submitted_at: string | null
          brand_voice_approved: boolean
          brand_voice_approved_at: string | null
          brand_voice_content: string | null
          brand_voice_doc: string | null
          brand_voice_error: string | null
          brand_voice_generated_at: string | null
          brand_voice_pdf_generated_at: string | null
          brand_voice_pdf_path: string | null
          brand_voice_pdf_url: string | null
          brand_voice_quick_ref: string | null
          brand_voice_started_at: string | null
          brand_voice_status: string
          brand_voice_url: string | null
          build_start_date: string | null
          build_update_note: string | null
          business_name: string | null
          client_account_access: Json
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivery_date: string | null
          delivery_video_url: string | null
          email_tracking_complete_at: string | null
          email_tracking_last_polled_at: string | null
          email_tracking_paused_at: string | null
          email_tracking_paused_reason: string | null
          id: string
          intake_data: Json | null
          intake_summary: string | null
          kickoff_webhook_confirmed_at: string | null
          kickoff_webhook_fired_at: string | null
          notes: string | null
          onboarding_submission_id: string | null
          pipeline_stage: string
          purchased_at: string | null
          subscription_cancel_at_period_end: boolean
          subscription_canceled_at: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          surecart_customer_id: string | null
          surecart_order_id: string | null
          surecart_subscription_id: string | null
          surecontact_contact_uuid: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          brand_kit_conversation?: Json
          brand_kit_intake?: Json | null
          brand_kit_intake_submitted_at?: string | null
          brand_voice_approved?: boolean
          brand_voice_approved_at?: string | null
          brand_voice_content?: string | null
          brand_voice_doc?: string | null
          brand_voice_error?: string | null
          brand_voice_generated_at?: string | null
          brand_voice_pdf_generated_at?: string | null
          brand_voice_pdf_path?: string | null
          brand_voice_pdf_url?: string | null
          brand_voice_quick_ref?: string | null
          brand_voice_started_at?: string | null
          brand_voice_status?: string
          brand_voice_url?: string | null
          build_start_date?: string | null
          build_update_note?: string | null
          business_name?: string | null
          client_account_access?: Json
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_date?: string | null
          delivery_video_url?: string | null
          email_tracking_complete_at?: string | null
          email_tracking_last_polled_at?: string | null
          email_tracking_paused_at?: string | null
          email_tracking_paused_reason?: string | null
          id?: string
          intake_data?: Json | null
          intake_summary?: string | null
          kickoff_webhook_confirmed_at?: string | null
          kickoff_webhook_fired_at?: string | null
          notes?: string | null
          onboarding_submission_id?: string | null
          pipeline_stage?: string
          purchased_at?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_canceled_at?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          surecart_customer_id?: string | null
          surecart_order_id?: string | null
          surecart_subscription_id?: string | null
          surecontact_contact_uuid?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          brand_kit_conversation?: Json
          brand_kit_intake?: Json | null
          brand_kit_intake_submitted_at?: string | null
          brand_voice_approved?: boolean
          brand_voice_approved_at?: string | null
          brand_voice_content?: string | null
          brand_voice_doc?: string | null
          brand_voice_error?: string | null
          brand_voice_generated_at?: string | null
          brand_voice_pdf_generated_at?: string | null
          brand_voice_pdf_path?: string | null
          brand_voice_pdf_url?: string | null
          brand_voice_quick_ref?: string | null
          brand_voice_started_at?: string | null
          brand_voice_status?: string
          brand_voice_url?: string | null
          build_start_date?: string | null
          build_update_note?: string | null
          business_name?: string | null
          client_account_access?: Json
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_date?: string | null
          delivery_video_url?: string | null
          email_tracking_complete_at?: string | null
          email_tracking_last_polled_at?: string | null
          email_tracking_paused_at?: string | null
          email_tracking_paused_reason?: string | null
          id?: string
          intake_data?: Json | null
          intake_summary?: string | null
          kickoff_webhook_confirmed_at?: string | null
          kickoff_webhook_fired_at?: string | null
          notes?: string | null
          onboarding_submission_id?: string | null
          pipeline_stage?: string
          purchased_at?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_canceled_at?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          surecart_customer_id?: string | null
          surecart_order_id?: string | null
          surecart_subscription_id?: string | null
          surecontact_contact_uuid?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_onboarding_submission_id_fkey"
            columns: ["onboarding_submission_id"]
            isOneToOne: false
            referencedRelation: "onboarding_submissions"
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
      journey_nodes: {
        Row: {
          asset_label: string | null
          asset_url: string | null
          checklist: Json
          client_id: string
          client_project_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          key: string
          label: string
          notes: string | null
          order_index: number
          started_at: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          asset_label?: string | null
          asset_url?: string | null
          checklist?: Json
          client_id: string
          client_project_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          key: string
          label: string
          notes?: string | null
          order_index: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          asset_label?: string | null
          asset_url?: string | null
          checklist?: Json
          client_id?: string
          client_project_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          key?: string
          label?: string
          notes?: string | null
          order_index?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_nodes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_nodes_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_nodes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "journey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_templates: {
        Row: {
          checklist: Json
          created_at: string
          description: string | null
          id: string
          key: string
          label: string
          order_index: number
          tier: string
        }
        Insert: {
          checklist?: Json
          created_at?: string
          description?: string | null
          id?: string
          key: string
          label: string
          order_index: number
          tier: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
          order_index?: number
          tier?: string
        }
        Relationships: []
      }
      mcp_oauth_clients: {
        Row: {
          client_id: string
          client_name: string | null
          created_at: string
          grant_types: string[]
          metadata: Json
          redirect_uris: string[]
          response_types: string[]
          scope: string | null
          token_endpoint_auth_method: string
        }
        Insert: {
          client_id: string
          client_name?: string | null
          created_at?: string
          grant_types?: string[]
          metadata?: Json
          redirect_uris?: string[]
          response_types?: string[]
          scope?: string | null
          token_endpoint_auth_method?: string
        }
        Update: {
          client_id?: string
          client_name?: string | null
          created_at?: string
          grant_types?: string[]
          metadata?: Json
          redirect_uris?: string[]
          response_types?: string[]
          scope?: string | null
          token_endpoint_auth_method?: string
        }
        Relationships: []
      }
      mcp_oauth_codes: {
        Row: {
          client_id: string
          code: string
          code_challenge: string
          code_challenge_method: string
          created_at: string
          expires_at: string
          redirect_uri: string
          scope: string | null
          used: boolean
          user_id: string
        }
        Insert: {
          client_id: string
          code: string
          code_challenge: string
          code_challenge_method?: string
          created_at?: string
          expires_at: string
          redirect_uri: string
          scope?: string | null
          used?: boolean
          user_id: string
        }
        Update: {
          client_id?: string
          code?: string
          code_challenge?: string
          code_challenge_method?: string
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          scope?: string | null
          used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "mcp_oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      mcp_oauth_tokens: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          revoked: boolean
          scope: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          revoked?: boolean
          scope?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          revoked?: boolean
          scope?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "mcp_oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      onboarding_invites: {
        Row: {
          business_name: string | null
          completed_at: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_opened_at: string | null
          note: string | null
          revoked: boolean
          source_order_id: string | null
          submission_id: string | null
          surecart_customer_id: string | null
          surecart_subscription_id: string | null
          tier: string | null
          token: string
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          completed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_opened_at?: string | null
          note?: string | null
          revoked?: boolean
          source_order_id?: string | null
          submission_id?: string | null
          surecart_customer_id?: string | null
          surecart_subscription_id?: string | null
          tier?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          completed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_opened_at?: string | null
          note?: string | null
          revoked?: boolean
          source_order_id?: string | null
          submission_id?: string | null
          surecart_customer_id?: string | null
          surecart_subscription_id?: string | null
          tier?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_submissions: {
        Row: {
          business_name: string | null
          completed: boolean
          contact_email: string | null
          contact_name: string | null
          conversation: Json
          created_at: string
          id: string
          invite_id: string | null
          last_activity_at: string | null
          summary: Json | null
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          completed?: boolean
          contact_email?: string | null
          contact_name?: string | null
          conversation?: Json
          created_at?: string
          id?: string
          invite_id?: string | null
          last_activity_at?: string | null
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          completed?: boolean
          contact_email?: string | null
          contact_name?: string | null
          conversation?: Json
          created_at?: string
          id?: string
          invite_id?: string | null
          last_activity_at?: string | null
          summary?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      preview_approval_events: {
        Row: {
          action: string
          approver_name: string | null
          created_at: string
          id: string
          kind: string
          path: string
          project_id: string
        }
        Insert: {
          action: string
          approver_name?: string | null
          created_at?: string
          id?: string
          kind: string
          path: string
          project_id: string
        }
        Update: {
          action?: string
          approver_name?: string | null
          created_at?: string
          id?: string
          kind?: string
          path?: string
          project_id?: string
        }
        Relationships: []
      }
      preview_approvals: {
        Row: {
          approved_at: string
          approver_name: string | null
          created_at: string
          id: string
          kind: string
          path: string
          project_id: string
        }
        Insert: {
          approved_at?: string
          approver_name?: string | null
          created_at?: string
          id?: string
          kind: string
          path: string
          project_id: string
        }
        Update: {
          approved_at?: string
          approver_name?: string | null
          created_at?: string
          id?: string
          kind?: string
          path?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "preview_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_comment_replies: {
        Row: {
          author_name: string | null
          body: string
          comment_id: string
          created_at: string
          edit_token: string | null
          id: string
          is_admin: boolean
        }
        Insert: {
          author_name?: string | null
          body: string
          comment_id: string
          created_at?: string
          edit_token?: string | null
          id?: string
          is_admin?: boolean
        }
        Update: {
          author_name?: string | null
          body?: string
          comment_id?: string
          created_at?: string
          edit_token?: string | null
          id?: string
          is_admin?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "preview_comment_replies_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "preview_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_comments: {
        Row: {
          author_name: string | null
          body: string
          created_at: string
          edit_token: string | null
          id: string
          page_path: string
          pin_number: number
          project_id: string
          selector: string
          status: string
          updated_at: string
          viewport_width: number | null
          x_pct: number
          y_pct: number
        }
        Insert: {
          author_name?: string | null
          body: string
          created_at?: string
          edit_token?: string | null
          id?: string
          page_path?: string
          pin_number: number
          project_id: string
          selector: string
          status?: string
          updated_at?: string
          viewport_width?: number | null
          x_pct?: number
          y_pct?: number
        }
        Update: {
          author_name?: string | null
          body?: string
          created_at?: string
          edit_token?: string | null
          id?: string
          page_path?: string
          pin_number?: number
          project_id?: string
          selector?: string
          status?: string
          updated_at?: string
          viewport_width?: number | null
          x_pct?: number
          y_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "preview_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "preview_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_external_pages: {
        Row: {
          created_at: string
          id: string
          label: string | null
          order_index: number
          path: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          order_index?: number
          path: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          order_index?: number
          path?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_external_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "preview_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_files: {
        Row: {
          content_type: string | null
          created_at: string
          id: string
          path: string
          project_id: string
          size_bytes: number | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          id?: string
          path: string
          project_id: string
          size_bytes?: number | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          id?: string
          path?: string
          project_id?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "preview_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "preview_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_page_comments: {
        Row: {
          author_name: string | null
          body: string
          created_at: string
          id: string
          path: string
          project_id: string
        }
        Insert: {
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          path: string
          project_id: string
        }
        Update: {
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          path?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_page_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "preview_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_projects: {
        Row: {
          archived: boolean
          client_label: string | null
          client_project_id: string | null
          created_at: string
          entry_path: string
          external_base_url: string | null
          feedback_enabled: boolean
          id: string
          is_multi_page: boolean
          last_crawled_at: string | null
          name: string
          slug: string
          source_type: string
          storage_prefix: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          client_label?: string | null
          client_project_id?: string | null
          created_at?: string
          entry_path?: string
          external_base_url?: string | null
          feedback_enabled?: boolean
          id?: string
          is_multi_page?: boolean
          last_crawled_at?: string | null
          name: string
          slug: string
          source_type?: string
          storage_prefix: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          client_label?: string | null
          client_project_id?: string | null
          created_at?: string
          entry_path?: string
          external_base_url?: string | null
          feedback_enabled?: boolean
          id?: string
          is_multi_page?: boolean
          last_crawled_at?: string | null
          name?: string
          slug?: string
          source_type?: string
          storage_prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_projects_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_invoices: {
        Row: {
          amount_cents: number
          checkout_url: string | null
          client_id: string
          client_project_id: string
          created_at: string
          currency: string
          due_date: string | null
          id: string
          label: string
          notes: string | null
          paid_at: string | null
          sent_at: string | null
          sequence: number
          status: string
          surecart_checkout_id: string | null
          surecart_invoice_id: string | null
          surecart_order_id: string | null
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          amount_cents: number
          checkout_url?: string | null
          client_id: string
          client_project_id: string
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          label: string
          notes?: string | null
          paid_at?: string | null
          sent_at?: string | null
          sequence?: number
          status?: string
          surecart_checkout_id?: string | null
          surecart_invoice_id?: string | null
          surecart_order_id?: string | null
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          amount_cents?: number
          checkout_url?: string | null
          client_id?: string
          client_project_id?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          label?: string
          notes?: string | null
          paid_at?: string | null
          sent_at?: string | null
          sequence?: number
          status?: string
          surecart_checkout_id?: string | null
          surecart_invoice_id?: string | null
          surecart_order_id?: string | null
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: []
      }
      project_links: {
        Row: {
          client_project_id: string
          created_at: string
          id: string
          label: string
          updated_at: string
          url: string
        }
        Insert: {
          client_project_id: string
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          url: string
        }
        Update: {
          client_project_id?: string
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      project_notes: {
        Row: {
          body: string
          client_project_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          body: string
          client_project_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          body?: string
          client_project_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_secrets: {
        Row: {
          client_project_id: string
          created_at: string
          created_by: string | null
          encrypted_value: string
          hint: string | null
          id: string
          key: string
          updated_at: string
        }
        Insert: {
          client_project_id: string
          created_at?: string
          created_by?: string | null
          encrypted_value: string
          hint?: string | null
          id?: string
          key: string
          updated_at?: string
        }
        Update: {
          client_project_id?: string
          created_at?: string
          created_by?: string | null
          encrypted_value?: string
          hint?: string | null
          id?: string
          key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_secrets_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task_activity: {
        Row: {
          created_at: string
          dedup_key: string
          id: string
          kind: string
          message: string
          metadata: Json
          occurred_at: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dedup_key?: string
          id?: string
          kind: string
          message: string
          metadata?: Json
          occurred_at?: string
          task_id: string
        }
        Update: {
          created_at?: string
          dedup_key?: string
          id?: string
          kind?: string
          message?: string
          metadata?: Json
          occurred_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task_attachments: {
        Row: {
          bucket: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          bucket?: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task_epics: {
        Row: {
          client_project_id: string
          color: string | null
          created_at: string
          id: string
          journey_stage_key: string | null
          locked: boolean
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          client_project_id: string
          color?: string | null
          created_at?: string
          id?: string
          journey_stage_key?: string | null
          locked?: boolean
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          client_project_id?: string
          color?: string | null
          created_at?: string
          id?: string
          journey_stage_key?: string | null
          locked?: boolean
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          acceptance_criteria: Json
          assignee_admin_id: string | null
          assignee_kind: Database["public"]["Enums"]["project_task_assignee_kind"]
          auto_key: string | null
          blocked_by: string[]
          client_project_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          design_url: string | null
          due_date: string | null
          email_template: Json | null
          epic_id: string | null
          id: string
          journey_item_key: string | null
          manual_prereqs: string | null
          name: string
          order_index: number
          parent_task_id: string | null
          platform: string | null
          priority: Database["public"]["Enums"]["project_task_priority"]
          size: string | null
          status: Database["public"]["Enums"]["project_task_status"]
          tags: string[]
          updated_at: string
          url: string | null
        }
        Insert: {
          acceptance_criteria?: Json
          assignee_admin_id?: string | null
          assignee_kind?: Database["public"]["Enums"]["project_task_assignee_kind"]
          auto_key?: string | null
          blocked_by?: string[]
          client_project_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          design_url?: string | null
          due_date?: string | null
          email_template?: Json | null
          epic_id?: string | null
          id?: string
          journey_item_key?: string | null
          manual_prereqs?: string | null
          name: string
          order_index?: number
          parent_task_id?: string | null
          platform?: string | null
          priority?: Database["public"]["Enums"]["project_task_priority"]
          size?: string | null
          status?: Database["public"]["Enums"]["project_task_status"]
          tags?: string[]
          updated_at?: string
          url?: string | null
        }
        Update: {
          acceptance_criteria?: Json
          assignee_admin_id?: string | null
          assignee_kind?: Database["public"]["Enums"]["project_task_assignee_kind"]
          auto_key?: string | null
          blocked_by?: string[]
          client_project_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          design_url?: string | null
          due_date?: string | null
          email_template?: Json | null
          epic_id?: string | null
          id?: string
          journey_item_key?: string | null
          manual_prereqs?: string | null
          name?: string
          order_index?: number
          parent_task_id?: string | null
          platform?: string | null
          priority?: Database["public"]["Enums"]["project_task_priority"]
          size?: string | null
          status?: Database["public"]["Enums"]["project_task_status"]
          tags?: string[]
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_assignee_admin_id_fkey"
            columns: ["assignee_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_epic_id_fkey"
            columns: ["epic_id"]
            isOneToOne: false
            referencedRelation: "project_task_epics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      social_design_templates: {
        Row: {
          active: boolean
          client_project_id: string
          created_at: string
          created_by: string | null
          design_notes: string | null
          format_support: string
          html_source: string
          id: string
          name: string
          slide_count: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_project_id: string
          created_at?: string
          created_by?: string | null
          design_notes?: string | null
          format_support?: string
          html_source: string
          id?: string
          name: string
          slide_count?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_project_id?: string
          created_at?: string
          created_by?: string | null
          design_notes?: string | null
          format_support?: string
          html_source?: string
          id?: string
          name?: string
          slide_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_design_templates_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_batches: {
        Row: {
          brief: string | null
          carousel_count: number
          client_project_id: string
          created_at: string
          created_by: string | null
          design_template_id: string | null
          error: string | null
          id: string
          platform: string | null
          single_count: number
          slides_per_carousel: number
          status: string
          updated_at: string
        }
        Insert: {
          brief?: string | null
          carousel_count?: number
          client_project_id: string
          created_at?: string
          created_by?: string | null
          design_template_id?: string | null
          error?: string | null
          id?: string
          platform?: string | null
          single_count?: number
          slides_per_carousel?: number
          status?: string
          updated_at?: string
        }
        Update: {
          brief?: string | null
          carousel_count?: number
          client_project_id?: string
          created_at?: string
          created_by?: string | null
          design_template_id?: string | null
          error?: string | null
          id?: string
          platform?: string | null
          single_count?: number
          slides_per_carousel?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_batches_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_batches_design_template_id_fkey"
            columns: ["design_template_id"]
            isOneToOne: false
            referencedRelation: "social_design_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          batch_id: string
          caption: string | null
          client_project_id: string
          copost_post_id: string | null
          copy_provider: string | null
          created_at: string
          design_template_id: string | null
          error: string | null
          format: string
          hashtags: string[]
          id: string
          order_index: number
          published_at: string | null
          slides: Json
          status: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          caption?: string | null
          client_project_id: string
          copost_post_id?: string | null
          copy_provider?: string | null
          created_at?: string
          design_template_id?: string | null
          error?: string | null
          format?: string
          hashtags?: string[]
          id?: string
          order_index?: number
          published_at?: string | null
          slides?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          caption?: string | null
          client_project_id?: string
          copost_post_id?: string | null
          copy_provider?: string | null
          created_at?: string
          design_template_id?: string | null
          error?: string | null
          format?: string
          hashtags?: string[]
          id?: string
          order_index?: number
          published_at?: string | null
          slides?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "social_post_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_design_template_id_fkey"
            columns: ["design_template_id"]
            isOneToOne: false
            referencedRelation: "social_design_templates"
            referencedColumns: ["id"]
          },
        ]
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
      surecontact_events: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          client_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          message_id: string | null
          occurred_at: string | null
          payload: Json
          recipient_email: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id?: string | null
          campaign_name?: string | null
          client_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          message_id?: string | null
          occurred_at?: string | null
          payload?: Json
          recipient_email?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string | null
          campaign_name?: string | null
          client_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          message_id?: string | null
          occurred_at?: string | null
          payload?: Json
          recipient_email?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surecontact_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      web_dev_discovery: {
        Row: {
          client_id: string
          client_project_id: string | null
          completed: boolean
          conversation: Json
          created_at: string
          id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          client_project_id?: string | null
          completed?: boolean
          conversation?: Json
          created_at?: string
          id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_project_id?: string | null
          completed?: boolean
          conversation?: Json
          created_at?: string
          id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      web_dev_scheduled_emails: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          send_after: string
          sent_at: string | null
          task_id: string
          template_key: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          send_after: string
          sent_at?: string | null
          task_id: string
          template_key: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          send_after?: string
          sent_at?: string | null
          task_id?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_dev_scheduled_emails_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_documents: {
        Row: {
          access_level: Database["public"]["Enums"]["wiki_access_level"]
          content: string
          created_at: string
          created_by: string | null
          department: string
          doc_type: string
          draft_content: string | null
          draft_title: string | null
          draft_updated_at: string | null
          folder_id: string | null
          has_draft: boolean
          id: string
          last_reviewed_at: string | null
          owner: string | null
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["wiki_doc_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["wiki_access_level"]
          content?: string
          created_at?: string
          created_by?: string | null
          department: string
          doc_type: string
          draft_content?: string | null
          draft_title?: string | null
          draft_updated_at?: string | null
          folder_id?: string | null
          has_draft?: boolean
          id?: string
          last_reviewed_at?: string | null
          owner?: string | null
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["wiki_doc_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["wiki_access_level"]
          content?: string
          created_at?: string
          created_by?: string | null
          department?: string
          doc_type?: string
          draft_content?: string | null
          draft_title?: string | null
          draft_updated_at?: string | null
          folder_id?: string | null
          has_draft?: boolean
          id?: string
          last_reviewed_at?: string | null
          owner?: string | null
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["wiki_doc_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "wiki_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_folders: {
        Row: {
          created_at: string
          department: string | null
          id: string
          name: string
          order_index: number
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          id?: string
          name: string
          order_index?: number
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: string
          name?: string
          order_index?: number
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "wiki_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_revisions: {
        Row: {
          change_note: string | null
          content: string
          document_id: string
          edited_at: string
          edited_by: string | null
          edited_by_name: string | null
          id: string
          title: string
        }
        Insert: {
          change_note?: string | null
          content: string
          document_id: string
          edited_at?: string
          edited_by?: string | null
          edited_by_name?: string | null
          id?: string
          title: string
        }
        Update: {
          change_note?: string | null
          content?: string
          document_id?: string
          edited_at?: string
          edited_by?: string | null
          edited_by_name?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "wiki_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_user_roles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["wiki_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name: string
          role?: Database["public"]["Enums"]["wiki_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["wiki_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_automation_01_in_progress: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      automation_01_criteria_for: { Args: { _key: string }; Returns: Json }
      brain_setup_criteria_for: { Args: { _key: string }; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_automation_01_tasks_for_project: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      ensure_brain_setup_tasks_for_project: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      ensure_brand_kit_tasks_for_project: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      ensure_brand_voice_tasks_for_project: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      ensure_intake_tasks_for_project: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      fire_automation_01_build: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      fire_brain_artifacts_generation: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      fire_kickoff_webhook: { Args: { _client_id: string }; Returns: undefined }
      fire_surecontact_sync: {
        Args: { _client_id: string }
        Returns: undefined
      }
      get_portal_client: { Args: { _client_id: string }; Returns: Json }
      get_project_secret: {
        Args: { _client_project_id: string; _enc_key: string; _key: string }
        Returns: string
      }
      has_wiki_access: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_wiki_founder: { Args: { _user_id: string }; Returns: boolean }
      log_email_event_for_clients_tasks: {
        Args: {
          _client_id: string
          _item_key: string
          _kind: string
          _message: string
          _occurred_at: string
        }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      next_preview_pin: { Args: { _project_id: string }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      set_project_secret: {
        Args: {
          _client_project_id: string
          _created_by?: string
          _enc_key?: string
          _hint?: string
          _key: string
          _value: string
        }
        Returns: string
      }
      sync_email_tracking_to_task_activity: {
        Args: { _client_id: string }
        Returns: undefined
      }
    }
    Enums: {
      project_task_assignee_kind:
        | "unassigned"
        | "admin"
        | "claude"
        | "auto"
        | "client"
        | "agency"
      project_task_priority: "low" | "normal" | "high" | "urgent"
      project_task_status:
        | "backlog"
        | "ready_for_claude"
        | "in_progress"
        | "needs_review"
        | "blocked"
        | "complete"
      wiki_access_level: "Founder Only" | "All Staff"
      wiki_doc_status: "Draft" | "Active" | "Archived"
      wiki_role: "founder" | "intern" | "contractor"
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
      project_task_assignee_kind: [
        "unassigned",
        "admin",
        "claude",
        "auto",
        "client",
        "agency",
      ],
      project_task_priority: ["low", "normal", "high", "urgent"],
      project_task_status: [
        "backlog",
        "ready_for_claude",
        "in_progress",
        "needs_review",
        "blocked",
        "complete",
      ],
      wiki_access_level: ["Founder Only", "All Staff"],
      wiki_doc_status: ["Draft", "Active", "Archived"],
      wiki_role: ["founder", "intern", "contractor"],
    },
  },
} as const
