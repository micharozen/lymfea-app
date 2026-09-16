CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "hotel_id" "text",
    "booking_id" "uuid",
    "customer_id" "uuid",
    "assigned_to_user_id" "uuid",
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "due_date" "date",
    "position" double precision DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "task_type_other" "text",
    "treatment_menu_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "therapist_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "checklist" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attachments" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "client_type" "text",
    "channel" "text",
    "feedback_type" "text",
    "treatment_date" "date",
    "prospect_first_name" "text",
    "prospect_last_name" "text",
    "prospect_email" "text",
    "prospect_phone" "text",
    "converted_booking_id" "uuid",
    CONSTRAINT "tasks_channel_check" CHECK ((("channel" IS NULL) OR ("channel" = ANY (ARRAY['website'::"text", 'email'::"text", 'phone'::"text", 'whatsapp'::"text", 'instagram'::"text", 'walk_in'::"text", 'partner'::"text", 'other'::"text"])))),
    CONSTRAINT "tasks_client_type_check" CHECK ((("client_type" IS NULL) OR ("client_type" = ANY (ARRAY['hotel'::"text", 'staycation'::"text", 'classpass'::"text", 'sezame'::"text", 'external'::"text"])))),
    CONSTRAINT "tasks_feedback_type_check" CHECK ((("feedback_type" IS NULL) OR ("feedback_type" = ANY (ARRAY['validation_received'::"text", 'issue_reported'::"text", 'change_requested'::"text", 'awaiting_client'::"text", 'awaiting_partner'::"text", 'need_more_info'::"text", 'internal_feedback'::"text", 'awaiting_payment'::"text"])))),
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'in_progress'::"text", 'done'::"text"]))),
    CONSTRAINT "tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['booking_followup'::"text", 'payment_followup'::"text", 'gift_followup'::"text", 'loyalty'::"text", 'bug'::"text", 'inbound_request'::"text", 'other'::"text"])))
);

ALTER TABLE ONLY "public"."tasks" REPLICA IDENTITY FULL;

ALTER TABLE "public"."tasks" OWNER TO "postgres";

COMMENT ON COLUMN "public"."tasks"."hotel_id" IS 'Lieu de la tâche. Reste NULLABLE pour les tâches créées avant cette migration, mais obligatoire côté application.';

COMMENT ON COLUMN "public"."tasks"."task_type" IS 'Type de tâche (ex-colonnes Asana). Valeur libre saisie dans task_type_other quand task_type = ''other''.';

COMMENT ON COLUMN "public"."tasks"."task_type_other" IS 'Libellé libre du type, renseigné uniquement quand task_type = ''other''.';

COMMENT ON COLUMN "public"."tasks"."treatment_menu_ids" IS 'Soins concernés (ids treatment_menus). Pas de FK : un soin supprimé laisse un id orphelin, ignoré à l''affichage.';

COMMENT ON COLUMN "public"."tasks"."therapist_ids" IS 'Thérapeutes concernés (ids hairdressers). Pas de FK : un thérapeute supprimé laisse un id orphelin, ignoré à l''affichage.';

COMMENT ON COLUMN "public"."tasks"."checklist" IS 'Sous-tâches cochables : tableau d''objets { id, label, done }, écrit en bloc avec la tâche.';

COMMENT ON COLUMN "public"."tasks"."attachments" IS 'Captures d''écran jointes : chemins dans le bucket privé task-attachments (pas des URLs, elles sont signées à l''affichage).';

COMMENT ON COLUMN "public"."tasks"."treatment_date" IS 'Date du soin demandé — distincte de due_date, qui est l''échéance de traitement de la tâche.';

COMMENT ON COLUMN "public"."tasks"."prospect_phone" IS 'Coordonnées saisies avant qu''une fiche client n''existe. La fiche customers n''est résolue ou créée qu''à la conversion, par find_or_create_customer.';

COMMENT ON COLUMN "public"."tasks"."converted_booking_id" IS 'Réservation issue de cette demande. Non nul = conversion déjà faite, non rejouable.';

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_tasks_assigned_to" ON "public"."tasks" USING "btree" ("assigned_to_user_id") WHERE ("assigned_to_user_id" IS NOT NULL);

CREATE INDEX "idx_tasks_booking" ON "public"."tasks" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);

CREATE INDEX "idx_tasks_customer" ON "public"."tasks" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);

CREATE INDEX "idx_tasks_hotel" ON "public"."tasks" USING "btree" ("hotel_id") WHERE ("hotel_id" IS NOT NULL);

CREATE INDEX "idx_tasks_organization" ON "public"."tasks" USING "btree" ("organization_id");

CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");

CREATE INDEX "idx_tasks_treatment_date" ON "public"."tasks" USING "btree" ("treatment_date") WHERE ("treatment_date" IS NOT NULL);

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_converted_booking_id_fkey" FOREIGN KEY ("converted_booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

CREATE POLICY "Admins manage tasks in their org" ON "public"."tasks" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"())))));

CREATE POLICY "Block anonymous access to tasks" ON "public"."tasks" AS RESTRICTIVE TO "anon" USING (false);

ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."tasks" TO "anon";

GRANT ALL ON TABLE "public"."tasks" TO "authenticated";

GRANT ALL ON TABLE "public"."tasks" TO "service_role";
