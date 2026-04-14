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
      billing_profiles: {
        Row: {
          id: string
          owner_type: string
          owner_id: string
          company_name: string | null
          legal_form: string | null
          siret: string | null
          siren: string | null
          tva_number: string | null
          vat_exempt: boolean
          billing_address: string | null
          billing_postal_code: string | null
          billing_city: string | null
          billing_country: string | null
          contact_email: string | null
          contact_phone: string | null
          iban: string | null
          bic: string | null
          bank_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_type: string
          owner_id: string
          company_name?: string | null
          legal_form?: string | null
          siret?: string | null
          siren?: string | null
          tva_number?: string | null
          vat_exempt?: boolean
          billing_address?: string | null
          billing_postal_code?: string | null
          billing_city?: string | null
          billing_country?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          iban?: string | null
          bic?: string | null
          bank_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_type?: string
          owner_id?: string
          company_name?: string | null
          legal_form?: string | null
          siret?: string | null
          siren?: string | null
          tva_number?: string | null
          vat_exempt?: boolean
          billing_address?: string | null
          billing_postal_code?: string | null
          billing_city?: string | null
          billing_country?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          iban?: string | null
          bic?: string | null
          bank_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          invoice_kind: string
          issuer_type: string
          issuer_id: string | null
          client_type: string
          client_id: string | null
          therapist_id: string | null
          hotel_id: string | null
          invoice_number: string
          period_start: string
          period_end: string
          issue_date: string
          due_date: string
          amount_ht: number
          vat_rate: number
          vat_amount: number
          amount_ttc: number
          currency: string
          bookings_count: number
          html_snapshot: string | null
          issuer_snapshot: Json | null
          client_snapshot: Json | null
          metadata: Json | null
          status: string
          generated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_kind: string
          issuer_type: string
          issuer_id?: string | null
          client_type: string
          client_id?: string | null
          therapist_id?: string | null
          hotel_id?: string | null
          invoice_number: string
          period_start: string
          period_end: string
          issue_date?: string
          due_date: string
          amount_ht: number
          vat_rate?: number
          vat_amount: number
          amount_ttc: number
          currency?: string
          bookings_count?: number
          html_snapshot?: string | null
          issuer_snapshot?: Json | null
          client_snapshot?: Json | null
          metadata?: Json | null
          status?: string
          generated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_kind?: string
          issuer_type?: string
          issuer_id?: string | null
          client_type?: string
          client_id?: string | null
          therapist_id?: string | null
          hotel_id?: string | null
          invoice_number?: string
          period_start?: string
          period_end?: string
          issue_date?: string
          due_date?: string
          amount_ht?: number
          vat_rate?: number
          vat_amount?: number
          amount_ttc?: number
          currency?: string
          bookings_count?: number
          html_snapshot?: string | null
          issuer_snapshot?: Json | null
          client_snapshot?: Json | null
          metadata?: Json | null
          status?: string
          generated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          }
        ]
      }
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
      amenity_bookings: {
        Row: {
          booking_date: string
          booking_time: string
          client_type: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          duration: number
          end_time: string
          hotel_id: string
          id: string
          linked_booking_id: string | null
          notes: string | null
          num_guests: number
          payment_method: string | null
          payment_status: string | null
          price: number | null
          room_number: string | null
          status: string
          updated_at: string
          venue_amenity_id: string
        }
        Insert: {
          booking_date: string
          booking_time: string
          client_type: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          duration: number
          end_time: string
          hotel_id: string
          id?: string
          linked_booking_id?: string | null
          notes?: string | null
          num_guests?: number
          payment_method?: string | null
          payment_status?: string | null
          price?: number | null
          room_number?: string | null
          status?: string
          updated_at?: string
          venue_amenity_id: string
        }
        Update: {
          booking_date?: string
          booking_time?: string
          client_type?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          duration?: number
          end_time?: string
          hotel_id?: string
          id?: string
          linked_booking_id?: string | null
          notes?: string | null
          num_guests?: number
          payment_method?: string | null
          payment_status?: string | null
          price?: number | null
          room_number?: string | null
          status?: string
          updated_at?: string
          venue_amenity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenity_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_bookings_linked_booking_id_fkey"
            columns: ["linked_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenity_bookings_venue_amenity_id_fkey"
            columns: ["venue_amenity_id"]
            isOneToOne: false
            referencedRelation: "venue_amenities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          change_type: string
          changed_at: string
          changed_by: string | null
          flag_type: string | null
          id: string
          is_flagged: boolean
          metadata: Json
          new_values: Json | null
          old_values: Json | null
          record_id: string
          source: string
          table_name: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          change_type: string
          changed_at?: string
          changed_by?: string | null
          flag_type?: string | null
          id?: string
          is_flagged?: boolean
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          source?: string
          table_name: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          flag_type?: string | null
          id?: string
          is_flagged?: boolean
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          source?: string
          table_name?: string
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
      booking_payment_infos: {
        Row: {
          booking_id: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string | null
          customer_id: string | null
          estimated_price: number | null
          id: string
          payment_at: string | null
          payment_error_message: string | null
          payment_status: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          stripe_session_id: string | null
          stripe_setup_intent_id: string | null
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string | null
          customer_id?: string | null
          estimated_price?: number | null
          id?: string
          payment_at?: string | null
          payment_error_message?: string | null
          payment_status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_session_id?: string | null
          stripe_setup_intent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string | null
          customer_id?: string | null
          estimated_price?: number | null
          id?: string
          payment_at?: string | null
          payment_error_message?: string | null
          payment_status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_session_id?: string | null
          stripe_setup_intent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_payment_infos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payment_infos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          variant_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          treatment_id: string
          variant_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          treatment_id?: string
          variant_id?: string | null
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
          {
            foreignKeyName: "booking_treatments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "treatment_variants"
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
          bundle_usage_id: string | null
          cancellation_reason: string | null
          client_email: string | null
          client_first_name: string
          client_form_data: Json | null
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
          is_out_of_hours: boolean | null
          language: string | null
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
          pms_guest_check_in: string | null
          pms_guest_check_out: string | null
          quote_token: string | null
          room_id: string | null
          room_number: string | null
          signature_token: string | null
          signed_at: string | null
          status: string
          stripe_invoice_url: string | null
          surcharge_amount: number | null
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
          bundle_usage_id?: string | null
          cancellation_reason?: string | null
          client_email?: string | null
          client_first_name: string
          client_form_data?: Json | null
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
          is_out_of_hours?: boolean | null
          language?: string | null
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
          pms_guest_check_in?: string | null
          pms_guest_check_out?: string | null
          quote_token?: string | null
          room_id?: string | null
          room_number?: string | null
          signature_token?: string | null
          signed_at?: string | null
          status?: string
          stripe_invoice_url?: string | null
          surcharge_amount?: number | null
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
          bundle_usage_id?: string | null
          cancellation_reason?: string | null
          client_email?: string | null
          client_first_name?: string
          client_form_data?: Json | null
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
          is_out_of_hours?: boolean | null
          language?: string | null
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
          pms_guest_check_in?: string | null
          pms_guest_check_out?: string | null
          quote_token?: string | null
          room_id?: string | null
          room_number?: string | null
          signature_token?: string | null
          signed_at?: string | null
          status?: string
          stripe_invoice_url?: string | null
          surcharge_amount?: number | null
          therapist_id?: string | null
          therapist_name?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_bundle_usage_id_fkey"
            columns: ["bundle_usage_id"]
            isOneToOne: false
            referencedRelation: "bundle_session_usages"
            referencedColumns: ["id"]
          },
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
      bundle_session_usages: {
        Row: {
          booking_id: string
          customer_bundle_id: string
          id: string
          treatment_id: string
          used_at: string
        }
        Insert: {
          booking_id: string
          customer_bundle_id: string
          id?: string
          treatment_id: string
          used_at?: string
        }
        Update: {
          booking_id?: string
          customer_bundle_id?: string
          id?: string
          treatment_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_session_usages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_session_usages_customer_bundle_id_fkey"
            columns: ["customer_bundle_id"]
            isOneToOne: false
            referencedRelation: "customer_treatment_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_session_usages_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatment_menus"
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
          venue_role: string | null
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
          venue_role?: string | null
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
          venue_role?: string | null
        }
        Relationships: []
      }
      customer_treatment_bundles: {
        Row: {
          booking_id: string | null
          bundle_id: string
          created_at: string
          customer_id: string
          expires_at: string
          hotel_id: string
          id: string
          notes: string | null
          payment_reference: string | null
          purchase_date: string
          sold_by: string | null
          status: string
          total_sessions: number
          updated_at: string
          used_sessions: number
        }
        Insert: {
          booking_id?: string | null
          bundle_id: string
          created_at?: string
          customer_id: string
          expires_at: string
          hotel_id: string
          id?: string
          notes?: string | null
          payment_reference?: string | null
          purchase_date?: string
          sold_by?: string | null
          status?: string
          total_sessions: number
          updated_at?: string
          used_sessions?: number
        }
        Update: {
          booking_id?: string | null
          bundle_id?: string
          created_at?: string
          customer_id?: string
          expires_at?: string
          hotel_id?: string
          id?: string
          notes?: string | null
          payment_reference?: string | null
          purchase_date?: string
          sold_by?: string | null
          status?: string
          total_sessions?: number
          updated_at?: string
          used_sessions?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_treatment_bundles_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_treatment_bundles_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "treatment_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_treatment_bundles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_treatment_bundles_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
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
          stripe_customer_id: string | null
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
          stripe_customer_id?: string | null
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
          stripe_customer_id?: string | null
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
          access_token: string | null
          accounting_category_id: string | null
          api_url: string | null
          app_key: string | null
          auto_charge_room: boolean | null
          client_id: string | null
          client_secret: string | null
          connection_status: string | null
          connection_verified_at: string | null
          created_at: string | null
          enterprise_id: string | null
          gateway_url: string | null
          guest_lookup_enabled: boolean | null
          hotel_id: string
          id: string
          pms_hotel_id: string | null
          pms_type: string
          service_id: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          accounting_category_id?: string | null
          api_url?: string | null
          app_key?: string | null
          auto_charge_room?: boolean | null
          client_id?: string | null
          client_secret?: string | null
          connection_status?: string | null
          connection_verified_at?: string | null
          created_at?: string | null
          enterprise_id?: string | null
          gateway_url?: string | null
          guest_lookup_enabled?: boolean | null
          hotel_id: string
          id?: string
          pms_hotel_id?: string | null
          pms_type?: string
          service_id?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          accounting_category_id?: string | null
          api_url?: string | null
          app_key?: string | null
          auto_charge_room?: boolean | null
          client_id?: string | null
          client_secret?: string | null
          connection_status?: string | null
          connection_verified_at?: string | null
          created_at?: string | null
          enterprise_id?: string | null
          gateway_url?: string | null
          guest_lookup_enabled?: boolean | null
          hotel_id?: string
          id?: string
          pms_hotel_id?: string | null
          pms_type?: string
          service_id?: string | null
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
          allow_out_of_hours_booking: boolean | null
          auto_validate_bookings: boolean | null
          calendar_color: string | null
          city: string | null
          closing_time: string | null
          company_offered: boolean | null
          country: string | null
          country_code: string | null
          cover_image: string | null
          created_at: string
          currency: string | null
          description: string | null
          description_en: string | null
          global_therapist_commission: boolean | null
          hotel_commission: number | null
          id: string
          image: string | null
          landing_subtitle: string | null
          landing_subtitle_en: string | null
          name: string
          name_en: string | null
          offert: boolean | null
          opening_time: string | null
          out_of_hours_surcharge_percent: number | null
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
          allow_out_of_hours_booking?: boolean | null
          auto_validate_bookings?: boolean | null
          calendar_color?: string | null
          city?: string | null
          closing_time?: string | null
          company_offered?: boolean | null
          country?: string | null
          country_code?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          description_en?: string | null
          global_therapist_commission?: boolean | null
          hotel_commission?: number | null
          id?: string
          image?: string | null
          landing_subtitle?: string | null
          landing_subtitle_en?: string | null
          name: string
          name_en?: string | null
          offert?: boolean | null
          opening_time?: string | null
          out_of_hours_surcharge_percent?: number | null
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
          allow_out_of_hours_booking?: boolean | null
          auto_validate_bookings?: boolean | null
          calendar_color?: string | null
          city?: string | null
          closing_time?: string | null
          company_offered?: boolean | null
          country?: string | null
          country_code?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          description_en?: string | null
          global_therapist_commission?: boolean | null
          hotel_commission?: number | null
          id?: string
          image?: string | null
          landing_subtitle?: string | null
          landing_subtitle_en?: string | null
          name?: string
          name_en?: string | null
          offert?: boolean | null
          opening_time?: string | null
          out_of_hours_surcharge_percent?: number | null
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
          language: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
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
      therapist_absences: {
        Row: {
          id: string
          therapist_id: string
          start_date: string
          end_date: string
          reason: string
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          therapist_id: string
          start_date: string
          end_date: string
          reason: string
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          therapist_id?: string
          start_date?: string
          end_date?: string
          reason?: string
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_absences_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_availability: {
        Row: {
          created_at: string
          date: string
          id: string
          is_available: boolean
          is_manually_edited: boolean
          last_change_source: string
          shifts: Json
          therapist_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_available?: boolean
          is_manually_edited?: boolean
          last_change_source?: string
          shifts?: Json
          therapist_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_available?: boolean
          is_manually_edited?: boolean
          last_change_source?: string
          shifts?: Json
          therapist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_availability_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
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
      therapist_schedule_templates: {
        Row: {
          created_at: string
          id: string
          therapist_id: string
          updated_at: string
          weekly_pattern: Json
        }
        Insert: {
          created_at?: string
          id?: string
          therapist_id: string
          updated_at?: string
          weekly_pattern?: Json
        }
        Update: {
          created_at?: string
          id?: string
          therapist_id?: string
          updated_at?: string
          weekly_pattern?: Json
        }
        Relationships: [
          {
            foreignKeyName: "therapist_schedule_templates_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: true
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
          gender: string | null
          hourly_rate: number | null
          id: string
          last_name: string
          minimum_guarantee: Json | null
          minimum_guarantee_active: boolean | null
          password_set: boolean | null
          phone: string
          profile_image: string | null
          rate_45: number | null
          rate_60: number | null
          rate_90: number | null
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
          gender?: string | null
          hourly_rate?: number | null
          id?: string
          last_name: string
          minimum_guarantee?: Json | null
          minimum_guarantee_active?: boolean | null
          password_set?: boolean | null
          phone: string
          profile_image?: string | null
          rate_45?: number | null
          rate_60?: number | null
          rate_90?: number | null
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
          gender?: string | null
          hourly_rate?: number | null
          id?: string
          last_name?: string
          minimum_guarantee?: Json | null
          minimum_guarantee_active?: boolean | null
          password_set?: boolean | null
          phone?: string
          profile_image?: string | null
          rate_45?: number | null
          rate_60?: number | null
          rate_90?: number | null
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
      tickets: {
        Row: {
          category: string
          closed_at: string | null
          created_at: string
          created_by: string
          creator_name: string | null
          creator_role: string | null
          description: string
          id: string
          notion_page_id: string | null
          priority: string
          screenshot_urls: string[]
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          category: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          creator_name?: string | null
          creator_role?: string | null
          description: string
          id?: string
          notion_page_id?: string | null
          priority?: string
          screenshot_urls?: string[]
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          creator_name?: string | null
          creator_role?: string | null
          description?: string
          id?: string
          notion_page_id?: string | null
          priority?: string
          screenshot_urls?: string[]
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      treatment_bundle_items: {
        Row: {
          bundle_id: string
          id: string
          treatment_id: string
        }
        Insert: {
          bundle_id: string
          id?: string
          treatment_id: string
        }
        Update: {
          bundle_id?: string
          id?: string
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "treatment_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_bundle_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatment_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_bundles: {
        Row: {
          created_at: string
          currency: string | null
          description: string | null
          description_en: string | null
          hotel_id: string
          id: string
          name: string
          name_en: string | null
          price: number
          sort_order: number | null
          status: string
          total_sessions: number
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          description?: string | null
          description_en?: string | null
          hotel_id: string
          id?: string
          name: string
          name_en?: string | null
          price: number
          sort_order?: number | null
          status?: string
          total_sessions: number
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          description?: string | null
          description_en?: string | null
          hotel_id?: string
          id?: string
          name?: string
          name_en?: string | null
          price?: number
          sort_order?: number | null
          status?: string
          total_sessions?: number
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_bundles_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_categories: {
        Row: {
          created_at: string | null
          hotel_id: string
          id: string
          name: string
          name_en: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hotel_id: string
          id?: string
          name: string
          name_en?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hotel_id?: string
          id?: string
          name?: string
          name_en?: string | null
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
          bundle_id: string | null
          category: string
          created_at: string
          currency: string | null
          description: string | null
          description_en: string | null
          duration: number | null
          hotel_id: string | null
          id: string
          image: string | null
          is_bestseller: boolean | null
          is_bundle: boolean | null
          lead_time: number | null
          name: string
          name_en: string | null
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
          bundle_id?: string | null
          category: string
          created_at?: string
          currency?: string | null
          description?: string | null
          description_en?: string | null
          duration?: number | null
          hotel_id?: string | null
          id?: string
          image?: string | null
          is_bestseller?: boolean | null
          is_bundle?: boolean | null
          lead_time?: number | null
          name: string
          name_en?: string | null
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
          bundle_id?: string | null
          category?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          description_en?: string | null
          duration?: number | null
          hotel_id?: string | null
          id?: string
          image?: string | null
          is_bestseller?: boolean | null
          is_bundle?: boolean | null
          lead_time?: number | null
          name?: string
          name_en?: string | null
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
            foreignKeyName: "treatment_menus_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "treatment_bundles"
            referencedColumns: ["id"]
          },
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
          capabilities: string[] | null
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
          capabilities?: string[] | null
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
          capabilities?: string[] | null
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
      treatment_variants: {
        Row: {
          created_at: string | null
          duration: number
          id: string
          is_default: boolean | null
          label: string | null
          label_en: string | null
          price: number | null
          price_on_request: boolean | null
          sort_order: number | null
          status: string | null
          treatment_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          duration: number
          id?: string
          is_default?: boolean | null
          label?: string | null
          label_en?: string | null
          price?: number | null
          price_on_request?: boolean | null
          sort_order?: number | null
          status?: string | null
          treatment_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          duration?: number
          id?: string
          is_default?: boolean | null
          label?: string | null
          label_en?: string | null
          price?: number | null
          price_on_request?: boolean | null
          sort_order?: number | null
          status?: string | null
          treatment_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_variants_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatment_menus"
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
      venue_amenities: {
        Row: {
          capacity_per_slot: number
          closing_time: string | null
          color: string
          created_at: string
          currency: string | null
          hotel_id: string
          id: string
          is_enabled: boolean
          lymfea_access_duration: number | null
          lymfea_access_included: boolean
          name: string | null
          opening_time: string | null
          prep_time: number
          price_external: number | null
          price_lymfea: number | null
          slot_duration: number
          type: string
          updated_at: string
        }
        Insert: {
          capacity_per_slot?: number
          closing_time?: string | null
          color?: string
          created_at?: string
          currency?: string | null
          hotel_id: string
          id?: string
          is_enabled?: boolean
          lymfea_access_duration?: number | null
          lymfea_access_included?: boolean
          name?: string | null
          opening_time?: string | null
          prep_time?: number
          price_external?: number | null
          price_lymfea?: number | null
          slot_duration?: number
          type: string
          updated_at?: string
        }
        Update: {
          capacity_per_slot?: number
          closing_time?: string | null
          color?: string
          created_at?: string
          currency?: string | null
          hotel_id?: string
          id?: string
          is_enabled?: boolean
          lymfea_access_duration?: number | null
          lymfea_access_included?: boolean
          name?: string | null
          opening_time?: string | null
          prep_time?: number
          price_external?: number | null
          price_lymfea?: number | null
          slot_duration?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_amenities_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
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
      next_invoice_number: {
        Args: Record<string, never>
        Returns: string
      }
      accept_booking: {
        Args: {
          _booking_id: string
          _hairdresser_id: string
          _hairdresser_name: string
          _total_price: number
        }
        Returns: Json
      }
      acknowledge_audit_alert: {
        Args: { _alert_id: string }
        Returns: undefined
      }
      acknowledge_audit_alerts_bulk: {
        Args: { _alert_ids: string[] }
        Returns: number
      }
      apply_schedule_template: {
        Args: {
          _month: number
          _overwrite_manual?: boolean
          _therapist_id: string
          _weekly_pattern: Json
          _year: number
        }
        Returns: number
      }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      create_therapist_absence: {
        Args: {
          _therapist_id: string
          _start_date: string
          _end_date: string
          _reason: string
          _note?: string
        }
        Returns: string
      }
      delete_therapist_absence: {
        Args: {
          _absence_id: string
        }
        Returns: undefined
      }
      create_audit_log: {
        Args: {
          _change_type: string
          _flag_type?: string
          _is_flagged?: boolean
          _metadata?: Json
          _new_values?: Json
          _old_values?: Json
          _record_id: string
          _source?: string
          _table_name: string
        }
        Returns: string
      }
      create_customer_bundle: {
        Args: {
          _booking_id?: string
          _bundle_id: string
          _customer_id: string
          _hotel_id: string
        }
        Returns: string
      }
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
      detect_bundles_for_booking: {
        Args: { _hotel_id: string; _phone: string; _treatment_ids?: string[] }
        Returns: {
          bundle_name: string
          bundle_name_en: string
          customer_bundle_id: string
          eligible_treatment_ids: string[]
          expires_at: string
          remaining_sessions: number
          total_sessions: number
          used_sessions: number
        }[]
      }
      expire_overdue_bundles: { Args: never; Returns: number }
      find_or_create_customer: {
        Args: {
          _email?: string
          _first_name: string
          _last_name?: string
          _phone: string
        }
        Returns: string
      }
      get_amenity_slot_occupancy: {
        Args: {
          p_date: string
          p_end_time: string
          p_start_time: string
          p_venue_amenity_id: string
        }
        Returns: number
      }
      get_booking_by_signature_token: {
        Args: { p_token: string }
        Returns: {
          client_first_name: string
          client_last_name: string
          hotel_name: string
          total_price: number
          treatment_name: string
        }[]
      }
      get_booking_summary: { Args: { _booking_id: string }; Returns: Json }
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
          description_en: string
          id: string
          image: string
          landing_subtitle: string
          landing_subtitle_en: string
          name: string
          name_en: string
          offert: boolean
          opening_time: string
          pms_guest_lookup_enabled: boolean
          recurrence_interval: number
          recurring_end_date: string
          recurring_start_date: string
          schedule_type: string
          slot_interval: number
          status: string
          vat: number
          venue_type: string
          address: string
          postal_code: string
          contact_phone: string
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
          description_en: string
          duration: number
          id: string
          image: string
          is_bestseller: boolean
          lead_time: number
          name: string
          name_en: string
          price: number
          price_on_request: boolean
          service_for: string
          sort_order: number
          variants: Json
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_venue_available_on_date: {
        Args: { _check_date: string; _hotel_id: string }
        Returns: boolean
      }
      reactivate_prereservation: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      reserve_trunk_atomically: {
        Args: {
          _booking_date: string
          _booking_time: string
          _client_email: string
          _client_first_name: string
          _client_last_name: string
          _client_note: string
          _customer_id?: string
          _duration: number
          _hotel_id: string
          _hotel_name: string
          _language: string
          _payment_method: string
          _payment_status: string
          _phone: string
          _room_number: string
          _status: string
          _stripe_session_id?: string
          _therapist_gender?: string
          _total_price: number
          _treatment_ids: string[]
        }
        Returns: string
      }
      submit_client_signature:
        | {
            Args: { p_form_data: Json; p_signature: string; p_token: string }
            Returns: boolean
          }
        | {
            Args: {
              p_room_number?: string
              p_signature: string
              p_token: string
            }
            Returns: boolean
          }
      unassign_booking: {
        Args: { _booking_id: string; _hairdresser_id: string }
        Returns: Json
      }
      use_bundle_session: {
        Args: {
          _booking_id: string
          _customer_bundle_id: string
          _treatment_id: string
        }
        Returns: string
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
