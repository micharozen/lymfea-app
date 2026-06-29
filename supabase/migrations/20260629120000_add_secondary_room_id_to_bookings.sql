-- Salle secondaire optionnelle pour un booking Duo.
-- Un Duo (guest_count > 1) est une seule ligne `bookings` avec une seule `room_id`.
-- Quand les 2 soins parallèles ne tiennent pas dans la même salle, l'admin peut
-- attribuer une 2e salle au même booking via `secondary_room_id`.
-- Périmètre : modal admin uniquement. L'auto-assign serveur (reserve_trunk_atomically)
-- et le flux client restent mono-salle (cette colonne reste NULL pour eux).

ALTER TABLE "public"."bookings"
  ADD COLUMN IF NOT EXISTS "secondary_room_id" "uuid" REFERENCES "public"."treatment_rooms"("id");

COMMENT ON COLUMN "public"."bookings"."secondary_room_id" IS 'Salle secondaire optionnelle pour un booking Duo dont les 2 soins parallèles ne tiennent pas dans une seule salle. NULL = salle unique (room_id).';
