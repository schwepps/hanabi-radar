export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      item_sources: {
        Row: {
          author_degree: Database["public"]["Enums"]["author_degree"]
          item_id: string
          seen_at: string
          sensor_id: string
          social_proof: string | null
        }
        Insert: {
          author_degree?: Database["public"]["Enums"]["author_degree"]
          item_id: string
          seen_at?: string
          sensor_id: string
          social_proof?: string | null
        }
        Update: {
          author_degree?: Database["public"]["Enums"]["author_degree"]
          item_id?: string
          seen_at?: string
          sensor_id?: string
          social_proof?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_sources_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_sources_sensor_id_fkey"
            columns: ["sensor_id"]
            isOneToOne: false
            referencedRelation: "sensors"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          account: string | null
          author_company: string | null
          author_name: string
          author_profile_url: string | null
          author_title: string | null
          author_type: Database["public"]["Enums"]["author_type"]
          best_author_degree: Database["public"]["Enums"]["author_degree"]
          captured_at: string
          comment_count: number
          created_at: string
          domains: string[]
          hashtags: string[]
          heat: Database["public"]["Enums"]["heat"] | null
          id: string
          is_repost: boolean
          linkedin_post_id: string
          media_title: string | null
          original_author_name: string | null
          original_author_profile_url: string | null
          post_type: Database["public"]["Enums"]["post_type"]
          posted_at: string | null
          posted_at_raw: string | null
          priority: number
          reaction_count: number
          seen_count: number
          status: Database["public"]["Enums"]["status"]
          stream: Database["public"]["Enums"]["stream"] | null
          summary: string | null
          text: string | null
          updated_at: string
          url: string
        }
        Insert: {
          account?: string | null
          author_company?: string | null
          author_name: string
          author_profile_url?: string | null
          author_title?: string | null
          author_type?: Database["public"]["Enums"]["author_type"]
          best_author_degree?: Database["public"]["Enums"]["author_degree"]
          captured_at: string
          comment_count?: number
          created_at?: string
          domains?: string[]
          hashtags?: string[]
          heat?: Database["public"]["Enums"]["heat"] | null
          id?: string
          is_repost?: boolean
          linkedin_post_id: string
          media_title?: string | null
          original_author_name?: string | null
          original_author_profile_url?: string | null
          post_type?: Database["public"]["Enums"]["post_type"]
          posted_at?: string | null
          posted_at_raw?: string | null
          priority?: number
          reaction_count?: number
          seen_count?: number
          status?: Database["public"]["Enums"]["status"]
          stream?: Database["public"]["Enums"]["stream"] | null
          summary?: string | null
          text?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          account?: string | null
          author_company?: string | null
          author_name?: string
          author_profile_url?: string | null
          author_title?: string | null
          author_type?: Database["public"]["Enums"]["author_type"]
          best_author_degree?: Database["public"]["Enums"]["author_degree"]
          captured_at?: string
          comment_count?: number
          created_at?: string
          domains?: string[]
          hashtags?: string[]
          heat?: Database["public"]["Enums"]["heat"] | null
          id?: string
          is_repost?: boolean
          linkedin_post_id?: string
          media_title?: string | null
          original_author_name?: string | null
          original_author_profile_url?: string | null
          post_type?: Database["public"]["Enums"]["post_type"]
          posted_at?: string | null
          posted_at_raw?: string | null
          priority?: number
          reaction_count?: number
          seen_count?: number
          status?: Database["public"]["Enums"]["status"]
          stream?: Database["public"]["Enums"]["stream"] | null
          summary?: string | null
          text?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          active: boolean
          created_at: string
          id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      sensors: {
        Row: {
          active: boolean
          consented_at: string | null
          email: string
          id: string
          name: string
          token_hash: string
        }
        Insert: {
          active?: boolean
          consented_at?: string | null
          email: string
          id?: string
          name: string
          token_hash: string
        }
        Update: {
          active?: boolean
          consented_at?: string | null
          email?: string
          id?: string
          name?: string
          token_hash?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ingest_posts: {
        Args: { p_posts: Json; p_sensor_id: string }
        Returns: Json
      }
      is_partner: { Args: never; Returns: boolean }
      recompute_best_author_degree: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      record_sensor_consent: { Args: { p_sensor_id: string }; Returns: string }
    }
    Enums: {
      author_degree: "first" | "second" | "third" | "none"
      author_type: "person" | "company"
      heat: "cold" | "warm" | "hot"
      post_type:
        | "text"
        | "image"
        | "multi_image"
        | "video"
        | "document"
        | "poll"
        | "article"
      status: "new" | "processed" | "dismissed"
      stream: "signal" | "opportunity" | "trend" | "noise"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      author_degree: ["first", "second", "third", "none"],
      author_type: ["person", "company"],
      heat: ["cold", "warm", "hot"],
      post_type: [
        "text",
        "image",
        "multi_image",
        "video",
        "document",
        "poll",
        "article",
      ],
      status: ["new", "processed", "dismissed"],
      stream: ["signal", "opportunity", "trend", "noise"],
    },
  },
} as const

