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
          is_super_admin: boolean
          last_name: string
          organization_id: string | null
          phone: string
          profile_image: string | null
          status: string
          updated_at: string
          user_id: string | null
          welcome_seen_at: string | null
        }
        Insert: {
          country_code?: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          is_super_admin?: boolean
          last_name: string
          organization_id?: string | null
          phone: string
          profile_image?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          welcome_seen_at?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          is_super_admin?: boolean
          last_name?: string
          organization_id?: string | null
          phone?: string
          profile_image?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          welcome_seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          email_html: string | null
          flag_type: string | null
          id: string
          is_flagged: boolean
          metadata: Json
          new_values: Json | null
          old_values: Json | null
          record_id: string
          resend_email_id: string | null
          source: string
          table_name: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          change_type: string
          changed_at?: string
          changed_by?: string | null
          email_html?: string | null
          flag_type?: string | null
          id?: string
          is_flagged?: boolean
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          resend_email_id?: string | null
          source?: string
          table_name: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          email_html?: string | null
          flag_type?: string | null
          id?: string
          is_flagged?: boolean
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          resend_email_id?: string | null
          source?: string
          table_name?: string
        }
        Relationships: []
      }
      billing_profiles: {
        Row: {
          bank_name: string | null
          bic: string | null
          billing_address: string | null
          billing_city: string | null
          billing_country: string | null
          billing_postal_code: string | null
          company_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          iban: string | null
          id: string
          legal_form: string | null
          owner_id: string
          owner_type: string
          siren: string | null
          siret: string | null
          tva_number: string | null
          updated_at: string
          vat_exempt: boolean
        }
        Insert: {
          bank_name?: string | null
          bic?: string | null
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_postal_code?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          legal_form?: string | null
          owner_id: string
          owner_type: string
          siren?: string | null
          siret?: string | null
          tva_number?: string | null
          updated_at?: string
          vat_exempt?: boolean
        }
        Update: {
          bank_name?: string | null
          bic?: string | null
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_postal_code?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          legal_form?: string | null
          owner_id?: string
          owner_type?: string
          siren?: string | null
          siret?: string | null
          tva_number?: string | null
          updated_at?: string
          vat_exempt?: boolean
        }
        Relationships: []
      }
      billing_webhook_events: {
        Row: {
          event_id: string
          payload: Json | null
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          payload?: Json | null
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          payload?: Json | null
          received_at?: string
          type?: string
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
      booking_notes: {
        Row: {
          author_name: string
          booking_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          author_name: string
          booking_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          author_name?: string
          booking_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payment_infos: {
        Row: {
          booking_id: string | null
          cancellation_fee_amount: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string | null
          customer_id: string | null
          estimated_price: number | null
          id: string
          payment_at: string | null
          payment_error_message: string | null
          payment_last_reminder_at: string | null
          payment_link_expires_at: string | null
          payment_link_stripe_id: string | null
          payment_reminder_count: number | null
          payment_status: string | null
          refund_amount: number | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          stripe_refund_id: string | null
          stripe_session_id: string | null
          stripe_setup_intent_id: string | null
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          cancellation_fee_amount?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string | null
          customer_id?: string | null
          estimated_price?: number | null
          id?: string
          payment_at?: string | null
          payment_error_message?: string | null
          payment_last_reminder_at?: string | null
          payment_link_expires_at?: string | null
          payment_link_stripe_id?: string | null
          payment_reminder_count?: number | null
          payment_status?: string | null
          refund_amount?: number | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_refund_id?: string | null
          stripe_session_id?: string | null
          stripe_setup_intent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          cancellation_fee_amount?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string | null
          customer_id?: string | null
          estimated_price?: number | null
          id?: string
          payment_at?: string | null
          payment_error_message?: string | null
          payment_last_reminder_at?: string | null
          payment_link_expires_at?: string | null
          payment_link_stripe_id?: string | null
          payment_reminder_count?: number | null
          payment_status?: string | null
          refund_amount?: number | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_refund_id?: string | null
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
      booking_therapists: {
        Row: {
          assigned_at: string | null
          booking_id: string
          id: string
          status: string
          therapist_id: string
        }
        Insert: {
          assigned_at?: string | null
          booking_id: string
          id?: string
          status?: string
          therapist_id: string
        }
        Update: {
          assigned_at?: string | null
          booking_id?: string
          id?: string
          status?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_therapists_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_treatments: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          is_addon: boolean
          parent_booking_treatment_id: string | null
          price_override: number | null
          therapist_id: string | null
          treatment_id: string
          variant_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          is_addon?: boolean
          parent_booking_treatment_id?: string | null
          price_override?: number | null
          therapist_id?: string | null
          treatment_id: string
          variant_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          is_addon?: boolean
          parent_booking_treatment_id?: string | null
          price_override?: number | null
          therapist_id?: string | null
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
            foreignKeyName: "booking_treatments_parent_booking_treatment_id_fkey"
            columns: ["parent_booking_treatment_id"]
            isOneToOne: false
            referencedRelation: "booking_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_treatments_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
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
          booking_group_id: string | null
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
          client_type: string
          created_at: string
          customer_id: string | null
          declined_by: string[] | null
          duration: number | null
          email_inquiry_id: string | null
          external_id: string | null
          external_reference: string | null
          gift_amount_applied_cents: number
          guest_count: number
          hold_expires_at: string | null
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
          payment_reference: string | null
          payment_status: string | null
          phone: string | null
          pms_charge_id: string | null
          pms_charge_status: string | null
          pms_error_message: string | null
          pms_guest_check_in: string | null
          pms_guest_check_out: string | null
          quote_token: string | null
          room_id: string | null
          room_number: string | null
          secondary_room_id: string | null
          short_token: string
          signature_token: string | null
          signed_at: string | null
          source: string
          status: string
          stripe_invoice_url: string | null
          surcharge_amount: number | null
          therapist_checked_in_at: string | null
          therapist_gender_preference: string | null
          therapist_id: string | null
          therapist_name: string | null
          total_price: number | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          booking_date: string
          booking_group_id?: string | null
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
          client_type?: string
          created_at?: string
          customer_id?: string | null
          declined_by?: string[] | null
          duration?: number | null
          email_inquiry_id?: string | null
          external_id?: string | null
          external_reference?: string | null
          gift_amount_applied_cents?: number
          guest_count?: number
          hold_expires_at?: string | null
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
          payment_reference?: string | null
          payment_status?: string | null
          phone?: string | null
          pms_charge_id?: string | null
          pms_charge_status?: string | null
          pms_error_message?: string | null
          pms_guest_check_in?: string | null
          pms_guest_check_out?: string | null
          quote_token?: string | null
          room_id?: string | null
          room_number?: string | null
          secondary_room_id?: string | null
          short_token?: string
          signature_token?: string | null
          signed_at?: string | null
          source?: string
          status?: string
          stripe_invoice_url?: string | null
          surcharge_amount?: number | null
          therapist_checked_in_at?: string | null
          therapist_gender_preference?: string | null
          therapist_id?: string | null
          therapist_name?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          booking_date?: string
          booking_group_id?: string | null
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
          client_type?: string
          created_at?: string
          customer_id?: string | null
          declined_by?: string[] | null
          duration?: number | null
          email_inquiry_id?: string | null
          external_id?: string | null
          external_reference?: string | null
          gift_amount_applied_cents?: number
          guest_count?: number
          hold_expires_at?: string | null
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
          payment_reference?: string | null
          payment_status?: string | null
          phone?: string | null
          pms_charge_id?: string | null
          pms_charge_status?: string | null
          pms_error_message?: string | null
          pms_guest_check_in?: string | null
          pms_guest_check_out?: string | null
          quote_token?: string | null
          room_id?: string | null
          room_number?: string | null
          secondary_room_id?: string | null
          short_token?: string
          signature_token?: string | null
          signed_at?: string | null
          source?: string
          status?: string
          stripe_invoice_url?: string | null
          surcharge_amount?: number | null
          therapist_checked_in_at?: string | null
          therapist_gender_preference?: string | null
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
            foreignKeyName: "bookings_secondary_room_id_fkey"
            columns: ["secondary_room_id"]
            isOneToOne: false
            referencedRelation: "treatment_rooms"
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
      bundle_amount_usages: {
        Row: {
          amount_cents_used: number
          booking_id: string
          customer_bundle_id: string
          id: string
          used_at: string
        }
        Insert: {
          amount_cents_used: number
          booking_id: string
          customer_bundle_id: string
          id?: string
          used_at?: string
        }
        Update: {
          amount_cents_used?: number
          booking_id?: string
          customer_bundle_id?: string
          id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_amount_usages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_amount_usages_customer_bundle_id_fkey"
            columns: ["customer_bundle_id"]
            isOneToOne: false
            referencedRelation: "customer_treatment_bundles"
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
      checkout_intents: {
        Row: {
          booking_date: string | null
          booking_id: string | null
          booking_time: string | null
          cart_snapshot: Json
          client_email: string
          client_first_name: string
          client_last_name: string | null
          converted_at: string | null
          created_at: string
          customer_id: string
          hotel_id: string
          id: string
          language: string
          reminder_count: number
          reminder_sent_at: string | null
          resume_token: string
          room_number: string | null
          updated_at: string
        }
        Insert: {
          booking_date?: string | null
          booking_id?: string | null
          booking_time?: string | null
          cart_snapshot: Json
          client_email: string
          client_first_name: string
          client_last_name?: string | null
          converted_at?: string | null
          created_at?: string
          customer_id: string
          hotel_id: string
          id?: string
          language?: string
          reminder_count?: number
          reminder_sent_at?: string | null
          resume_token?: string
          room_number?: string | null
          updated_at?: string
        }
        Update: {
          booking_date?: string | null
          booking_id?: string | null
          booking_time?: string | null
          cart_snapshot?: Json
          client_email?: string
          client_first_name?: string
          client_last_name?: string | null
          converted_at?: string | null
          created_at?: string
          customer_id?: string
          hotel_id?: string
          id?: string
          language?: string
          reminder_count?: number
          reminder_sent_at?: string | null
          resume_token?: string
          room_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_intents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_intents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_intents_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
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
          organization_id: string
          phone: string
          profile_image: string | null
          status: string
          updated_at: string
          user_id: string | null
          venue_role: string | null
          welcome_seen_at: string | null
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
          organization_id: string
          phone: string
          profile_image?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          venue_role?: string | null
          welcome_seen_at?: string | null
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
          organization_id?: string
          phone?: string
          profile_image?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          venue_role?: string | null
          welcome_seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concierges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_treatment_bundles: {
        Row: {
          beneficiary_customer_id: string | null
          booking_id: string | null
          bundle_id: string
          claimed_at: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          expires_at: string
          gift_delivery_mode: string | null
          gift_message: string | null
          hotel_id: string
          id: string
          is_gift: boolean
          notes: string | null
          payment_reference: string | null
          purchase_date: string
          recipient_email: string | null
          recipient_name: string | null
          redemption_code: string | null
          sender_email: string | null
          sender_name: string | null
          sold_by: string | null
          status: string
          total_amount_cents: number | null
          total_sessions: number | null
          updated_at: string
          used_amount_cents: number
          used_sessions: number
        }
        Insert: {
          beneficiary_customer_id?: string | null
          booking_id?: string | null
          bundle_id: string
          claimed_at?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          expires_at: string
          gift_delivery_mode?: string | null
          gift_message?: string | null
          hotel_id: string
          id?: string
          is_gift?: boolean
          notes?: string | null
          payment_reference?: string | null
          purchase_date?: string
          recipient_email?: string | null
          recipient_name?: string | null
          redemption_code?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sold_by?: string | null
          status?: string
          total_amount_cents?: number | null
          total_sessions?: number | null
          updated_at?: string
          used_amount_cents?: number
          used_sessions?: number
        }
        Update: {
          beneficiary_customer_id?: string | null
          booking_id?: string | null
          bundle_id?: string
          claimed_at?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          expires_at?: string
          gift_delivery_mode?: string | null
          gift_message?: string | null
          hotel_id?: string
          id?: string
          is_gift?: boolean
          notes?: string | null
          payment_reference?: string | null
          purchase_date?: string
          recipient_email?: string | null
          recipient_name?: string | null
          redemption_code?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sold_by?: string | null
          status?: string
          total_amount_cents?: number | null
          total_sessions?: number | null
          updated_at?: string
          used_amount_cents?: number
          used_sessions?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_treatment_bundles_beneficiary_customer_id_fkey"
            columns: ["beneficiary_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
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
          auth_user_id: string | null
          civility: string | null
          created_at: string
          email: string | null
          first_name: string | null
          health_notes: string | null
          id: string
          language: string | null
          last_name: string | null
          phone: string | null
          preferred_therapist_id: string | null
          preferred_treatment_type: string | null
          profile_completed: boolean
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          civility?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          health_notes?: string | null
          id?: string
          language?: string | null
          last_name?: string | null
          phone?: string | null
          preferred_therapist_id?: string | null
          preferred_treatment_type?: string | null
          profile_completed?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          civility?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          health_notes?: string | null
          id?: string
          language?: string | null
          last_name?: string | null
          phone?: string | null
          preferred_therapist_id?: string | null
          preferred_treatment_type?: string | null
          profile_completed?: boolean
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
      email_inquiries: {
        Row: {
          booking_id: string | null
          confidence_score: number | null
          created_at: string
          direction: string
          error_message: string | null
          from_address: string
          hotel_id: string | null
          id: string
          last_reply_at: string | null
          message_id: string | null
          parent_inquiry_id: string | null
          parsed_data: Json | null
          raw_body_html: string | null
          raw_body_text: string | null
          raw_payload: Json | null
          sent_by: string | null
          status: string
          subject: string | null
          to_address: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          confidence_score?: number | null
          created_at?: string
          direction?: string
          error_message?: string | null
          from_address: string
          hotel_id?: string | null
          id?: string
          last_reply_at?: string | null
          message_id?: string | null
          parent_inquiry_id?: string | null
          parsed_data?: Json | null
          raw_body_html?: string | null
          raw_body_text?: string | null
          raw_payload?: Json | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          to_address: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          confidence_score?: number | null
          created_at?: string
          direction?: string
          error_message?: string | null
          from_address?: string
          hotel_id?: string | null
          id?: string
          last_reply_at?: string | null
          message_id?: string | null
          parent_inquiry_id?: string | null
          parsed_data?: Json | null
          raw_body_html?: string | null
          raw_body_text?: string | null
          raw_payload?: Json | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          to_address?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_inquiries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inquiries_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inquiries_parent_inquiry_id_fkey"
            columns: ["parent_inquiry_id"]
            isOneToOne: false
            referencedRelation: "email_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      email_opt_outs: {
        Row: {
          created_at: string
          email: string
          opted_out_at: string | null
          source: string | null
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          opted_out_at?: string | null
          source?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          opted_out_at?: string | null
          source?: string | null
          token?: string
        }
        Relationships: []
      }
      gift_code_attempts: {
        Row: {
          attempt_key: string
          created_at: string
          id: string
          succeeded: boolean
        }
        Insert: {
          attempt_key: string
          created_at?: string
          id?: string
          succeeded?: boolean
        }
        Update: {
          attempt_key?: string
          created_at?: string
          id?: string
          succeeded?: boolean
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
          {
            foreignKeyName: "hotel_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_payment_configs: {
        Row: {
          adyen_client_key: string | null
          adyen_environment: string | null
          adyen_merchant_account: string | null
          adyen_vault_secret_id: string | null
          connection_error: string | null
          connection_status: string | null
          connection_verified_at: string | null
          created_at: string | null
          hotel_id: string
          id: string
          provider: string
          stripe_account_id: string | null
          stripe_publishable_key: string | null
          stripe_vault_secret_id: string | null
          updated_at: string | null
        }
        Insert: {
          adyen_client_key?: string | null
          adyen_environment?: string | null
          adyen_merchant_account?: string | null
          adyen_vault_secret_id?: string | null
          connection_error?: string | null
          connection_status?: string | null
          connection_verified_at?: string | null
          created_at?: string | null
          hotel_id: string
          id?: string
          provider?: string
          stripe_account_id?: string | null
          stripe_publishable_key?: string | null
          stripe_vault_secret_id?: string | null
          updated_at?: string | null
        }
        Update: {
          adyen_client_key?: string | null
          adyen_environment?: string | null
          adyen_merchant_account?: string | null
          adyen_vault_secret_id?: string | null
          connection_error?: string | null
          connection_status?: string | null
          connection_verified_at?: string | null
          created_at?: string | null
          hotel_id?: string
          id?: string
          provider?: string
          stripe_account_id?: string | null
          stripe_publishable_key?: string | null
          stripe_vault_secret_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_payment_configs_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: true
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
          client_token: string | null
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
          client_token?: string | null
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
          client_token?: string | null
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
          booking_hold_duration_minutes: number
          booking_hold_enabled: boolean
          calendar_color: string | null
          cancellation_policy_text_en: string | null
          cancellation_policy_text_fr: string | null
          cancellation_tiers: Json | null
          city: string | null
          client_cancellation_cutoff_hours: number | null
          client_payment_mode: string
          closing_time: string | null
          company_offered: boolean | null
          contact_email: string | null
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
          inbound_email_alias: string
          inbound_email_domain: string
          inter_venue_buffer_minutes: number | null
          landing_subtitle: string | null
          landing_subtitle_en: string | null
          min_booking_notice_minutes: number | null
          name: string
          name_en: string | null
          offert: boolean | null
          opening_time: string | null
          organization_id: string
          out_of_hours_surcharge_percent: number | null
          payment_provider: string | null
          pms_auto_charge_room: boolean | null
          pms_guest_lookup_enabled: boolean | null
          pms_type: string | null
          postal_code: string | null
          room_turnover_buffer_minutes: number | null
          slot_interval: number | null
          slug: string
          status: string | null
          therapist_commission: number | null
          timezone: string | null
          updated_at: string
          vat: number | null
          venue_type: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          allow_out_of_hours_booking?: boolean | null
          auto_validate_bookings?: boolean | null
          booking_hold_duration_minutes?: number
          booking_hold_enabled?: boolean
          calendar_color?: string | null
          cancellation_policy_text_en?: string | null
          cancellation_policy_text_fr?: string | null
          cancellation_tiers?: Json | null
          city?: string | null
          client_cancellation_cutoff_hours?: number | null
          client_payment_mode?: string
          closing_time?: string | null
          company_offered?: boolean | null
          contact_email?: string | null
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
          inbound_email_alias: string
          inbound_email_domain: string
          inter_venue_buffer_minutes?: number | null
          landing_subtitle?: string | null
          landing_subtitle_en?: string | null
          min_booking_notice_minutes?: number | null
          name: string
          name_en?: string | null
          offert?: boolean | null
          opening_time?: string | null
          organization_id: string
          out_of_hours_surcharge_percent?: number | null
          payment_provider?: string | null
          pms_auto_charge_room?: boolean | null
          pms_guest_lookup_enabled?: boolean | null
          pms_type?: string | null
          postal_code?: string | null
          room_turnover_buffer_minutes?: number | null
          slot_interval?: number | null
          slug: string
          status?: string | null
          therapist_commission?: number | null
          timezone?: string | null
          updated_at?: string
          vat?: number | null
          venue_type?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          allow_out_of_hours_booking?: boolean | null
          auto_validate_bookings?: boolean | null
          booking_hold_duration_minutes?: number
          booking_hold_enabled?: boolean
          calendar_color?: string | null
          cancellation_policy_text_en?: string | null
          cancellation_policy_text_fr?: string | null
          cancellation_tiers?: Json | null
          city?: string | null
          client_cancellation_cutoff_hours?: number | null
          client_payment_mode?: string
          closing_time?: string | null
          company_offered?: boolean | null
          contact_email?: string | null
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
          inbound_email_alias?: string
          inbound_email_domain?: string
          inter_venue_buffer_minutes?: number | null
          landing_subtitle?: string | null
          landing_subtitle_en?: string | null
          min_booking_notice_minutes?: number | null
          name?: string
          name_en?: string | null
          offert?: boolean | null
          opening_time?: string | null
          organization_id?: string
          out_of_hours_surcharge_percent?: number | null
          payment_provider?: string | null
          pms_auto_charge_room?: boolean | null
          pms_guest_lookup_enabled?: boolean | null
          pms_type?: string | null
          postal_code?: string | null
          room_turnover_buffer_minutes?: number | null
          slot_interval?: number | null
          slug?: string
          status?: string | null
          therapist_commission?: number | null
          timezone?: string | null
          updated_at?: string
          vat?: number | null
          venue_type?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_ht: number
          amount_ttc: number
          bookings_count: number
          client_id: string | null
          client_snapshot: Json | null
          client_type: string
          created_at: string
          currency: string
          due_date: string
          generated_at: string | null
          hotel_id: string | null
          html_snapshot: string | null
          id: string
          invoice_kind: string
          invoice_number: string
          issue_date: string
          issuer_id: string | null
          issuer_snapshot: Json | null
          issuer_type: string
          metadata: Json | null
          period_end: string
          period_start: string
          status: string
          therapist_id: string | null
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          amount_ht: number
          amount_ttc: number
          bookings_count?: number
          client_id?: string | null
          client_snapshot?: Json | null
          client_type: string
          created_at?: string
          currency?: string
          due_date: string
          generated_at?: string | null
          hotel_id?: string | null
          html_snapshot?: string | null
          id?: string
          invoice_kind: string
          invoice_number: string
          issue_date?: string
          issuer_id?: string | null
          issuer_snapshot?: Json | null
          issuer_type: string
          metadata?: Json | null
          period_end: string
          period_start: string
          status?: string
          therapist_id?: string | null
          updated_at?: string
          vat_amount: number
          vat_rate?: number
        }
        Update: {
          amount_ht?: number
          amount_ttc?: number
          bookings_count?: number
          client_id?: string | null
          client_snapshot?: Json | null
          client_type?: string
          created_at?: string
          currency?: string
          due_date?: string
          generated_at?: string | null
          hotel_id?: string | null
          html_snapshot?: string | null
          id?: string
          invoice_kind?: string
          invoice_number?: string
          issue_date?: string
          issuer_id?: string | null
          issuer_snapshot?: Json | null
          issuer_type?: string
          metadata?: Json | null
          period_end?: string
          period_start?: string
          status?: string
          therapist_id?: string | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          message: string
          read: boolean
          task_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          message: string
          read?: boolean
          task_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          task_id?: string | null
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
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          commercial_name: string | null
          contact_email: string | null
          created_at: string
          id: string
          legal_address: string | null
          legal_capital: string | null
          legal_city: string | null
          legal_country: string | null
          legal_form: string | null
          legal_name: string | null
          legal_postal_code: string | null
          legal_synced_at: string | null
          logo_url: string | null
          name: string
          rcs: string | null
          siren: string | null
          siret: string | null
          slug: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          commercial_name?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          legal_address?: string | null
          legal_capital?: string | null
          legal_city?: string | null
          legal_country?: string | null
          legal_form?: string | null
          legal_name?: string | null
          legal_postal_code?: string | null
          legal_synced_at?: string | null
          logo_url?: string | null
          name: string
          rcs?: string | null
          siren?: string | null
          siret?: string | null
          slug: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          commercial_name?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          legal_address?: string | null
          legal_capital?: string | null
          legal_city?: string | null
          legal_country?: string | null
          legal_form?: string | null
          legal_name?: string | null
          legal_postal_code?: string | null
          legal_synced_at?: string | null
          logo_url?: string | null
          name?: string
          rcs?: string | null
          siren?: string | null
          siret?: string | null
          slug?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
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
      plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          monthly_amount_cents: number | null
          name: string
          sort_order: number
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          stripe_product_id: string | null
          updated_at: string
          yearly_amount_cents: number | null
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          monthly_amount_cents?: number | null
          name: string
          sort_order?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          updated_at?: string
          yearly_amount_cents?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          monthly_amount_cents?: number | null
          name?: string
          sort_order?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          updated_at?: string
          yearly_amount_cents?: number | null
        }
        Relationships: []
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
      schedule_reminder_logs: {
        Row: {
          id: string
          reminder_type: string
          sent_at: string
          target_month: string
          therapist_id: string
        }
        Insert: {
          id?: string
          reminder_type: string
          sent_at?: string
          target_month: string
          therapist_id: string
        }
        Update: {
          id?: string
          reminder_type?: string
          sent_at?: string
          target_month?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_reminder_logs_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          default_payment_method: string | null
          id: string
          latest_invoice_id: string | null
          metadata: Json
          organization_id: string
          plan_id: string | null
          seats: number
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
          stripe_subscription_item_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          default_payment_method?: string | null
          id?: string
          latest_invoice_id?: string | null
          metadata?: Json
          organization_id: string
          plan_id?: string | null
          seats?: number
          status: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          stripe_subscription_item_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          default_payment_method?: string | null
          id?: string
          latest_invoice_id?: string | null
          metadata?: Json
          organization_id?: string
          plan_id?: string | null
          seats?: number
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          stripe_subscription_item_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to_user_id: string | null
          booking_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          due_date: string | null
          hotel_id: string | null
          id: string
          organization_id: string
          position: number
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          hotel_id?: string | null
          id?: string
          organization_id: string
          position?: number
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          hotel_id?: string | null
          id?: string
          organization_id?: string
          position?: number
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_absences: {
        Row: {
          created_at: string
          end_date: string
          id: string
          note: string | null
          reason: string
          start_date: string
          therapist_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          note?: string | null
          reason: string
          start_date: string
          therapist_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          note?: string | null
          reason?: string
          start_date?: string
          therapist_id?: string
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
          {
            foreignKeyName: "therapist_payouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          rate_60: number | null
          rate_75: number | null
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
          rate_60?: number | null
          rate_75?: number | null
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
          rate_60?: number | null
          rate_75?: number | null
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
      treatment_addons: {
        Row: {
          addon_treatment_id: string
          created_at: string
          id: string
          parent_treatment_id: string
          sort_order: number
        }
        Insert: {
          addon_treatment_id: string
          created_at?: string
          id?: string
          parent_treatment_id: string
          sort_order?: number
        }
        Update: {
          addon_treatment_id?: string
          created_at?: string
          id?: string
          parent_treatment_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "treatment_addons_addon_treatment_id_fkey"
            columns: ["addon_treatment_id"]
            isOneToOne: false
            referencedRelation: "treatment_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_addons_parent_treatment_id_fkey"
            columns: ["parent_treatment_id"]
            isOneToOne: false
            referencedRelation: "treatment_menus"
            referencedColumns: ["id"]
          },
        ]
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
          amount_cents: number | null
          bundle_type: string
          cover_image_url: string | null
          created_at: string
          currency: string | null
          description: string | null
          description_en: string | null
          display_on_client_flow: boolean
          hotel_id: string
          id: string
          name: string
          name_en: string | null
          price: number
          sort_order: number | null
          status: string
          title: string | null
          title_en: string | null
          total_sessions: number | null
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          amount_cents?: number | null
          bundle_type?: string
          cover_image_url?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          description_en?: string | null
          display_on_client_flow?: boolean
          hotel_id: string
          id?: string
          name: string
          name_en?: string | null
          price: number
          sort_order?: number | null
          status?: string
          title?: string | null
          title_en?: string | null
          total_sessions?: number | null
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          amount_cents?: number | null
          bundle_type?: string
          cover_image_url?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          description_en?: string | null
          display_on_client_flow?: boolean
          hotel_id?: string
          id?: string
          name?: string
          name_en?: string | null
          price?: number
          sort_order?: number | null
          status?: string
          title?: string | null
          title_en?: string | null
          total_sessions?: number | null
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
          is_addon: boolean
          name: string
          name_en: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hotel_id: string
          id?: string
          is_addon?: boolean
          name: string
          name_en?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hotel_id?: string
          id?: string
          is_addon?: boolean
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
          amenity_id: string | null
          available_days: number[] | null
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
          is_addon: boolean
          is_bestseller: boolean | null
          is_bundle: boolean | null
          lead_time: number | null
          name: string
          name_en: string | null
          price: number | null
          price_on_request: boolean | null
          requires_room: boolean | null
          service_for: string
          slug: string
          sort_order: number | null
          status: string
          treatment_type: string | null
          updated_at: string
        }
        Insert: {
          amenity_id?: string | null
          available_days?: number[] | null
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
          is_addon?: boolean
          is_bestseller?: boolean | null
          is_bundle?: boolean | null
          lead_time?: number | null
          name: string
          name_en?: string | null
          price?: number | null
          price_on_request?: boolean | null
          requires_room?: boolean | null
          service_for: string
          slug: string
          sort_order?: number | null
          status?: string
          treatment_type?: string | null
          updated_at?: string
        }
        Update: {
          amenity_id?: string | null
          available_days?: number[] | null
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
          is_addon?: boolean
          is_bestseller?: boolean | null
          is_bundle?: boolean | null
          lead_time?: number | null
          name?: string
          name_en?: string | null
          price?: number | null
          price_on_request?: boolean | null
          requires_room?: boolean | null
          service_for?: string
          slug?: string
          sort_order?: number | null
          status?: string
          treatment_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_menus_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "venue_amenities"
            referencedColumns: ["id"]
          },
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
          guest_count: number
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
          guest_count?: number
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
          guest_count?: number
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
      venue_branding: {
        Row: {
          button_color: string | null
          button_text_color: string | null
          created_at: string
          font_body_family: string | null
          font_body_url: string | null
          font_title_family: string | null
          font_title_url: string | null
          hotel_id: string
          updated_at: string
          welcome_background_color: string | null
          welcome_background_opacity: number | null
        }
        Insert: {
          button_color?: string | null
          button_text_color?: string | null
          created_at?: string
          font_body_family?: string | null
          font_body_url?: string | null
          font_title_family?: string | null
          font_title_url?: string | null
          hotel_id: string
          updated_at?: string
          welcome_background_color?: string | null
          welcome_background_opacity?: number | null
        }
        Update: {
          button_color?: string | null
          button_text_color?: string | null
          created_at?: string
          font_body_family?: string | null
          font_body_url?: string | null
          font_title_family?: string | null
          font_title_url?: string | null
          hotel_id?: string
          updated_at?: string
          welcome_background_color?: string | null
          welcome_background_opacity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_branding_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: true
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
      acknowledge_audit_alert: {
        Args: { _alert_id: string }
        Returns: undefined
      }
      acknowledge_audit_alerts_bulk: {
        Args: { _alert_ids: string[] }
        Returns: number
      }
      admin_can_access_booking: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      admin_can_access_concierge: {
        Args: { _concierge_id: string }
        Returns: boolean
      }
      admin_can_access_hotel: { Args: { _hotel_id: string }; Returns: boolean }
      admin_can_access_therapist: {
        Args: { _therapist_id: string }
        Returns: boolean
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
      begin_booking_cancellation: {
        Args: {
          _booking_id: string
          _cancellation_fee_amount: number
          _cancelled_by: string
          _reason: string
          _refund_amount: number
        }
        Returns: {
          assigned_at: string | null
          booking_date: string
          booking_group_id: string | null
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
          client_type: string
          created_at: string
          customer_id: string | null
          declined_by: string[] | null
          duration: number | null
          email_inquiry_id: string | null
          external_id: string | null
          external_reference: string | null
          gift_amount_applied_cents: number
          guest_count: number
          hold_expires_at: string | null
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
          payment_reference: string | null
          payment_status: string | null
          phone: string | null
          pms_charge_id: string | null
          pms_charge_status: string | null
          pms_error_message: string | null
          pms_guest_check_in: string | null
          pms_guest_check_out: string | null
          quote_token: string | null
          room_id: string | null
          room_number: string | null
          secondary_room_id: string | null
          short_token: string
          signature_token: string | null
          signed_at: string | null
          source: string
          status: string
          stripe_invoice_url: string | null
          surcharge_amount: number | null
          therapist_checked_in_at: string | null
          therapist_gender_preference: string | null
          therapist_id: string | null
          therapist_name: string | null
          total_price: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      begin_booking_noshow: {
        Args: {
          _booking_id: string
          _cancellation_fee_amount: number
          _changed_by: string
          _reason: string
          _refund_amount: number
        }
        Returns: {
          assigned_at: string | null
          booking_date: string
          booking_group_id: string | null
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
          client_type: string
          created_at: string
          customer_id: string | null
          declined_by: string[] | null
          duration: number | null
          email_inquiry_id: string | null
          external_id: string | null
          external_reference: string | null
          gift_amount_applied_cents: number
          guest_count: number
          hold_expires_at: string | null
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
          payment_reference: string | null
          payment_status: string | null
          phone: string | null
          pms_charge_id: string | null
          pms_charge_status: string | null
          pms_error_message: string | null
          pms_guest_check_in: string | null
          pms_guest_check_out: string | null
          quote_token: string | null
          room_id: string | null
          room_number: string | null
          secondary_room_id: string | null
          short_token: string
          signature_token: string | null
          signed_at: string | null
          source: string
          status: string
          stripe_invoice_url: string | null
          surcharge_amount: number | null
          therapist_checked_in_at: string | null
          therapist_gender_preference: string | null
          therapist_id: string | null
          therapist_name: string | null
          total_price: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      can_assign_therapist_to_booking: {
        Args: { _booking_id: string; _target_therapist_id: string }
        Returns: boolean
      }
      claim_gift_card: {
        Args: { _code: string; _email?: string }
        Returns: string
      }
      claim_gift_card_public: {
        Args: { _code: string; _email: string; _first_name?: string }
        Returns: {
          bundle_id: string
          hotel_id: string
          status: string
        }[]
      }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      concierge_can_view_therapist: {
        Args: { _therapist_id: string }
        Returns: boolean
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
      create_customer_gift_card: {
        Args: {
          _bundle_id: string
          _gift_delivery_mode?: string
          _gift_message?: string
          _hotel_id: string
          _is_gift: boolean
          _payment_reference?: string
          _purchaser_customer_id: string
          _recipient_email?: string
          _recipient_name?: string
          _sender_email?: string
          _sender_name?: string
        }
        Returns: {
          customer_bundle_id: string
          redemption_code: string
        }[]
      }
      create_therapist_absence: {
        Args: {
          _end_date: string
          _note?: string
          _reason: string
          _start_date: string
          _therapist_id: string
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
      customer_has_booking_in_concierge_hotels: {
        Args: { _customer_id: string; _user_id: string }
        Returns: boolean
      }
      decline_booking: { Args: { _booking_id: string }; Returns: undefined }
      delete_payment_secret: {
        Args: { p_secret_id: string }
        Returns: undefined
      }
      delete_therapist_absence: {
        Args: { _absence_id: string }
        Returns: undefined
      }
      detect_bundles_for_auth_customer: {
        Args: { _hotel_id: string; _treatment_ids?: string[] }
        Returns: Json
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
      detect_gift_cards_for_booking: {
        Args: { _hotel_id: string; _phone: string }
        Returns: {
          cover_image_url: string
          customer_bundle_id: string
          expires_at: string
          remaining_amount_cents: number
          title: string
          title_en: string
          total_amount_cents: number
          used_amount_cents: number
        }[]
      }
      expire_overdue_bundles: { Args: never; Returns: number }
      find_or_create_customer: {
        Args: {
          _civility?: string
          _email?: string
          _first_name: string
          _language?: string
          _last_name?: string
          _phone: string
        }
        Returns: string
      }
      gateway_create_api_key: {
        Args: {
          _hotel_id?: string
          _name: string
          _rate_limit?: number
          _scopes?: string[]
        }
        Returns: Json
      }
      gateway_create_org_api_key: { Args: { _org_id: string }; Returns: Json }
      gateway_get_org_api_key: {
        Args: { _org_id: string }
        Returns: {
          created_at: string
          id: string
          key_prefix: string
          last_used_at: string
          rate_limit_per_min: number
          scopes: string[]
        }[]
      }
      gateway_list_api_keys: {
        Args: never
        Returns: {
          created_at: string
          hotel_id: string
          id: string
          key_prefix: string
          last_used_at: string
          name: string
          rate_limit_per_min: number
          revoked_at: string
          scopes: string[]
        }[]
      }
      gateway_list_customer_bookings: {
        Args: {
          _customer_id: string
          _hotel_id: string
          _limit?: number
          _offset?: number
        }
        Returns: {
          booking_date: string
          booking_number: number
          booking_time: string
          client_type: string
          created_at: string
          currency: string
          duration: number
          id: string
          payment_method: string
          payment_status: string
          room_number: string
          status: string
          total_count: number
          total_price: string
          treatments: Json
        }[]
      }
      gateway_list_venue_customers: {
        Args: { _hotel_id: string; _limit?: number; _offset?: number }
        Returns: {
          booking_count: number
          created_at: string
          currency: string
          email: string
          first_name: string
          id: string
          language: string
          last_name: string
          last_visit_date: string
          phone: string
          preferred_treatment_type: string
          profile_completed: boolean
          total_count: number
          total_spent_amount: string
          updated_at: string
        }[]
      }
      gateway_reveal_api_key: { Args: { _id: string }; Returns: string }
      gateway_reveal_org_api_key: { Args: { _org_id: string }; Returns: string }
      gateway_revoke_api_key: { Args: { _id: string }; Returns: undefined }
      gateway_verify_api_key: { Args: { _key: string }; Returns: Json }
      gen_booking_short_token: { Args: never; Returns: string }
      generate_gift_redemption_code: { Args: never; Returns: string }
      generate_unique_hotel_slug: {
        Args: { _base: string; _exclude_id?: string }
        Returns: string
      }
      generate_unique_treatment_slug: {
        Args: { _base: string; _exclude_id?: string; _hotel_id: string }
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
      get_booking_therapist_names: {
        Args: { _booking_ids: string[] }
        Returns: {
          booking_id: string
          first_name: string
          last_name: string
          therapist_id: string
        }[]
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
      get_customer_portal_data: { Args: never; Returns: Json }
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
      get_incomplete_schedule_therapist_ids: {
        Args: { p_dedup_days?: number; p_reminder_type?: string }
        Returns: string[]
      }
      get_organization_features: { Args: { _org: string }; Returns: Json }
      get_payment_adyen_secrets: { Args: { p_hotel_id: string }; Returns: Json }
      get_payment_stripe_secrets: {
        Args: { p_hotel_id: string }
        Returns: Json
      }
      get_public_booking: {
        Args: { p_token: string }
        Returns: {
          booking_date: string
          booking_id: number
          booking_time: string
          booking_treatments: Json
          card_brand: string
          card_last4: string
          client_email: string
          client_first_name: string
          client_last_name: string
          estimated_price: number
          hotel_id: string
          hotel_name: string
          id: string
          language: string
          payment_method: string
          payment_status: string
          phone: string
          room_number: string
          short_token: string
          status: string
          total_price: number
        }[]
      }
      get_public_hotel: {
        Args: { _identifier: string }
        Returns: {
          address: string
          allow_out_of_hours_booking: boolean
          booking_hold_duration_minutes: number
          booking_hold_enabled: boolean
          button_color: string
          button_text_color: string
          cancellation_policy_text_en: string
          cancellation_policy_text_fr: string
          cancellation_tiers: Json
          city: string
          client_cancellation_cutoff_hours: number
          client_payment_mode: string
          closing_time: string
          company_offered: boolean
          contact_email: string
          contact_phone: string
          country: string
          cover_image: string
          currency: string
          days_of_week: number[]
          description: string
          description_en: string
          font_body_family: string
          font_body_url: string
          font_title_family: string
          font_title_url: string
          id: string
          image: string
          landing_subtitle: string
          landing_subtitle_en: string
          name: string
          name_en: string
          offert: boolean
          opening_time: string
          organization_name: string
          out_of_hours_surcharge_percent: number
          pms_guest_lookup_enabled: boolean
          postal_code: string
          recurrence_interval: number
          recurring_end_date: string
          recurring_start_date: string
          schedule_type: string
          slot_interval: number
          slug: string
          status: string
          vat: number
          venue_type: string
          website_url: string
          welcome_background_color: string
          welcome_background_opacity: number
        }[]
      }
      get_public_hotel_by_id: {
        Args: { _hotel_id: string }
        Returns: {
          address: string
          allow_out_of_hours_booking: boolean
          booking_hold_duration_minutes: number
          booking_hold_enabled: boolean
          button_color: string
          button_text_color: string
          cancellation_policy_text_en: string
          cancellation_policy_text_fr: string
          cancellation_tiers: Json
          city: string
          client_cancellation_cutoff_hours: number
          client_payment_mode: string
          closing_time: string
          company_offered: boolean
          contact_email: string
          contact_phone: string
          country: string
          cover_image: string
          currency: string
          days_of_week: number[]
          description: string
          description_en: string
          font_body_family: string
          font_body_url: string
          font_title_family: string
          font_title_url: string
          id: string
          image: string
          landing_subtitle: string
          landing_subtitle_en: string
          name: string
          name_en: string
          offert: boolean
          opening_time: string
          organization_name: string
          out_of_hours_surcharge_percent: number
          pms_guest_lookup_enabled: boolean
          postal_code: string
          recurrence_interval: number
          recurring_end_date: string
          recurring_start_date: string
          schedule_type: string
          slot_interval: number
          slug: string
          status: string
          vat: number
          venue_type: string
          website_url: string
          welcome_background_color: string
          welcome_background_opacity: number
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
      get_public_treatment_addons: {
        Args: { _parent_id: string }
        Returns: {
          category: string
          currency: string
          description: string
          description_en: string
          duration: number
          id: string
          image: string
          name: string
          name_en: string
          price: number
          price_on_request: boolean
          sort_order: number
        }[]
      }
      get_public_treatments: {
        Args: { _hotel_id: string }
        Returns: {
          amenity_id: string
          amenity_type: string
          available_days: number[]
          bundle_id: string
          category: string
          currency: string
          description: string
          description_en: string
          duration: number
          id: string
          image: string
          is_addon: boolean
          is_bestseller: boolean
          is_bundle: boolean
          lead_time: number
          name: string
          name_en: string
          price: number
          price_on_request: boolean
          service_for: string
          slug: string
          sort_order: number
          variants: Json
        }[]
      }
      get_room_next_booking_gap: {
        Args: {
          _booking_date: string
          _booking_end_time: string
          _current_booking_id: string
          _room_id: string
        }
        Returns: {
          gap_minutes: number
          next_booking_time: string
        }[]
      }
      get_schedule_completeness: {
        Args: { p_therapist_id: string }
        Returns: Json
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
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      get_user_timezone: { Args: { _user_id: string }; Returns: string }
      get_venue_available_dates: {
        Args: { _end_date: string; _hotel_id: string; _start_date: string }
        Returns: string[]
      }
      get_venue_therapists: {
        Args: { _hotel_id: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
          profile_image: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_booking_participant: {
        Args: { _booking_id: string; _therapist_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_venue_available_on_date: {
        Args: { _check_date: string; _hotel_id: string }
        Returns: boolean
      }
      issue_email_opt_out_token: {
        Args: { _email: string; _source?: string }
        Returns: string
      }
      lookup_gift_card_by_code: {
        Args: { _attempt_key: string; _code: string }
        Returns: {
          already_claimed: boolean
          bundle_type: string
          cover_image_url: string
          expires_at: string
          gift_message: string
          hotel_cover_image: string
          hotel_id: string
          hotel_image: string
          hotel_name: string
          is_active: boolean
          is_gift: boolean
          sender_name: string
          title: string
          title_en: string
          total_amount_cents: number
          total_sessions: number
        }[]
      }
      mark_checkout_intent_converted: {
        Args: { _booking_id: string; _intent_id: string }
        Returns: undefined
      }
      mark_checkout_intent_reminded: {
        Args: { _intent_id: string }
        Returns: undefined
      }
      merge_customer_profiles: {
        Args: { _existing_customer_id: string; _new_customer_id: string }
        Returns: undefined
      }
      next_invoice_number: { Args: never; Returns: string }
      organization_has_active_billing: {
        Args: { _org: string }
        Returns: boolean
      }
      reactivate_prereservation: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      reschedule_booking_public: {
        Args: { p_new_date: string; p_new_time: string; p_token: string }
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
          _guest_count?: number
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
      resume_checkout_intent: {
        Args: { _token: string }
        Returns: {
          booking_date: string
          booking_time: string
          cart_snapshot: Json
          client_email: string
          client_first_name: string
          client_last_name: string
          hotel_id: string
          hotel_slug: string
          language: string
          room_number: string
        }[]
      }
      revert_booking_cancellation_after_stripe_error: {
        Args: {
          _booking_id: string
          _cancellation_fee_amount?: number
          _cancelled_at?: string
          _cancelled_by?: string
          _gift_amount_applied_cents: number
          _gift_amount_usages?: Json
          _payment_info_existed?: boolean
          _reason: string
          _refund_amount?: number
          _status: string
          _stripe_refund_id?: string
        }
        Returns: undefined
      }
      slugify: { Args: { _input: string }; Returns: string }
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
      sync_guest_checkout: {
        Args: {
          _booking_date?: string
          _booking_time?: string
          _cart_snapshot?: Json
          _client_email: string
          _first_name: string
          _hotel_id: string
          _language?: string
          _last_name?: string
          _phone: string
          _room_number?: string
        }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
      unassign_booking: {
        Args: { _booking_id: string; _hairdresser_id: string }
        Returns: Json
      }
      unsubscribe_email: { Args: { _token: string }; Returns: boolean }
      upsert_checkout_intent: {
        Args: {
          _booking_date?: string
          _booking_time?: string
          _cart_snapshot?: Json
          _client_email: string
          _client_first_name: string
          _client_last_name?: string
          _customer_id: string
          _hotel_id: string
          _language?: string
          _room_number?: string
        }
        Returns: string
      }
      upsert_payment_secret: {
        Args: {
          p_existing_id: string
          p_hotel_id: string
          p_payload: Json
          p_provider: string
        }
        Returns: string
      }
      use_bundle_session: {
        Args: {
          _booking_id: string
          _customer_bundle_id: string
          _treatment_id: string
        }
        Returns: string
      }
      use_gift_amount: {
        Args: {
          _amount_cents: number
          _booking_id: string
          _customer_bundle_id: string
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

