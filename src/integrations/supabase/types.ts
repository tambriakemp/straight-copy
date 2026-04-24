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
      client_automations: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
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
        ]
      }
      client_checklist_items: {
        Row: {
          client_id: string
          completed: boolean
          created_at: string
          id: string
          label: string
          order_index: number
        }
        Insert: {
          client_id: string
          completed?: boolean
          created_at?: string
          id?: string
          label: string
          order_index?: number
        }
        Update: {
          client_id?: string
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
        ]
      }
      client_deliveries: {
        Row: {
          client_id: string
          created_at: string
          delivery_date: string
          description: string | null
          id: string
          link_url: string | null
          title: string
        }
        Insert: {
          client_id: string
          created_at?: string
          delivery_date?: string
          description?: string | null
          id?: string
          link_url?: string | null
          title: string
        }
        Update: {
          client_id?: string
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
          business_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          intake_data: Json | null
          intake_summary: string | null
          notes: string | null
          onboarding_submission_id: string | null
          pipeline_stage: string
          purchased_at: string | null
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
          business_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          intake_data?: Json | null
          intake_summary?: string | null
          notes?: string | null
          onboarding_submission_id?: string | null
          pipeline_stage?: string
          purchased_at?: string | null
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
          business_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          intake_data?: Json | null
          intake_summary?: string | null
          notes?: string | null
          onboarding_submission_id?: string | null
          pipeline_stage?: string
          purchased_at?: string | null
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
          client_id: string
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
          client_id: string
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
          client_id?: string
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
          created_at: string
          description: string | null
          id: string
          key: string
          label: string
          order_index: number
          tier: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          label: string
          order_index: number
          tier: string
        }
        Update: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_portal_client: { Args: { _client_id: string }; Returns: Json }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
