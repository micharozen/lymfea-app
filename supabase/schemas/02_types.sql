CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'moderator',
    'user',
    'concierge',
    'therapist'
);

ALTER TYPE "public"."app_role" OWNER TO "postgres";

CREATE TYPE "public"."schedule_type" AS ENUM (
    'always_open',
    'specific_days',
    'one_time'
);

ALTER TYPE "public"."schedule_type" OWNER TO "postgres";
