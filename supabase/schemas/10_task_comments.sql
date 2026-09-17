CREATE TABLE IF NOT EXISTS "public"."task_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "parent_comment_id" "uuid",
    "author_user_id" "uuid",
    "content" "text" NOT NULL,
    "mentioned_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_task_comments_content" CHECK (("char_length"("btrim"("content")) > 0))
);

ALTER TABLE "public"."task_comments" OWNER TO "postgres";

COMMENT ON TABLE "public"."task_comments" IS 'Fil de discussion interne d''une tâche. Réservé au staff admin : aucun contenu n''est exposé au client, contrairement à channel_messages.';

COMMENT ON COLUMN "public"."task_comments"."organization_id" IS 'Dupliqué depuis la tâche pour que la RLS reste un prédicat hoistable (aucune fonction prenant l''id de la ligne).';

COMMENT ON COLUMN "public"."task_comments"."parent_comment_id" IS 'NULL = commentaire racine. Sinon, réponse directe à une racine — un trigger interdit de répondre à une réponse.';

COMMENT ON COLUMN "public"."task_comments"."author_user_id" IS 'Auteur. Passe à NULL si le compte est supprimé : le commentaire reste dans le fil, affiché sans nom.';

COMMENT ON COLUMN "public"."task_comments"."content" IS 'Corps du message, en texte lisible. Les mentions s''y écrivent « @Prénom Nom » et sont mises en évidence à l''affichage par parseMentions().';

COMMENT ON COLUMN "public"."task_comments"."mentioned_user_ids" IS 'Destinataires résolus à l''écriture — source de vérité des notifications, le texte n''étant pas réanalysé ensuite. Pas de FK : un compte supprimé laisse un id orphelin, ignoré.';

ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_task_comments_task" ON "public"."task_comments" USING "btree" ("task_id", "created_at");

CREATE INDEX "idx_task_comments_parent" ON "public"."task_comments" USING "btree" ("parent_comment_id") WHERE ("parent_comment_id" IS NOT NULL);

CREATE INDEX "idx_task_comments_organization" ON "public"."task_comments" USING "btree" ("organization_id");

ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."task_comments"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE TRIGGER "trg_task_comments_check_parent" BEFORE INSERT OR UPDATE OF "parent_comment_id", "task_id" ON "public"."task_comments" FOR EACH ROW EXECUTE FUNCTION "public"."task_comments_check_parent"();

CREATE TRIGGER "update_task_comments_updated_at" BEFORE UPDATE ON "public"."task_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE POLICY "Block anonymous access to task comments" ON "public"."task_comments" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Admins read task comments in their org" ON "public"."task_comments" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"())))));

CREATE POLICY "Admins write task comments in their org" ON "public"."task_comments" FOR INSERT TO "authenticated" WITH CHECK ((("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("author_user_id" = "auth"."uid"())) AND ("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"())))));

CREATE POLICY "Authors update their task comments" ON "public"."task_comments" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("author_user_id" = "auth"."uid"()))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("author_user_id" = "auth"."uid"())));

CREATE POLICY "Authors or super admins delete task comments" ON "public"."task_comments" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (("author_user_id" = "auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"()))));

ALTER TABLE "public"."task_comments" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."task_comments" TO "anon";

GRANT ALL ON TABLE "public"."task_comments" TO "authenticated";

GRANT ALL ON TABLE "public"."task_comments" TO "service_role";
