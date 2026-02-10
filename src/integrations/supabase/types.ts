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
    PostgrestVersion: "14.1"
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
      booking_proposed_slots: {
        Row: {
          id: string
          booking_id: string
          slot_1_date: string
          slot_1_time: string
          slot_2_date: string | null
          slot_2_time: string | null
          slot_3_date: string | null
          slot_3_time: string | null
          validated_slot: number | null
          validated_by: string | null
          validated_at: string | null
          expires_at: string
          admin_notified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          slot_1_date: string
          slot_1_time: string
          slot_2_date?: string | null
          slot_2_time?: string | null
          slot_3_date?: string | null
          slot_3_time?: string | null
          validated_slot?: number | null
          validated_by?: string | null
          validated_at?: string | null
          expires_at?: string
          admin_notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          slot_1_date?: string
          slot_1_time?: string
          slot_2_date?: string | null
          slot_2_time?: string | null
          slot_3_date?: string | null
          slot_3_time?: string | null
          validated_slot?: number | null
          validated_by?: string | null
          validated_at?: string | null
          expires_at?: string
          admin_notified_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_proposed_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_proposed_slots_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "hairdressers"
            referencedColumns: ["id"]
          },
        ]
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
          client_email: string | null
          client_first_name: string
          client_last_name: string
          client_note: string | null
          client_signature: string | null
          created_at: string
          declined_by: string[] | null
          duration: number | null
          hairdresser_id: string | null
          hairdresser_name: string | null
          hotel_id: string
          hotel_name: string | null
          id: string
          payment_link_channels: string[] | null
          payment_link_language: string | null
          payment_link_sent_at: string | null
          payment_link_url: string | null
          payment_method: string | null
          payment_status: string | null
          phone: string
          quote_token: string | null
          room_number: string | null
          signed_at: string | null
          status: string
          stripe_invoice_url: string | null
          total_price: number | null
          trunk_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          booking_date: string
          booking_id?: number
          booking_time: string
          cancellation_reason?: string | null
          client_email?: string | null
          client_first_name: string
          client_last_name: string
          client_note?: string | null
          client_signature?: string | null
          created_at?: string
          declined_by?: string[] | null
          duration?: number | null
          hairdresser_id?: string | null
          hairdresser_name?: string | null
          hotel_id: string
          hotel_name?: string | null
          id?: string
          payment_link_channels?: string[] | null
          payment_link_language?: string | null
          payment_link_sent_at?: string | null
          payment_link_url?: string | null
          payment_method?: string | null
          payment_status?: string | null
          phone: string
          quote_token?: string | null
          room_number?: string | null
          signed_at?: string | null
          status?: string
          stripe_invoice_url?: string | null
          total_price?: number | null
          trunk_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          booking_date?: string
          booking_id?: number
          booking_time?: string
          cancellation_reason?: string | null
          client_email?: string | null
          client_first_name?: string
          client_last_name?: string
          client_note?: string | null
          client_signature?: string | null
          created_at?: string
          declined_by?: string[] | null
          duration?: number | null
          hairdresser_id?: string | null
          hairdresser_name?: string | null
          hotel_id?: string
          hotel_name?: string | null
          id?: string
          payment_link_channels?: string[] | null
          payment_link_language?: string | null
          payment_link_sent_at?: string | null
          payment_link_url?: string | null
          payment_method?: string | null
          payment_status?: string | null
          phone?: string
          quote_token?: string | null
          room_number?: string | null
          signed_at?: string | null
          status?: string
          stripe_invoice_url?: string | null
          total_price?: number | null
          trunk_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_trunk_id_fkey"
            columns: ["trunk_id"]
            isOneToOne: false
            referencedRelation: "trunks"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "concierge_hotels_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
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
          must_change_password: boolean
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
          must_change_password?: boolean
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
          must_change_password?: boolean
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
      hairdresser_payouts: {
        Row: {
          amount: number
          booking_id: string
          created_at: string | null
          error_message: string | null
          hairdresser_id: string
          id: string
          organization_id: string | null
          status: string
          stripe_transfer_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string | null
          error_message?: string | null
          hairdresser_id: string
          id?: string
          organization_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string | null
          error_message?: string | null
          hairdresser_id?: string
          id?: string
          organization_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hairdresser_payouts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hairdresser_payouts_hairdresser_id_fkey"
            columns: ["hairdresser_id"]
            isOneToOne: false
            referencedRelation: "hairdressers"
            referencedColumns: ["id"]
          },
        ]
      }
      hairdresser_ratings: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          hairdresser_id: string
          id: string
          rating: number
          rating_token: string | null
          submitted_at: string | null
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          hairdresser_id: string
          id?: string
          rating: number
          rating_token?: string | null
          submitted_at?: string | null
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          hairdresser_id?: string
          id?: string
          rating?: number
          rating_token?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hairdresser_ratings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hairdresser_ratings_hairdresser_id_fkey"
            columns: ["hairdresser_id"]
            isOneToOne: false
            referencedRelation: "hairdressers"
            referencedColumns: ["id"]
          },
        ]
      }
      hairdressers: {
        Row: {
          country_code: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          password_set: boolean | null
          phone: string
          profile_image: string | null
          skills: string[] | null
          status: string
          stripe_account_id: string | null
          stripe_onboarding_completed: boolean | null
          trunks: string | null
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
          password_set?: boolean | null
          phone: string
          profile_image?: string | null
          skills?: string[] | null
          status?: string
          stripe_account_id?: string | null
          stripe_onboarding_completed?: boolean | null
          trunks?: string | null
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
          password_set?: boolean | null
          phone?: string
          profile_image?: string | null
          skills?: string[] | null
          status?: string
          stripe_account_id?: string | null
          stripe_onboarding_completed?: boolean | null
          trunks?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      hotel_ledger: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string | null
          description: string | null
          hotel_id: string
          id: string
          organization_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string | null
          description?: string | null
          hotel_id: string
          id?: string
          organization_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string | null
          description?: string | null
          hotel_id?: string
          id?: string
          organization_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_ledger_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_ledger_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          address: string | null
          auto_validate_bookings: boolean | null
          city: string | null
          closing_time: string | null
          country: string | null
          country_code: string | null
          cover_image: string | null
          created_at: string
          currency: string | null
          hairdresser_commission: number | null
          hotel_commission: number | null
          id: string
          image: string | null
          name: string
          opening_time: string | null
          postal_code: string | null
          status: string | null
          timezone: string | null
          updated_at: string
          vat: number | null
          venue_type: string | null
        }
        Insert: {
          address?: string | null
          auto_validate_bookings?: boolean | null
          city?: string | null
          closing_time?: string | null
          country?: string | null
          country_code?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string | null
          hairdresser_commission?: number | null
          hotel_commission?: number | null
          id?: string
          image?: string | null
          name: string
          opening_time?: string | null
          postal_code?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string
          vat?: number | null
          venue_type?: string | null
        }
        Update: {
          address?: string | null
          auto_validate_bookings?: boolean | null
          city?: string | null
          closing_time?: string | null
          country?: string | null
          country_code?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string | null
          hairdresser_commission?: number | null
          hotel_commission?: number | null
          id?: string
          image?: string | null
          name?: string
          opening_time?: string | null
          postal_code?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string
          vat?: number | null
          venue_type?: string | null
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
      otp_rate_limits: {
        Row: {
          attempt_count: number
          blocked_until: string | null
          created_at: string
          first_attempt_at: string
          id: string
          last_attempt_at: string
          phone_number: string
          request_type: string
        }
        Insert: {
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          first_attempt_at?: string
          id?: string
          last_attempt_at?: string
          phone_number: string
          request_type: string
        }
        Update: {
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          first_attempt_at?: string
          id?: string
          last_attempt_at?: string
          phone_number?: string
          request_type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_notification_logs: {
        Row: {
          booking_id: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      treatment_categories: {
        Row: {
          id: string
          name: string
          hotel_id: string
          sort_order: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          hotel_id: string
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          hotel_id?: string
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_categories_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_menus: {
        Row: {
          category: string
          created_at: string
          currency: string | null
          description: string | null
          duration: number | null
          hotel_id: string | null
          id: string
          image: string | null
          lead_time: number | null
          name: string
          price: number | null
          price_on_request: boolean | null
          service_for: string
          sort_order: number | null
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          currency?: string | null
          description?: string | null
          duration?: number | null
          hotel_id?: string | null
          id?: string
          image?: string | null
          lead_time?: number | null
          name: string
          price?: number | null
          price_on_request?: boolean | null
          service_for: string
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          duration?: number | null
          hotel_id?: string | null
          id?: string
          image?: string | null
          lead_time?: number | null
          name?: string
          price?: number | null
          price_on_request?: boolean | null
          service_for?: string
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_menus_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      trunks: {
        Row: {
          created_at: string
          hairdresser_name: string | null
          hotel_id: string | null
          hotel_name: string | null
          id: string
          image: string | null
          name: string
          next_booking: string | null
          status: string
          trunk_id: string
          trunk_model: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hairdresser_name?: string | null
          hotel_id?: string | null
          hotel_name?: string | null
          id?: string
          image?: string | null
          name: string
          next_booking?: string | null
          status?: string
          trunk_id: string
          trunk_model: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hairdresser_name?: string | null
          hotel_id?: string | null
          hotel_name?: string | null
          id?: string
          image?: string | null
          name?: string
          next_booking?: string | null
          status?: string
          trunk_id?: string
          trunk_model?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trunks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
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
      venue_deployment_schedules: {
        Row: {
          created_at: string | null
          days_of_week: number[] | null
          hotel_id: string
          id: string
          recurrence_interval: number
          recurring_end_date: string | null
          recurring_start_date: string | null
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          specific_dates: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          days_of_week?: number[] | null
          hotel_id: string
          id?: string
          recurrence_interval?: number
          recurring_end_date?: string | null
          recurring_start_date?: string | null
          schedule_type?: Database["public"]["Enums"]["schedule_type"]
          specific_dates?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          days_of_week?: number[] | null
          hotel_id?: string
          id?: string
          recurrence_interval?: number
          recurring_end_date?: string | null
          recurring_start_date?: string | null
          schedule_type?: Database["public"]["Enums"]["schedule_type"]
          specific_dates?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_deployment_schedules_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: true
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_booking: {
        Args: {
          _booking_id: string
          _hairdresser_id: string
          _hairdresser_name: string
          _total_price: number
        }
        Returns: Json
      }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      create_treatment_request: {
        Args: {
          _client_email?: string
          _client_first_name: string
          _client_last_name?: string
          _client_phone: string
          _description?: string
          _hotel_id: string
          _preferred_date?: string
          _preferred_time?: string
          _room_number?: string
          _treatment_id?: string
        }
        Returns: string
      }
      get_concierge_hotels: {
        Args: { _user_id: string }
        Returns: {
          hotel_id: string
        }[]
      }
      get_hairdresser_id: { Args: { _user_id: string }; Returns: string }
      get_public_hairdressers: {
        Args: { _hotel_id: string }
        Returns: {
          first_name: string
          id: string
          profile_image: string
          skills: string[]
        }[]
      }
      get_public_hotel_by_id: {
        Args: { _hotel_id: string }
        Returns: {
          city: string
          closing_time: string
          country: string
          cover_image: string
          currency: string
          days_of_week: number[]
          id: string
          image: string
          name: string
          opening_time: string
          recurrence_interval: number
          recurring_end_date: string
          recurring_start_date: string
          schedule_type: string
          status: string
          vat: number
          venue_type: string
          description: string
          landing_subtitle: string
        }[]
      }
      get_public_hotels: {
        Args: never
        Returns: {
          city: string
          country: string
          cover_image: string
          currency: string
          id: string
          image: string
          name: string
          status: string
        }[]
      }
      get_public_treatments: {
        Args: { _hotel_id: string }
        Returns: {
          category: string
          currency: string
          description: string
          duration: number
          id: string
          image: string
          lead_time: number
          name: string
          price: number
          price_on_request: boolean
          service_for: string
          sort_order: number
        }[]
      }
      get_user_timezone: { Args: { _user_id: string }; Returns: string }
      get_venue_available_dates: {
        Args: { _end_date: string; _hotel_id: string; _start_date: string }
        Returns: string[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_venue_available_on_date:
        | { Args: { _check_date: string; _hotel_id: string }; Returns: boolean }
        | { Args: { _check_date: string; _hotel_id: string }; Returns: boolean }
      unassign_booking: {
        Args: { _booking_id: string; _hairdresser_id: string }
        Returns: Json
      }
      validate_treatment_request: {
        Args: {
          _client_email?: string
          _client_first_name: string
          _client_phone: string
          _description?: string
          _hotel_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "concierge" | "hairdresser"
      schedule_type: "always_open" | "specific_days" | "one_time"
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
      schedule_type: ["always_open", "specific_days", "one_time"],
    },
  },
} as const
