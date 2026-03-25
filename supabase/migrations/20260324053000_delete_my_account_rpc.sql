-- Complete account deletion in a single DB call.
-- Uses auth.uid() so callers can only delete their own account.
-- SECURITY DEFINER runs as postgres, which can delete from auth.users.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_auth_id uuid := auth.uid();
  internal_id uuid;
BEGIN
  IF current_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve internal user ID
  SELECT id INTO internal_id FROM users WHERE auth_id = current_auth_id;

  IF internal_id IS NOT NULL THEN
    -- Delete children first
    DELETE FROM food_items WHERE food_log_id IN (
      SELECT id FROM food_logs WHERE user_id = internal_id
    );
    DELETE FROM food_logs WHERE user_id = internal_id;
    DELETE FROM bio_profile WHERE user_id = internal_id;
    DELETE FROM water_logs WHERE user_id = internal_id;
    DELETE FROM workout_sessions WHERE user_id = internal_id;
    DELETE FROM progress_photos WHERE user_id = internal_id;

    -- Delete the internal user row
    DELETE FROM users WHERE id = internal_id;
  END IF;

  -- Delete the auth user (postgres role has access to auth schema)
  DELETE FROM auth.users WHERE id = current_auth_id;
END;
$$;
