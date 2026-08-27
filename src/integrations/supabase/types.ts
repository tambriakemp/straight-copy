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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor: string | null
          agent_id: string | null
          agent_run_id: string | null
          client_id: string | null
          client_project_id: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          metadata: Json
          occurred_at: string
          title: string
          venture_id: string | null
          venture_launch_id: string | null
        }
        Insert: {
          actor?: string | null
          agent_id?: string | null
          agent_run_id?: string | null
          client_id?: string | null
          client_project_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          metadata?: Json
          occurred_at?: string
          title: string
          venture_id?: string | null
          venture_launch_id?: string | null
        }
        Update: {
          actor?: string | null
          agent_id?: string | null
          agent_run_id?: string | null
          client_id?: string | null
          client_project_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json
          occurred_at?: string
          title?: string
          venture_id?: string | null
          venture_launch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_venture_id_fkey"
            columns: ["venture_id"]
            isOneToOne: false
            referencedRelation: "ventures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_venture_launch_id_fkey"
            columns: ["venture_launch_id"]
            isOneToOne: false
            referencedRelation: "venture_launches"
            referencedColumns: ["id"]
          },
        ]
      }
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
      agent_actions: {
        Row: {
          agent_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          description: string | null
          error: string | null
          executed_at: string | null
          id: string
          kind: string
          outward: boolean
          payload: Json
          result: Json | null
          run_id: string
          status: string
          title: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          kind: string
          outward?: boolean
          payload?: Json
          result?: Json | null
          run_id: string
          status?: string
          title: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          kind?: string
          outward?: boolean
          payload?: Json
          result?: Json | null
          run_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          agent_id: string
          brief_debounce_until: string | null
          context_hash: string | null
          created_at: string
          created_by: string | null
          id: string
          last_briefed_at: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          brief_debounce_until?: string | null
          context_hash?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_briefed_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          brief_debounce_until?: string | null
          context_hash?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_briefed_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_message_steps: {
        Row: {
          created_at: string
          detail: Json | null
          id: string
          kind: string
          label: string
          message_id: string
          seq: number
          status: string
          tool_name: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          id?: string
          kind: string
          label: string
          message_id: string
          seq: number
          status?: string
          tool_name?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json | null
          id?: string
          kind?: string
          label?: string
          message_id?: string
          seq?: number
          status?: string
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_message_steps_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "agent_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          action_ids: string[]
          cache_read_tokens: number | null
          completed_at: string | null
          content: string
          conversation_id: string
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input_tokens: number | null
          iterations: number | null
          output_tokens: number | null
          questions: Json | null
          role: string
          run_id: string | null
          status: string
          stopped_by: string | null
          tool_calls: number | null
        }
        Insert: {
          action_ids?: string[]
          cache_read_tokens?: number | null
          completed_at?: string | null
          content?: string
          conversation_id: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          iterations?: number | null
          output_tokens?: number | null
          questions?: Json | null
          role: string
          run_id?: string | null
          status?: string
          stopped_by?: string | null
          tool_calls?: number | null
        }
        Update: {
          action_ids?: string[]
          cache_read_tokens?: number | null
          completed_at?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          iterations?: number | null
          output_tokens?: number | null
          questions?: Json | null
          role?: string
          run_id?: string | null
          status?: string
          stopped_by?: string | null
          tool_calls?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_rules: {
        Row: {
          agent_id: string | null
          body: string
          category: string
          created_at: string
          enabled: boolean
          id: string
          label: string
          order_index: number
          scope: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          body: string
          category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          order_index?: number
          scope?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          body?: string
          category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          order_index?: number
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          cache_read_tokens: number | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          detail: Json
          error: string | null
          finished_at: string | null
          headline: string | null
          id: string
          input_tokens: number | null
          output_tokens: number | null
          started_at: string
          status: string
          summary: string | null
          trigger: string
          venture_id: string | null
          venture_launch_id: string | null
        }
        Insert: {
          agent_id: string
          cache_read_tokens?: number | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detail?: Json
          error?: string | null
          finished_at?: string | null
          headline?: string | null
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          started_at?: string
          status?: string
          summary?: string | null
          trigger?: string
          venture_id?: string | null
          venture_launch_id?: string | null
        }
        Update: {
          agent_id?: string
          cache_read_tokens?: number | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detail?: Json
          error?: string | null
          finished_at?: string | null
          headline?: string | null
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          started_at?: string
          status?: string
          summary?: string | null
          trigger?: string
          venture_id?: string | null
          venture_launch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_venture_id_fkey"
            columns: ["venture_id"]
            isOneToOne: false
            referencedRelation: "ventures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_venture_launch_id_fkey"
            columns: ["venture_launch_id"]
            isOneToOne: false
            referencedRelation: "venture_launches"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          accent_color: string | null
          autonomy: string
          avatar_url: string | null
          config: Json
          created_at: string
          delivery: Json
          description: string | null
          effort: string
          enabled: boolean
          id: string
          key: string
          last_run_at: string | null
          model: string
          name: string
          next_run_at: string | null
          role: string
          schedule_cron: string | null
          system_prompt: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          autonomy?: string
          avatar_url?: string | null
          config?: Json
          created_at?: string
          delivery?: Json
          description?: string | null
          effort?: string
          enabled?: boolean
          id?: string
          key: string
          last_run_at?: string | null
          model?: string
          name: string
          next_run_at?: string | null
          role: string
          schedule_cron?: string | null
          system_prompt?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          autonomy?: string
          avatar_url?: string | null
          config?: Json
          created_at?: string
          delivery?: Json
          description?: string | null
          effort?: string
          enabled?: boolean
          id?: string
          key?: string
          last_run_at?: string | null
          model?: string
          name?: string
          next_run_at?: string | null
          role?: string
          schedule_cron?: string | null
          system_prompt?: string | null
          timezone?: string
          updated_at?: string
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
      client_companies: {
        Row: {
          archived: boolean
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          order_index: number
          phone: string | null
          surecontact_company_uuid: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          archived?: boolean
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          order_index?: number
          phone?: string | null
          surecontact_company_uuid?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          archived?: boolean
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          order_index?: number
          phone?: string | null
          surecontact_company_uuid?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_companies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
          {
            foreignKeyName: "client_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_companies"
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
          agent_autonomy: string | null
          build_notes: string | null
          business_name: string | null
          client_id: string
          company_id: string | null
          created_at: string
          delivery_mode: string
          deploy_project_id: string | null
          deploy_project_name: string | null
          deploy_provider: string | null
          id: string
          name: string
          notes: string | null
          primary_contact_id: string | null
          progress_report_enabled: boolean
          progress_report_last_sent_at: string | null
          progress_report_recipient_ids: string[]
          queue_enabled: boolean
          repo_branch: string
          repo_url: string | null
          social_settings: Json
          source_order_id: string | null
          status: string
          subscription_status: string | null
          timezone: string | null
          toolchain: string
          type: string
          updated_at: string
        }
        Insert: {
          agent_autonomy?: string | null
          build_notes?: string | null
          business_name?: string | null
          client_id: string
          company_id?: string | null
          created_at?: string
          delivery_mode?: string
          deploy_project_id?: string | null
          deploy_project_name?: string | null
          deploy_provider?: string | null
          id?: string
          name: string
          notes?: string | null
          primary_contact_id?: string | null
          progress_report_enabled?: boolean
          progress_report_last_sent_at?: string | null
          progress_report_recipient_ids?: string[]
          queue_enabled?: boolean
          repo_branch?: string
          repo_url?: string | null
          social_settings?: Json
          source_order_id?: string | null
          status?: string
          subscription_status?: string | null
          timezone?: string | null
          toolchain?: string
          type: string
          updated_at?: string
        }
        Update: {
          agent_autonomy?: string | null
          build_notes?: string | null
          business_name?: string | null
          client_id?: string
          company_id?: string | null
          created_at?: string
          delivery_mode?: string
          deploy_project_id?: string | null
          deploy_project_name?: string | null
          deploy_provider?: string | null
          id?: string
          name?: string
          notes?: string | null
          primary_contact_id?: string | null
          progress_report_enabled?: boolean
          progress_report_last_sent_at?: string | null
          progress_report_recipient_ids?: string[]
          queue_enabled?: boolean
          repo_branch?: string
          repo_url?: string | null
          social_settings?: Json
          source_order_id?: string | null
          status?: string
          subscription_status?: string | null
          timezone?: string | null
          toolchain?: string
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
          {
            foreignKeyName: "client_projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_projects_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_proposal_versions: {
        Row: {
          changed_by: string | null
          changed_by_agent: string | null
          content: Json
          created_at: string
          id: string
          note: string | null
          proposal_id: string
          version: number
        }
        Insert: {
          changed_by?: string | null
          changed_by_agent?: string | null
          content: Json
          created_at?: string
          id?: string
          note?: string | null
          proposal_id: string
          version: number
        }
        Update: {
          changed_by?: string | null
          changed_by_agent?: string | null
          content?: Json
          created_at?: string
          id?: string
          note?: string | null
          proposal_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_proposal_versions_changed_by_agent_fkey"
            columns: ["changed_by_agent"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "client_proposals"
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
          content: Json | null
          content_version: number
          created_at: string
          created_by_agent: string | null
          decline_reason: string | null
          declined_at: string | null
          description: string | null
          first_opened_at: string | null
          first_viewed_at: string | null
          followup_count: number
          id: string
          last_activity_at: string | null
          meeting_link: string | null
          next_followup_at: string | null
          pdf_generated_at: string | null
          send_message_id: string | null
          sent_at: string | null
          sent_to: string | null
          signed_pdf_path: string | null
          source_pdf_path: string | null
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
          content?: Json | null
          content_version?: number
          created_at?: string
          created_by_agent?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          description?: string | null
          first_opened_at?: string | null
          first_viewed_at?: string | null
          followup_count?: number
          id?: string
          last_activity_at?: string | null
          meeting_link?: string | null
          next_followup_at?: string | null
          pdf_generated_at?: string | null
          send_message_id?: string | null
          sent_at?: string | null
          sent_to?: string | null
          signed_pdf_path?: string | null
          source_pdf_path?: string | null
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
          content?: Json | null
          content_version?: number
          created_at?: string
          created_by_agent?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          description?: string | null
          first_opened_at?: string | null
          first_viewed_at?: string | null
          followup_count?: number
          id?: string
          last_activity_at?: string | null
          meeting_link?: string | null
          next_followup_at?: string | null
          pdf_generated_at?: string | null
          send_message_id?: string | null
          sent_at?: string | null
          sent_to?: string | null
          signed_pdf_path?: string | null
          source_pdf_path?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_proposals_created_by_agent_fkey"
            columns: ["created_by_agent"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
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
          payment_provider: string | null
          pipeline_stage: string
          purchased_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
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
          payment_provider?: string | null
          pipeline_stage?: string
          purchased_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
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
          payment_provider?: string | null
          pipeline_stage?: string
          purchased_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
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
      funnel_events: {
        Row: {
          anon_id: string | null
          created_at: string
          email_hash: string | null
          event_key: string | null
          id: string
          launch_id: string | null
          metadata: Json
          occurred_at: string
          source: string
          stage: string
          utm: Json
          venture_id: string
        }
        Insert: {
          anon_id?: string | null
          created_at?: string
          email_hash?: string | null
          event_key?: string | null
          id?: string
          launch_id?: string | null
          metadata?: Json
          occurred_at?: string
          source?: string
          stage: string
          utm?: Json
          venture_id: string
        }
        Update: {
          anon_id?: string | null
          created_at?: string
          email_hash?: string | null
          event_key?: string | null
          id?: string
          launch_id?: string | null
          metadata?: Json
          occurred_at?: string
          source?: string
          stage?: string
          utm?: Json
          venture_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_events_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "venture_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_events_venture_id_fkey"
            columns: ["venture_id"]
            isOneToOne: false
            referencedRelation: "ventures"
            referencedColumns: ["id"]
          },
        ]
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
      launch_checklist_items: {
        Row: {
          checklist: Json
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          key: string
          label: string
          launch_id: string
          notes: string | null
          order_index: number
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          checklist?: Json
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          key: string
          label: string
          launch_id: string
          notes?: string | null
          order_index?: number
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist?: Json
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          key?: string
          label?: string
          launch_id?: string
          notes?: string | null
          order_index?: number
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_checklist_items_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "venture_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "launch_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "launch_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_checklist_templates: {
        Row: {
          checklist: Json
          created_at: string
          description: string | null
          id: string
          key: string
          label: string
          offset_days: number | null
          order_index: number
          venture_id: string
        }
        Insert: {
          checklist?: Json
          created_at?: string
          description?: string | null
          id?: string
          key: string
          label: string
          offset_days?: number | null
          order_index?: number
          venture_id: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
          offset_days?: number | null
          order_index?: number
          venture_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_checklist_templates_venture_id_fkey"
            columns: ["venture_id"]
            isOneToOne: false
            referencedRelation: "ventures"
            referencedColumns: ["id"]
          },
        ]
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
      metric_snapshots: {
        Row: {
          captured_on: string
          created_at: string
          id: string
          metric_key: string
          notes: string | null
          source: string
          value: number
          venture_id: string
        }
        Insert: {
          captured_on: string
          created_at?: string
          id?: string
          metric_key: string
          notes?: string | null
          source?: string
          value: number
          venture_id: string
        }
        Update: {
          captured_on?: string
          created_at?: string
          id?: string
          metric_key?: string
          notes?: string | null
          source?: string
          value?: number
          venture_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_snapshots_venture_id_fkey"
            columns: ["venture_id"]
            isOneToOne: false
            referencedRelation: "ventures"
            referencedColumns: ["id"]
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
          group_label: string | null
          id: string
          label: string | null
          order_index: number
          path: string
          project_id: string
          visible_to_client: boolean
        }
        Insert: {
          created_at?: string
          group_label?: string | null
          id?: string
          label?: string | null
          order_index?: number
          path: string
          project_id: string
          visible_to_client?: boolean
        }
        Update: {
          created_at?: string
          group_label?: string | null
          id?: string
          label?: string | null
          order_index?: number
          path?: string
          project_id?: string
          visible_to_client?: boolean
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
          group_label: string | null
          id: string
          label: string | null
          order_index: number
          path: string
          project_id: string
          size_bytes: number | null
          visible_to_client: boolean
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          group_label?: string | null
          id?: string
          label?: string | null
          order_index?: number
          path: string
          project_id: string
          size_bytes?: number | null
          visible_to_client?: boolean
        }
        Update: {
          content_type?: string | null
          created_at?: string
          group_label?: string | null
          id?: string
          label?: string | null
          order_index?: number
          path?: string
          project_id?: string
          size_bytes?: number | null
          visible_to_client?: boolean
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
      project_progress_reports: {
        Row: {
          client_project_id: string
          created_at: string
          error: string | null
          id: string
          period_end: string
          period_start: string
          recipients: string[]
          sent_at: string | null
          summary_html: string | null
          summary_markdown: string | null
          task_ids: string[]
        }
        Insert: {
          client_project_id: string
          created_at?: string
          error?: string | null
          id?: string
          period_end: string
          period_start: string
          recipients?: string[]
          sent_at?: string | null
          summary_html?: string | null
          summary_markdown?: string | null
          task_ids?: string[]
        }
        Update: {
          client_project_id?: string
          created_at?: string
          error?: string | null
          id?: string
          period_end?: string
          period_start?: string
          recipients?: string[]
          sent_at?: string | null
          summary_html?: string | null
          summary_markdown?: string | null
          task_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "project_progress_reports_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
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
      project_task_comments: {
        Row: {
          acknowledged_by: string[]
          author_name: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          mentions: string[]
          task_id: string
          updated_at: string
        }
        Insert: {
          acknowledged_by?: string[]
          author_name: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id: string
          updated_at?: string
        }
        Update: {
          acknowledged_by?: string[]
          author_name?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_task_comments_task_id_fkey"
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
          claimed_at: string | null
          claimed_by: string | null
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
          claimed_at?: string | null
          claimed_by?: string | null
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
          claimed_at?: string | null
          claimed_by?: string | null
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
      proposal_events: {
        Row: {
          actor: string
          client_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: string
          occurred_at: string
          proposal_id: string
        }
        Insert: {
          actor?: string
          client_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          occurred_at?: string
          proposal_id: string
        }
        Update: {
          actor?: string
          client_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "client_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      queue_fire_log: {
        Row: {
          client_project_id: string | null
          detail: string | null
          fired_at: string
          id: number
          outcome: string
          route_id: string | null
          task_id: string | null
        }
        Insert: {
          client_project_id?: string | null
          detail?: string | null
          fired_at?: string
          id?: number
          outcome: string
          route_id?: string | null
          task_id?: string | null
        }
        Update: {
          client_project_id?: string | null
          detail?: string | null
          fired_at?: string
          id?: number
          outcome?: string
          route_id?: string | null
          task_id?: string | null
        }
        Relationships: []
      }
      queue_fire_routes: {
        Row: {
          client_project_id: string | null
          created_at: string
          debounce_seconds: number
          enabled: boolean
          id: string
          secret_prefix: string
        }
        Insert: {
          client_project_id?: string | null
          created_at?: string
          debounce_seconds?: number
          enabled?: boolean
          id?: string
          secret_prefix: string
        }
        Update: {
          client_project_id?: string | null
          created_at?: string
          debounce_seconds?: number
          enabled?: boolean
          id?: string
          secret_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_fire_routes_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_entries: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          description: string | null
          external_id: string | null
          id: string
          kind: string
          launch_id: string | null
          metadata: Json
          occurred_at: string
          source: string
          venture_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          description?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          launch_id?: string | null
          metadata?: Json
          occurred_at: string
          source?: string
          venture_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          description?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          launch_id?: string | null
          metadata?: Json
          occurred_at?: string
          source?: string
          venture_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_entries_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "venture_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_entries_venture_id_fkey"
            columns: ["venture_id"]
            isOneToOne: false
            referencedRelation: "ventures"
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
      social_follower_snapshots: {
        Row: {
          captured_at: string
          client_project_id: string
          created_at: string
          follower_count: number
          id: string
          platform: string
          source: string
        }
        Insert: {
          captured_at?: string
          client_project_id: string
          created_at?: string
          follower_count: number
          id?: string
          platform: string
          source?: string
        }
        Update: {
          captured_at?: string
          client_project_id?: string
          created_at?: string
          follower_count?: number
          id?: string
          platform?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_follower_snapshots_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      social_images: {
        Row: {
          caption: string | null
          caption_error: string | null
          caption_status: string
          client_project_id: string
          copost_error: string | null
          copost_sent_at: string | null
          copost_status: string
          created_at: string
          created_by: string | null
          hashtags: string[]
          height: number | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          width: number | null
        }
        Insert: {
          caption?: string | null
          caption_error?: string | null
          caption_status?: string
          client_project_id: string
          copost_error?: string | null
          copost_sent_at?: string | null
          copost_status?: string
          created_at?: string
          created_by?: string | null
          hashtags?: string[]
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          caption?: string | null
          caption_error?: string | null
          caption_status?: string
          client_project_id?: string
          copost_error?: string | null
          copost_sent_at?: string | null
          copost_status?: string
          created_at?: string
          created_by?: string | null
          hashtags?: string[]
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_images_client_project_id_fkey"
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
      social_post_events: {
        Row: {
          client_project_id: string | null
          copost_post_id: string | null
          event: string
          id: number
          payload: Json
          received_at: string
          schedule_id: string | null
          signature_valid: boolean | null
        }
        Insert: {
          client_project_id?: string | null
          copost_post_id?: string | null
          event: string
          id?: number
          payload?: Json
          received_at?: string
          schedule_id?: string | null
          signature_valid?: boolean | null
        }
        Update: {
          client_project_id?: string | null
          copost_post_id?: string | null
          event?: string
          id?: number
          payload?: Json
          received_at?: string
          schedule_id?: string | null
          signature_valid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "social_post_events_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_events_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "social_schedule"
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
      social_schedule: {
        Row: {
          agent_action_id: string | null
          attempts: number
          claimed_at: string | null
          client_project_id: string
          copost_post_id: string | null
          created_at: string
          created_by_agent: string | null
          id: string
          last_error: string | null
          max_attempts: number
          scheduled_at: string
          sent_at: string | null
          social_image_id: string | null
          social_post_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_action_id?: string | null
          attempts?: number
          claimed_at?: string | null
          client_project_id: string
          copost_post_id?: string | null
          created_at?: string
          created_by_agent?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          scheduled_at: string
          sent_at?: string | null
          social_image_id?: string | null
          social_post_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_action_id?: string | null
          attempts?: number
          claimed_at?: string | null
          client_project_id?: string
          copost_post_id?: string | null
          created_at?: string
          created_by_agent?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          scheduled_at?: string
          sent_at?: string | null
          social_image_id?: string | null
          social_post_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_schedule_agent_action_id_fkey"
            columns: ["agent_action_id"]
            isOneToOne: false
            referencedRelation: "agent_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_schedule_agent_action_id_fkey"
            columns: ["agent_action_id"]
            isOneToOne: false
            referencedRelation: "agent_pending_actions_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_schedule_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_schedule_created_by_agent_fkey"
            columns: ["created_by_agent"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_schedule_social_image_id_fkey"
            columns: ["social_image_id"]
            isOneToOne: false
            referencedRelation: "social_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_schedule_social_post_id_fkey"
            columns: ["social_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_signups: {
        Row: {
          answers: Json
          business_name: string | null
          client_id: string | null
          client_project_id: string | null
          completed_at: string | null
          consented_at: string | null
          contact_name: string | null
          created_at: string
          email: string
          id: string
          phone: string | null
          status: string
          stripe_session_id: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          business_name?: string | null
          client_id?: string | null
          client_project_id?: string | null
          completed_at?: string | null
          consented_at?: string | null
          contact_name?: string | null
          created_at?: string
          email: string
          id?: string
          phone?: string | null
          status?: string
          stripe_session_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          business_name?: string | null
          client_id?: string | null
          client_project_id?: string | null
          completed_at?: string | null
          consented_at?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string
          id?: string
          phone?: string | null
          status?: string
          stripe_session_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_signups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_signups_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
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
          proposal_id: string | null
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
          proposal_id?: string | null
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
          proposal_id?: string | null
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
          {
            foreignKeyName: "surecontact_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "client_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      venture_launches: {
        Row: {
          cart_close_at: string | null
          cart_open_at: string | null
          created_at: string
          ends_at: string | null
          goal_revenue_cents: number | null
          goal_signups: number | null
          id: string
          name: string
          notes: string | null
          slug: string
          starts_at: string | null
          status: string
          ticket_price_cents: number | null
          updated_at: string
          venture_id: string
        }
        Insert: {
          cart_close_at?: string | null
          cart_open_at?: string | null
          created_at?: string
          ends_at?: string | null
          goal_revenue_cents?: number | null
          goal_signups?: number | null
          id?: string
          name: string
          notes?: string | null
          slug: string
          starts_at?: string | null
          status?: string
          ticket_price_cents?: number | null
          updated_at?: string
          venture_id: string
        }
        Update: {
          cart_close_at?: string | null
          cart_open_at?: string | null
          created_at?: string
          ends_at?: string | null
          goal_revenue_cents?: number | null
          goal_signups?: number | null
          id?: string
          name?: string
          notes?: string | null
          slug?: string
          starts_at?: string | null
          status?: string
          ticket_price_cents?: number | null
          updated_at?: string
          venture_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venture_launches_venture_id_fkey"
            columns: ["venture_id"]
            isOneToOne: false
            referencedRelation: "ventures"
            referencedColumns: ["id"]
          },
        ]
      }
      ventures: {
        Row: {
          brand_color: string | null
          created_at: string
          currency: string
          description: string | null
          funnel_stages: Json
          goal_members: number | null
          goal_mrr_cents: number | null
          id: string
          kind: string
          name: string
          platform: string | null
          platform_account_ref: string | null
          public_ingest_key: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          funnel_stages?: Json
          goal_members?: number | null
          goal_mrr_cents?: number | null
          id?: string
          kind?: string
          name: string
          platform?: string | null
          platform_account_ref?: string | null
          public_ingest_key?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          funnel_stages?: Json
          goal_members?: number | null
          goal_mrr_cents?: number | null
          id?: string
          kind?: string
          name?: string
          platform?: string | null
          platform_account_ref?: string | null
          public_ingest_key?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      agent_pending_actions_v: {
        Row: {
          agent_id: string | null
          agent_key: string | null
          agent_name: string | null
          created_at: string | null
          description: string | null
          id: string | null
          kind: string | null
          outward: boolean | null
          payload: Json | null
          run_id: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      latest_metric_snapshots_v: {
        Row: {
          captured_on: string | null
          metric_key: string | null
          source: string | null
          value: number | null
          venture_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_snapshots_venture_id_fkey"
            columns: ["venture_id"]
            isOneToOne: false
            referencedRelation: "ventures"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_ledger_v: {
        Row: {
          amount_cents: number | null
          client_id: string | null
          currency: string | null
          kind: string | null
          launch_id: string | null
          occurred_at: string | null
          stream: string | null
          venture_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_automation_01_in_progress: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      automation_01_criteria_for: { Args: { _key: string }; Returns: Json }
      brain_setup_criteria_for: { Args: { _key: string }; Returns: Json }
      claim_due_social_sends: {
        Args: { _limit?: number }
        Returns: {
          agent_action_id: string | null
          attempts: number
          claimed_at: string | null
          client_project_id: string
          copost_post_id: string | null
          created_at: string
          created_by_agent: string | null
          id: string
          last_error: string | null
          max_attempts: number
          scheduled_at: string
          sent_at: string | null
          social_image_id: string | null
          social_post_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "social_schedule"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_task: {
        Args: { _stale_after?: string; _task_id: string; _worker: string }
        Returns: {
          claimed: boolean
          held_by: string
          id: string
        }[]
      }
      client_exists_active: { Args: { _client_id: string }; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
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
      fire_agent_dispatch: { Args: never; Returns: undefined }
      fire_automation_01_build: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      fire_brain_artifacts_generation: {
        Args: { _client_project_id: string }
        Returns: undefined
      }
      fire_kickoff_webhook: { Args: { _client_id: string }; Returns: undefined }
      fire_queue_routine: {
        Args: {
          p_client_project_id: string
          p_reason?: string
          p_task_id?: string
        }
        Returns: undefined
      }
      fire_social_dispatch: { Args: never; Returns: undefined }
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
      reap_abandoned_agent_messages: { Args: never; Returns: number }
      reap_stranded_social_sends: { Args: never; Returns: number }
      release_task: {
        Args: { _task_id: string; _worker: string }
        Returns: undefined
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
