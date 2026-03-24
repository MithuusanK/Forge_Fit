/**
 * Supabase Edge Function: delete-account
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * Requires a valid JWT (the user must be signed in).
 * Uses the service role key to call the Supabase Admin API for auth user deletion.
 *
 * Cascaded deletes are handled by the database foreign key constraints on:
 *   bio_profile, food_logs, food_items, workout tables, water_logs, etc.
 *
 * Request: POST (no body required — identity comes from the Authorization header)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: missing Supabase environment variables" }),
        {
          status: 500,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    // Verify the user's JWT and get their auth ID
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Use admin client (service role) for privileged operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Look up internal user ID for cascade cleanup
    const { data: userData, error: userLookupError } = await adminClient
      .from("users")
      .select("id")
      .eq("auth_id", user.id)
      .single();

    if (userLookupError || !userData) {
      console.error("[delete-account] user lookup failed:", userLookupError?.message);
      // Still attempt auth deletion even if profile row is missing
    }

    // Delete all user data from application tables.
    // Most tables have ON DELETE CASCADE from the users table,
    // but we explicitly clean up here as a safety net.
    if (userData?.id) {
      const internalId = userData.id;

      // Delete bio_profile
      await adminClient.from("bio_profile").delete().eq("user_id", internalId);

      // Delete food_items via food_logs
      const { data: foodLogs } = await adminClient
        .from("food_logs")
        .select("id")
        .eq("user_id", internalId);
      if (foodLogs && foodLogs.length > 0) {
        const logIds = foodLogs.map((l: any) => l.id);
        await adminClient.from("food_items").delete().in("food_log_id", logIds);
      }
      await adminClient.from("food_logs").delete().eq("user_id", internalId);

      // Delete water logs
      await adminClient.from("water_logs").delete().eq("user_id", internalId);

      // Delete workout data
      await adminClient.from("workout_sets").delete().eq("user_id", internalId);
      await adminClient.from("workout_logs").delete().eq("user_id", internalId);

      // Delete progress photos
      await adminClient.from("progress_photos").delete().eq("user_id", internalId);

      // Delete the users row (auth row deleted next)
      await adminClient.from("users").delete().eq("id", internalId);
    }

    // Delete the Supabase Auth user (permanent, irreversible)
    // Explicitly request hard-delete (not soft-delete) to permanently remove
    // the auth account so it can no longer sign in.
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(
      user.id,
      false,
    );

    if (deleteAuthError) {
      console.error("[delete-account] auth.admin.deleteUser failed:", deleteAuthError.message);
      return new Response(
        JSON.stringify({ error: "Failed to delete account: " + deleteAuthError.message }),
        {
          status: 500,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[delete-account] unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
