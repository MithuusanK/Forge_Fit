/**
 * Supabase Edge Function: delete-account
 *
 * Permanently deletes the authenticated user's account and all associated data.
 *
 * Strategy:
 *   1. Verify the caller's JWT
 *   2. Call the delete_user_data() RPC (single DB transaction — fast)
 *   3. Delete the auth user via GoTrue REST API (with timeout)
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

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    // ── Verify JWT ──
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }

    const authUserId = user.id;
    console.log(`[delete-account] start auth_id=${authUserId}`);

    // ── Step 1: Delete all user data via single RPC call ──
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error: rpcError } = await admin.rpc("delete_user_data", {
      target_auth_id: authUserId,
    });

    if (rpcError) {
      console.error(`[delete-account] RPC error: ${rpcError.message}`);
      return jsonResponse({ error: "Failed to delete user data: " + rpcError.message }, 500);
    }
    console.log(`[delete-account] user data deleted`);

    // ── Step 2: Delete auth user via GoTrue REST API (with timeout) ──
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${authUserId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.text();
        console.error(`[delete-account] GoTrue delete failed: ${res.status} ${body}`);
        // Data is already gone — treat as success so user gets signed out.
        // The orphaned auth record can't log in without a matching users row.
      } else {
        console.log(`[delete-account] auth user deleted`);
      }
    } catch (fetchErr: any) {
      clearTimeout(timer);
      console.error(`[delete-account] GoTrue fetch error: ${fetchErr.message}`);
      // Data is already gone — still treat as success.
    }

    console.log(`[delete-account] done`);
    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("[delete-account] unexpected:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
