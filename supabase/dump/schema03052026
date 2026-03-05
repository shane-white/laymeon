


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "source" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size_bytes" integer NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "parsed_markdown" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['resume'::"text", 'cover_letter'::"text"]))),
    CONSTRAINT "documents_source_check" CHECK (("source" = ANY (ARRAY['uploaded'::"text", 'generated'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "url" "text",
    "extracted_job_title" "text",
    "extracted_company_name" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "description" "text"
);


ALTER TABLE "public"."job_listings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."job_listings"."url" IS 'url of provided job desc';



COMMENT ON COLUMN "public"."job_listings"."extracted_job_title" IS 'Job title extracted from document at url';



CREATE TABLE IF NOT EXISTS "public"."user_job_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "user_id" "uuid",
    "job_listing_id" "uuid",
    "status" "text" DEFAULT 'interested'::"text" NOT NULL,
    "custom_job_title" "text",
    "custom_job_company" "text",
    "match_analysis" "text",
    "resume_suggestions" "text",
    "notes" "text",
    "cover_letter_suggestions" "text",
    "interview_suggestions" "text",
    CONSTRAINT "user_job_listings_status_check" CHECK (("status" = ANY (ARRAY['interested'::"text", 'applied'::"text", 'interviewing'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."user_job_listings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_job_listings"."user_id" IS 'The user who own this user job listing';



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_listings"
    ADD CONSTRAINT "job_listing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_job_listings"
    ADD CONSTRAINT "user_job_listings_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "idx_documents_unique_slot" ON "public"."documents" USING "btree" ("user_id", "document_type", "source") WHERE (("deleted_at" IS NULL) AND ("source" = 'uploaded'::"text"));



CREATE INDEX "idx_documents_user_id" ON "public"."documents" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_job_listings"
    ADD CONSTRAINT "user_job_listings_job_listing_id_fkey" FOREIGN KEY ("job_listing_id") REFERENCES "public"."job_listings"("id");



ALTER TABLE ONLY "public"."user_job_listings"
    ADD CONSTRAINT "user_job_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



CREATE POLICY "Enable insert for authenticated users only" ON "public"."job_listings" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for users based on user_id" ON "public"."user_job_listings" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Enable read access for all users" ON "public"."job_listings" FOR SELECT USING (true);



CREATE POLICY "Enable users to view their own data only" ON "public"."user_job_listings" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own documents" ON "public"."documents" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own documents" ON "public"."documents" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own documents" ON "public"."documents" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own fields" ON "public"."user_job_listings" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own documents" ON "public"."documents" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_job_listings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";








































































































































































GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."job_listings" TO "anon";
GRANT ALL ON TABLE "public"."job_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."job_listings" TO "service_role";



GRANT ALL ON TABLE "public"."user_job_listings" TO "anon";
GRANT ALL ON TABLE "public"."user_job_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_job_listings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































