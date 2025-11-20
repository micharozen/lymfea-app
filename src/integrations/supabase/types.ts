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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          country_code: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
          profile_image: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          country_code?: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          phone: string
          profile_image?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string
          profile_image?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      booking_treatments: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          treatment_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          treatment_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_treatments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_treatments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatment_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          assigned_at: string | null
          booking_date: string
          booking_id: number
          booking_time: string
          cancellation_reason: string | null
          client_first_name: string
          client_last_name: string
          client_signature: string | null
          created_at: string
          hairdresser_id: string | null
          hairdresser_name: string | null
          hotel_id: string
          hotel_name: string | null
          id: string
          phone: string
          room_number: string | null
          signed_at: string | null
          status: string
          total_price: number | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          booking_date: string
          booking_id?: number
          booking_time: string
          cancellation_reason?: string | null
          client_first_name: string
          client_last_name: string
          client_signature?: string | null
          created_at?: string
          hairdresser_id?: string | null
          hairdresser_name?: string | null
          hotel_id: string
          hotel_name?: string | null
          id?: string
          phone: string
          room_number?: string | null
          signed_at?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          booking_date?: string
          booking_id?: number
          booking_time?: string
          cancellation_reason?: string | null
          client_first_name?: string
          client_last_name?: string
          client_signature?: string | null
          created_at?: string
          hairdresser_id?: string | null
          hairdresser_name?: string | null
          hotel_id?: string
          hotel_name?: string | null
          id?: string
          phone?: string
          room_number?: string | null
          signed_at?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      boxes: {
        Row: {
          box_id: string
          box_model: string
          created_at: string
          hairdresser_name: string | null
          hotel_id: string | null
          hotel_name: string | null
          id: string
          image: string | null
          name: string
          next_booking: string | null
          status: string
          updated_at: string
        }
        Insert: {
          box_id: string
          box_model: string
          created_at?: string
          hairdresser_name?: string | null
          hotel_id?: string | null
          hotel_name?: string | null
          id?: string
          image?: string | null
          name: string
          next_booking?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          box_id?: string
          box_model?: string
          created_at?: string
          hairdresser_name?: string | null
          hotel_id?: string | null
          hotel_name?: string | null
          id?: string
          image?: string | null
          name?: string
          next_booking?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      concierge_hotels: {
        Row: {
          concierge_id: string
          created_at: string | null
          hotel_id: string
          id: string
        }
        Insert: {
          concierge_id: string
          created_at?: string | null
          hotel_id: string
          id?: string
        }
        Update: {
          concierge_id?: string
          created_at?: string | null
          hotel_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concierge_hotels_concierge_id_fkey"
            columns: ["concierge_id"]
            isOneToOne: false
            referencedRelation: "concierges"
            referencedColumns: ["id"]
          },
        ]
      }
      concierges: {
        Row: {
          country_code: string
          created_at: string
          email: string
          first_name: string
          hotel_id: string | null
          id: string
          last_name: string
          phone: string
          profile_image: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          country_code?: string
          created_at?: string
          email: string
          first_name: string
          hotel_id?: string | null
          id?: string
          last_name: string
          phone: string
          profile_image?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          email?: string
          first_name?: string
          hotel_id?: string | null
          id?: string
          last_name?: string
          phone?: string
          profile_image?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      hairdresser_hotels: {
        Row: {
          created_at: string | null
          hairdresser_id: string
          hotel_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          hairdresser_id: string
          hotel_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          hairdresser_id?: string
          hotel_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hairdresser_hotels_hairdresser_id_fkey"
            columns: ["hairdresser_id"]
            isOneToOne: false
            referencedRelation: "hairdressers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hairdresser_hotels_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hairdressers: {
        Row: {
          boxes: string | null
          country_code: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
          profile_image: string | null
          skills: string[] | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          boxes?: string | null
          country_code?: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          phone: string
          profile_image?: string | null
          skills?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          boxes?: string | null
          country_code?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string
          profile_image?: string | null
          skills?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      hotels: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          cover_image: string | null
          created_at: string
          currency: string | null
          hairdresser_commission: number | null
          hotel_commission: number | null
          id: string
          image: string | null
          name: string
          postal_code: string | null
          status: string | null
          updated_at: string
          vat: number | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string | null
          hairdresser_commission?: number | null
          hotel_commission?: number | null
          id: string
          image?: string | null
          name: string
          postal_code?: string | null
          status?: string | null
          updated_at?: string
          vat?: number | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string | null
          hairdresser_commission?: number | null
          hotel_commission?: number | null
          id?: string
          image?: string | null
          name?: string
          postal_code?: string | null
          status?: string | null
          updated_at?: string
          vat?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          message: string
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          message: string
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_booking"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_menus: {
        Row: {
          buffer_time: number | null
          category: string
          created_at: string
          description: string | null
          duration: number | null
          hotel_id: string | null
          id: string
          image: string | null
          name: string
          price: number | null
          service_for: string
          sort_order: number | null
          status: string
          updated_at: string
        }
        Insert: {
          buffer_time?: number | null
          category: string
          created_at?: string
          description?: string | null
          duration?: number | null
          hotel_id?: string | null
          id?: string
          image?: string | null
          name: string
          price?: number | null
          service_for: string
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          buffer_time?: number | null
          category?: string
          created_at?: string
          description?: string | null
          duration?: number | null
          hotel_id?: string | null
          id?: string
          image?: string | null
          name?: string
          price?: number | null
          service_for?: string
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      get_concierge_hotels: {
        Args: { _user_id: string }
        Returns: {
          hotel_id: string
        }[]
      }
      get_hairdresser_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "concierge" | "hairdresser"
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
      app_role: ["admin", "moderator", "user", "concierge", "hairdresser"],
    },
  },
} as const
