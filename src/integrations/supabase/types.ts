Connecting to db 5432
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
      booking_alternative_proposals: {
        Row: {
          alternative_1_date: string
          alternative_1_time: string
          alternative_2_date: string
          alternative_2_time: string
          booking_id: string
          client_phone: string | null
          created_at: string
          current_offer_index: number | null
          expires_at: string
          hairdresser_id: string
          id: string
          original_date: string
          original_time: string
          responded_at: string | null
          status: string
          whatsapp_message_id: string | null
        }
        Insert: {
          alternative_1_date: string
          alternative_1_time: string
          alternative_2_date: string
          alternative_2_time: string
          booking_id: string
          client_phone?: string | null
          created_at?: string
          current_offer_index?: number | null
          expires_at?: string
          hairdresser_id: string
          id?: string
          original_date: string
          original_time: string
          responded_at?: string | null
          status?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          alternative_1_date?: string
          alternative_1_time?: string
          alternative_2_date?: string
          alternative_2_time?: string
          booking_id?: string
          client_phone?: string | null
          created_at?: string
          current_offer_index?: number | null
          expires_at?: string
          hairdresser_id?: string
          id?: string
          original_date?: string
          original_time?: string
          responded_at?: string | null
          status?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_alternative_proposals_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_alternative_proposals_hairdresser_id_fkey"
            columns: ["hairdresser_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_proposed_slots: {
        Row: {
          admin_notified_at: string | null
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          slot_1_date: string
          slot_1_time: string
          slot_2_date: string | null
          slot_2_time: string | null
          slot_3_date: string | null
          slot_3_time: string | null
          validated_at: string | null
          validated_by: string | null
          validated_slot: number | null
        }
        Insert: {
          admin_notified_at?: string | null
          booking_id: string
          created_at?: string
          expires_at?: string
          id?: string
          slot_1_date: string
          slot_1_time: string
          slot_2_date?: string | null
          slot_2_time?: string | null
          slot_3_date?: string | null
          slot_3_time?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validated_slot?: number | null
        }
        Update: {
          admin_notified_at?: string | null
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          slot_1_date?: string
          slot_1_time?: string
          slot_2_date?: string | null
          slot_2_time?: string | null
          slot_3_date?: string | null
          slot_3_time?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validated_slot?: number | null
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
            referencedRelation: "therapists"
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
          customer_id: string | null
          declined_by: string[] | null
          duration: number | null
          hotel_id: string
          hotel_name: string | null
          id: string
          payment_error_code: string | null
          payment_error_details: Json | null
          payment_error_message: string | null
          payment_link_channels: string[] | null
          payment_link_language: string | null
          payment_link_sent_at: string | null
          payment_link_url: string | null
          payment_method: string | null
          payment_status: string | null
          phone: string
          pms_charge_id: string | null
          pms_charge_status: string | null
          pms_error_message: string | null
          quote_token: string | null
          room_id: string | null
          room_number: string | null
          signed_at: string | null
          status: string
          stripe_invoice_url: string | null
          therapist_id: string | null
          therapist_name: string | null
          total_price: number | null
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
          customer_id?: string | null
          declined_by?: string[] | null
          duration?: number | null
          hotel_id: string
          hotel_name?: string | null
          id?: string
          payment_error_code?: string | null
          payment_error_details?: Json | null
          payment_error_message?: string | null
          payment_link_channels?: string[] | null
          payment_link_language?: string | null
          payment_link_sent_at?: string | null
          payment_link_url?: string | null
          payment_method?: string | null
          payment_status?: string | null
          phone: string
          pms_charge_id?: string | null
          pms_charge_status?: string | null
          pms_error_message?: string | null
          quote_token?: string | null
          room_id?: string | null
          room_number?: string | null
          signed_at?: string | null
          status?: string
          stripe_invoice_url?: string | null
          therapist_id?: string | null
          therapist_name?: string | null
          total_price?: number | null
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
          customer_id?: string | null
          declined_by?: string[] | null
          duration?: number | null
          hotel_id?: string
          hotel_name?: string | null
          id?: string
          payment_error_code?: string | null
          payment_error_details?: Json | null
          payment_error_message?: string | null
          payment_link_channels?: string[] | null
          payment_link_language?: string | null
          payment_link_sent_at?: string | null
          payment_link_url?: string | null
          payment_method?: string | null
          payment_status?: string | null
          phone?: string
          pms_charge_id?: string | null
          pms_charge_status?: string | null
          pms_error_message?: string | null
          quote_token?: string | null
          room_id?: string | null
          room_number?: string | null
          signed_at?: string | null
          status?: string
          stripe_invoice_url?: string | null
          therapist_id?: string | null
          therapist_name?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hairdresser_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_trunk_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "treatment_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      client_analytics: {
        Row: {
          created_at: string | null
          device_type: string | null
          event_name: string
          event_type: string
          hotel_id: string
          id: string
          metadata: Json | null
          page_path: string | null
          referrer: string | null
          session_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          device_type?: string | null
          event_name: string
          event_type: string
          hotel_id: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          referrer?: string | null
          session_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          device_type?: string | null
          event_name?: string
          event_type?: string
          hotel_id?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_analytics_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
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
      customers: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          health_notes: string | null
          id: string
          language: string | null
          last_name: string | null
          phone: string
          preferred_therapist_id: string | null
          preferred_treatment_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          health_notes?: string | null
          id?: string
          language?: string | null
          last_name?: string | null
          phone: string
          preferred_therapist_id?: string | null
          preferred_treatment_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          health_notes?: string | null
          id?: string
          language?: string | null
          last_name?: string | null
          phone?: string
          preferred_therapist_id?: string | null
          preferred_treatment_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_preferred_therapist_id_fkey"
            columns: ["preferred_therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
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
      hotel_pms_configs: {
        Row: {
          app_key: string
          auto_charge_room: boolean | null
          client_id: string
          client_secret: string
          created_at: string | null
          enterprise_id: string
          gateway_url: string
          guest_lookup_enabled: boolean | null
          hotel_id: string
          id: string
          pms_hotel_id: string
          pms_type: string
          updated_at: string | null
        }
        Insert: {
          app_key: string
          auto_charge_room?: boolean | null
          client_id: string
          client_secret: string
          created_at?: string | null
          enterprise_id: string
          gateway_url: string
          guest_lookup_enabled?: boolean | null
          hotel_id: string
          id?: string
          pms_hotel_id: string
          pms_type?: string
          updated_at?: string | null
        }
        Update: {
          app_key?: string
          auto_charge_room?: boolean | null
          client_id?: string
          client_secret?: string
          created_at?: string | null
          enterprise_id?: string
          gateway_url?: string
          guest_lookup_enabled?: boolean | null
          hotel_id?: string
          id?: string
          pms_hotel_id?: string
          pms_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_pms_configs_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: true
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
          company_offered: boolean | null
          country: string | null
          country_code: string | null
          cover_image: string | null
          created_at: string
          currency: string | null
          description: string | null
          hotel_commission: number | null
          id: string
          image: string | null
          landing_subtitle: string | null
          name: string
          offert: boolean | null
          opening_time: string | null
          pms_auto_charge_room: boolean | null
          pms_guest_lookup_enabled: boolean | null
          pms_type: string | null
          postal_code: string | null
          slot_interval: number | null
          status: string | null
          therapist_commission: number | null
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
          company_offered?: boolean | null
          country?: string | null
          country_code?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          hotel_commission?: number | null
          id?: string
          image?: string | null
          landing_subtitle?: string | null
          name: string
          offert?: boolean | null
          opening_time?: string | null
          pms_auto_charge_room?: boolean | null
          pms_guest_lookup_enabled?: boolean | null
          pms_type?: string | null
          postal_code?: string | null
          slot_interval?: number | null
          status?: string | null
          therapist_commission?: number | null
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
          company_offered?: boolean | null
          country?: string | null
          country_code?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          hotel_commission?: number | null
          id?: string
          image?: string | null
          landing_subtitle?: string | null
          name?: string
          offert?: boolean | null
          opening_time?: string | null
          pms_auto_charge_room?: boolean | null
          pms_guest_lookup_enabled?: boolean | null
          pms_type?: string | null
          postal_code?: string | null
          slot_interval?: number | null
          status?: string | null
          therapist_commission?: number | null
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
      package_treatments: {
        Row: {
          created_at: string
          id: string
          package_id: string
          sort_order: number | null
          treatment_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          sort_order?: number | null
          treatment_id: string
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          sort_order?: number | null
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_treatments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "treatment_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_treatments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatment_menus"
            referencedColumns: ["id"]
          },
        ]
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
      therapist_payouts: {
        Row: {
          amount: number
          booking_id: string
          created_at: string | null
          error_message: string | null
          id: string
          organization_id: string | null
          status: string
          stripe_transfer_id: string | null
          therapist_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
          therapist_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
          therapist_id?: string
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
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_ratings: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          rating_token: string | null
          submitted_at: string | null
          therapist_id: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          rating_token?: string | null
          submitted_at?: string | null
          therapist_id: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          rating_token?: string | null
          submitted_at?: string | null
          therapist_id?: string
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
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_venues: {
        Row: {
          created_at: string | null
          hotel_id: string
          id: string
          therapist_id: string
        }
        Insert: {
          created_at?: string | null
          hotel_id: string
          id?: string
          therapist_id: string
        }
        Update: {
          created_at?: string | null
          hotel_id?: string
          id?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hairdresser_hotels_hairdresser_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
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
      therapists: {
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
      treatment_categories: {
        Row: {
          created_at: string | null
          hotel_id: string
          id: string
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hotel_id: string
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hotel_id?: string
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string | null
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
          is_bestseller: boolean | null
          lead_time: number | null
          name: string
          price: number | null
          price_on_request: boolean | null
          requires_room: boolean | null
          service_for: string
          sort_order: number | null
          status: string
          treatment_type: string | null
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
          is_bestseller?: boolean | null
          lead_time?: number | null
          name: string
          price?: number | null
          price_on_request?: boolean | null
          requires_room?: boolean | null
          service_for: string
          sort_order?: number | null
          status?: string
          treatment_type?: string | null
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
          is_bestseller?: boolean | null
          lead_time?: number | null
          name?: string
          price?: number | null
          price_on_request?: boolean | null
          requires_room?: boolean | null
          service_for?: string
          sort_order?: number | null
          status?: string
          treatment_type?: string | null
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
      treatment_packages: {
        Row: {
          created_at: string
          currency: string | null
          description: string | null
          hotel_id: string
          id: string
          name: string
          sort_order: number | null
          status: string
          total_duration: number | null
          total_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          description?: string | null
          hotel_id: string
          id?: string
          name: string
          sort_order?: number | null
          status?: string
          total_duration?: number | null
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          description?: string | null
          hotel_id?: string
          id?: string
          name?: string
          sort_order?: number | null
          status?: string
          total_duration?: number | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_packages_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_rooms: {
        Row: {
          capacity: number | null
          created_at: string
          hotel_id: string | null
          hotel_name: string | null
          id: string
          image: string | null
          name: string
          next_booking: string | null
          room_number: string
          room_type: string
          status: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          hotel_id?: string | null
          hotel_name?: string | null
          id?: string
          image?: string | null
          name: string
          next_booking?: string | null
          room_number: string
          room_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          hotel_id?: string | null
          hotel_name?: string | null
          id?: string
          image?: string | null
          name?: string
          next_booking?: string | null
          room_number?: string
          room_type?: string
          status?: string
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
      venue_blocked_slots: {
        Row: {
          created_at: string
          days_of_week: number[] | null
          end_time: string
          hotel_id: string
          id: string
          is_active: boolean
          label: string
          start_time: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[] | null
          end_time: string
          hotel_id: string
          id?: string
          is_active?: boolean
          label: string
          start_time: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[] | null
          end_time?: string
          hotel_id?: string
          id?: string
          is_active?: boolean
          label?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_blocked_slots_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
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
      get_client_funnel: {
        Args: { _end_date?: string; _hotel_id?: string; _start_date?: string }
        Returns: {
          step_name: string
          step_order: number
          total_events: number
          unique_sessions: number
        }[]
      }
      get_concierge_hotels: {
        Args: { _user_id: string }
        Returns: {
          hotel_id: string
        }[]
      }
      get_enterprise_session_data: {
        Args: { _hotel_id: string; _session_date?: string }
        Returns: Json
      }
      get_hotel_analytics_summary: {
        Args: { _end_date?: string; _hotel_id?: string; _start_date?: string }
        Returns: {
          conversion_rate: number
          daily_visitors: Json
          device_breakdown: Json
          total_conversions: number
          total_page_views: number
          total_sessions: number
        }[]
      }
      get_public_hotel_by_id: {
        Args: { _hotel_id: string }
        Returns: {
          city: string
          closing_time: string
          company_offered: boolean
          country: string
          cover_image: string
          currency: string
          days_of_week: number[]
          description: string
          id: string
          image: string
          landing_subtitle: string
          name: string
          offert: boolean
          opening_time: string
          recurrence_interval: number
          recurring_end_date: string
          recurring_start_date: string
          schedule_type: string
          slot_interval: number
          status: string
          vat: number
          venue_type: string
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
      get_public_therapists: {
        Args: { _hotel_id: string }
        Returns: {
          first_name: string
          id: string
          profile_image: string
          skills: string[]
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
          is_bestseller: boolean
          lead_time: number
          name: string
          price: number
          price_on_request: boolean
          service_for: string
          sort_order: number
        }[]
      }
      get_sessions_by_hotel: {
        Args: { _end_date?: string; _start_date?: string }
        Returns: {
          hotel_id: string
          hotel_name: string
          session_count: number
        }[]
      }
      get_therapist_id: { Args: { _user_id: string }; Returns: string }
      get_user_timezone: { Args: { _user_id: string }; Returns: string }
      get_venue_available_dates: {
        Args: { _end_date: string; _hotel_id: string; _start_date: string }
        Returns: string[]
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_venue_available_on_date: {
        Args: { _check_date: string; _hotel_id: string }
        Returns: boolean
      }
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
      app_role: "admin" | "moderator" | "user" | "concierge" | "therapist"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "concierge", "therapist"],
      schedule_type: ["always_open", "specific_days", "one_time"],
    },
  },
} as const

