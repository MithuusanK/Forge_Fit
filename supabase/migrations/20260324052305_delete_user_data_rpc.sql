-- RPC function: delete all data for a given auth user in one transaction
CREATE OR REPLACE FUNCTION public.delete_user_data(target_auth_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  internal_id uuid;
BEGIN
  -- Resolve internal user ID
  SELECT id INTO internal_id FROM users WHERE auth_id = target_auth_id;

  IF internal_id IS NULL THEN
    RETURN;
  END IF;

  -- Delete children first
  DELETE FROM food_items WHERE food_log_id IN (
    SELECT id FROM food_logs WHERE user_id = internal_id
  );
  DELETE FROM food_logs WHERE user_id = internal_id;
  DELETE FROM bio_profile WHERE user_id = internal_id;
  DELETE FROM water_logs WHERE user_id = internal_id;
  DELETE FROM workout_sessions WHERE user_id = internal_id;
  DELETE FROM progress_photos WHERE user_id = internal_id;

  -- Delete the user row last
  DELETE FROM users WHERE id = internal_id;
END;
$$;
