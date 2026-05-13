-- Enable Supabase Realtime broadcast for the notifications table so the
-- admin bell badge and /admin/schedule-alerts list update without a refresh.
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.notifications;
