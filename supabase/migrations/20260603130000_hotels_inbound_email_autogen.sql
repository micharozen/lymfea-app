-- Auto-fill hotels.inbound_email_alias / inbound_email_domain on insert when
-- omitted. The previous migration (20260603120000_email_to_booking.sql) added
-- those columns as NOT NULL and backfilled existing rows, but left no path for
-- new inserts (seed.sql, admin venue wizard, tests) to populate them — every
-- new hotel insert failed with 23502.

CREATE OR REPLACE FUNCTION public.hotels_fill_inbound_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_alias text;
  candidate text;
  suffix int := 1;
BEGIN
  IF NEW.inbound_email_domain IS NULL OR NEW.inbound_email_domain = '' THEN
    NEW.inbound_email_domain := 'booking.eia.fr';
  END IF;

  IF NEW.inbound_email_alias IS NULL OR NEW.inbound_email_alias = '' THEN
    base_alias := NULLIF(public.slugify(NEW.name), '');
    IF base_alias IS NULL THEN
      base_alias := 'venue-' || LEFT(NEW.id, 8);
    END IF;

    candidate := base_alias;
    WHILE EXISTS (
      SELECT 1 FROM public.hotels
      WHERE inbound_email_alias = candidate
        AND inbound_email_domain = NEW.inbound_email_domain
        AND id <> NEW.id
    ) LOOP
      suffix := suffix + 1;
      candidate := base_alias || '-' || suffix;
    END LOOP;

    NEW.inbound_email_alias := candidate;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotels_fill_inbound_email ON public.hotels;
CREATE TRIGGER hotels_fill_inbound_email
  BEFORE INSERT ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION public.hotels_fill_inbound_email();
