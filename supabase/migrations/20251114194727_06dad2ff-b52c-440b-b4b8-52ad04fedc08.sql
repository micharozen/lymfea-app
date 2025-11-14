-- Ensure admins table has strict RLS policies
-- Drop existing policies to recreate them with stricter settings
DROP POLICY IF EXISTS "Admins can view all admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can create admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can update admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can delete admins" ON public.admins;

-- Recreate SELECT policy - only authenticated admins can view
CREATE POLICY "Admins can view all admins"
  ON public.admins
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Recreate INSERT policy - only authenticated admins can create
CREATE POLICY "Admins can create admins"
  ON public.admins
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Recreate UPDATE policy - only authenticated admins can update
CREATE POLICY "Admins can update admins"
  ON public.admins
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Recreate DELETE policy - only authenticated admins can delete
CREATE POLICY "Admins can delete admins"
  ON public.admins
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Apply same strict policies to concierges table
DROP POLICY IF EXISTS "Admins can view all concierges" ON public.concierges;
DROP POLICY IF EXISTS "Admins can create concierges" ON public.concierges;
DROP POLICY IF EXISTS "Admins can update concierges" ON public.concierges;
DROP POLICY IF EXISTS "Admins can delete concierges" ON public.concierges;

CREATE POLICY "Admins can view all concierges"
  ON public.concierges
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create concierges"
  ON public.concierges
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update concierges"
  ON public.concierges
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete concierges"
  ON public.concierges
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));