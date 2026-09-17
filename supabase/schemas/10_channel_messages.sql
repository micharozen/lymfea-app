CREATE TABLE IF NOT EXISTS "public"."channel_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text",
    "from_identifier" "text" NOT NULL,
    "to_identifier" "text" NOT NULL,
    "subject" "text",
    "raw_body_text" "text",
    "raw_body_html" "text",
    "raw_payload" "jsonb",
    "parsed_data" "jsonb",
    "confidence_score" numeric,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "booking_id" "uuid",
    "error_message" "text",
    "external_message_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "direction" "text" DEFAULT 'inbound'::"text" NOT NULL,
    "parent_message_id" "uuid",
    "sent_by" "uuid",
    "last_reply_at" timestamp with time zone,
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "customer_id" "uuid",
    "task_id" "uuid",
    CONSTRAINT "channel_messages_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'whatsapp'::"text", 'instagram'::"text", 'web_form'::"text"]))),
    CONSTRAINT "channel_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "channel_messages_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'parsed'::"text", 'converted'::"text", 'dismissed'::"text", 'failed'::"text", 'sent'::"text", 'replied'::"text"])))
);

ALTER TABLE "public"."channel_messages" OWNER TO "postgres";

COMMENT ON TABLE "public"."channel_messages" IS 'Messages entrants et sortants, tous canaux confondus. Couche transport : le fil (parent_message_id + direction), le parsing et la réponse. Le suivi du travail vit sur tasks.';

COMMENT ON COLUMN "public"."channel_messages"."from_identifier" IS 'Émetteur : adresse email, numéro E.164 ou identifiant de compte selon le canal.';

COMMENT ON COLUMN "public"."channel_messages"."to_identifier" IS 'Destinataire, même format que from_identifier.';

COMMENT ON COLUMN "public"."channel_messages"."confidence_score" IS 'LLM-reported intent confidence in 0..1. Phase 2 auto-converts when ≥ 0.8.';

COMMENT ON COLUMN "public"."channel_messages"."status" IS 'État technique du message : received → parsed | replied | failed. L''état de travail (à faire / en cours / terminé) vit sur tasks.status.';

COMMENT ON COLUMN "public"."channel_messages"."external_message_id" IS 'Identifiant chez le fournisseur : Message-ID email, wamid WhatsApp…';

COMMENT ON COLUMN "public"."channel_messages"."direction" IS 'inbound = received from outside; outbound = reply sent by an admin via send-inquiry-reply.';

COMMENT ON COLUMN "public"."channel_messages"."parent_message_id" IS 'For outbound rows: id of the inbound root they reply to. Null for roots.';

COMMENT ON COLUMN "public"."channel_messages"."sent_by" IS 'Admin user who sent the outbound reply. Null for inbound rows.';

COMMENT ON COLUMN "public"."channel_messages"."last_reply_at" IS 'Updated on the root each time an outbound reply is sent. Used to sort the inbox.';

COMMENT ON COLUMN "public"."channel_messages"."task_id" IS 'Tâche qui traite ce fil. Toutes les réponses d''un fil partagent le task_id de leur racine.';

ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id");

CREATE INDEX "channel_messages_booking_id_idx" ON "public"."channel_messages" USING "btree" ("booking_id");

CREATE INDEX "channel_messages_channel_idx" ON "public"."channel_messages" USING "btree" ("channel");

CREATE INDEX "channel_messages_customer_idx" ON "public"."channel_messages" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);

CREATE INDEX "channel_messages_direction_idx" ON "public"."channel_messages" USING "btree" ("direction");

CREATE INDEX "channel_messages_hotel_id_idx" ON "public"."channel_messages" USING "btree" ("hotel_id", "created_at" DESC);

CREATE INDEX "channel_messages_parent_idx" ON "public"."channel_messages" USING "btree" ("parent_message_id");

CREATE INDEX "channel_messages_status_idx" ON "public"."channel_messages" USING "btree" ("status");

CREATE INDEX "channel_messages_task_idx" ON "public"."channel_messages" USING "btree" ("task_id") WHERE ("task_id" IS NOT NULL);

ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "public"."channel_messages"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;

ALTER TABLE "public"."channel_messages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_messages admin read" ON "public"."channel_messages" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role")));

CREATE POLICY "channel_messages admin update" ON "public"."channel_messages" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role")));

GRANT ALL ON TABLE "public"."channel_messages" TO "anon";

GRANT ALL ON TABLE "public"."channel_messages" TO "authenticated";

GRANT ALL ON TABLE "public"."channel_messages" TO "service_role";
