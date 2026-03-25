import { supabase } from "@/constants/supabase";
import { clearQueryCache } from "@/services/db";
import { clearCachedUserId, resolveAndCacheUserId } from "@/services/userCache";
import { log } from "@/utils/log";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthError, AuthSession, AuthUser } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";

const LAST_ACTIVE_AT_KEY = "@auth_last_active_at";
// 30 days is a common inactivity timeout for consumer mobile apps.
const INACTIVITY_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

/** Result returned by signUp / signIn. */
type AuthResult = {
  data: { user: AuthUser | null; session: AuthSession | null } | null;
  error: AuthError | { message: string } | null;
};

export type SignUpBioData = {
  age: number;
  weight: number;
  height: number; // total inches
  sex: string;
  goal: string;
  activity_level?: string;
  workout_style?: string;
  workouts_per_week?: number | null;
  calorie_goal?: number | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  session: AuthSession | null;
  /** True once the initial session check has completed (even if no user). */
  authReady: boolean;
  /** Cached internal user ID from the `users` table (null until resolved) */
  internalUserId: string | null;
  /** True when a PASSWORD_RECOVERY event has been received — signals that the
   *  user tapped a password-reset link and must be routed to the reset screen. */
  isPasswordRecovery: boolean;
  /** Called by reset-password screen after password is successfully updated. */
  clearPasswordRecovery: () => void;
  signUp: (
    email: string,
    password: string,
    firstname: string,
    lastname: string,
    bioData?: SignUpBioData,
  ) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);

  async function markActiveNow() {
    try {
      await AsyncStorage.setItem(LAST_ACTIVE_AT_KEY, String(Date.now()));
    } catch {
      // Best-effort only; auth still functions if this write fails.
    }
  }

  async function clearInactivityMarker() {
    try {
      await AsyncStorage.removeItem(LAST_ACTIVE_AT_KEY);
    } catch {
      // Best-effort cleanup.
    }
  }

  async function enforceInactivityTimeoutIfNeeded(
    currentSession: AuthSession | null,
  ): Promise<boolean> {
    if (!currentSession?.user) return false;

    try {
      const now = Date.now();
      const lastActiveRaw = await AsyncStorage.getItem(LAST_ACTIVE_AT_KEY);
      const lastActive = Number(lastActiveRaw);

      if (!lastActiveRaw || Number.isNaN(lastActive)) {
        await markActiveNow();
        return false;
      }

      if (now - lastActive > INACTIVITY_TIMEOUT_MS) {
        clearCachedUserId();
        clearQueryCache();
        setInternalUserId(null);
        await supabase.auth.signOut();
        await clearInactivityMarker();
        return true;
      }

      await markActiveNow();
      return false;
    } catch (e) {
      log.warn("Auth", "Inactivity timeout check failed: " + String(e));
      return false;
    }
  }

  useEffect(() => {
    let mounted = true;
    log.time("auth:hydration");

    async function init() {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        if (!mounted) return;

        const expiredForInactivity =
          await enforceInactivityTimeoutIfNeeded(currentSession);
        if (expiredForInactivity) {
          setSession(null);
          setUser(null);
          return;
        }

        setSession(currentSession);
        const authUser = currentSession?.user ?? null;
        setUser(authUser);
        if (authUser?.id) {
          try {
            const id = await resolveAndCacheUserId(authUser.id);
            if (mounted) setInternalUserId(id);
            await markActiveNow();
          } catch (e) {
            log.warn(
              "Auth",
              "Failed to resolve internal user ID during init: " + String(e),
            );
          }
        }
      } catch (e) {
        log.error("Auth", "getSession failed: " + String(e));
      } finally {
        if (mounted) {
          setAuthReady(true);
          log.timeEnd("auth:hydration");
        }
      }
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        log.info("Auth", `onAuthStateChange: ${_event}`);
        // PASSWORD_RECOVERY: set session so updateUser works, flag recovery state
        // so _layout.tsx can navigate to the reset screen. Skip normal session
        // side-effects (weight/water prompts, internalUserId resolution).
        if (_event === "PASSWORD_RECOVERY") {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          setIsPasswordRecovery(true);
          return;
        }
        // USER_UPDATED: password or email changed. The auth user ID is unchanged
        // so there is no need to re-resolve the internal user ID — skip the DB
        // call entirely to prevent a hanging query when signOut() is called
        // immediately after a password change.
        if (_event === "USER_UPDATED") {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          await markActiveNow();
          return;
        }
        setSession(newSession);
        const authUser = newSession?.user ?? null;
        setUser(authUser);
        if (authUser?.id) {
          try {
            const id = await resolveAndCacheUserId(authUser.id);
            setInternalUserId(id);
            await markActiveNow();
          } catch (e) {
            log.warn(
              "Auth",
              "Failed to resolve internal user ID: " + String(e),
            );
          }
        } else {
          clearCachedUserId();
          setInternalUserId(null);
          await clearInactivityMarker();
        }
      },
    );

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && user) {
        void markActiveNow();
      }
    });

    return () => {
      sub.remove();
    };
  }, [user]);

  async function signUp(
    email: string,
    password: string,
    firstname: string,
    lastname: string,
    bioData?: SignUpBioData,
  ): Promise<AuthResult> {
    try {
      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: undefined },
      });

      if (authError) {
        const errorMessage = authError.message?.toLowerCase() ?? "";
        const looksLikeDuplicateEmail =
          errorMessage.includes("already") ||
          errorMessage.includes("registered") ||
          errorMessage.includes("exists") ||
          authError.status === 422;

        if (looksLikeDuplicateEmail) {
          return {
            data: authData,
            error: {
              message:
                "This email is already associated with an account. Please sign in instead.",
            },
          };
        }

        return { data: authData, error: authError };
      }

      // Supabase can return a user with empty identities for existing emails
      // when email confirmation is enabled (anti-enumeration behavior).
      const signupIdentities = (authData.user as any)?.identities;
      const looksLikeExistingEmailResponse =
        Array.isArray(signupIdentities) && signupIdentities.length === 0;

      if (looksLikeExistingEmailResponse) {
        return {
          data: authData,
          error: {
            message:
              "This email is already associated with an account. Please sign in instead.",
          },
        };
      }

      const authUserId = authData.user?.id;
      if (!authUserId) {
        return {
          data: authData,
          error: { message: "No user ID returned from signup." },
        };
      }

      // Step 2: Upsert the users row.
      // This is safe regardless of whether a DB trigger has already created the
      // row — upsert will update if the row exists or insert if it doesn't,
      // eliminating the old 1-second setTimeout race condition.
      const { data: userData, error: upsertError } = await supabase
        .from("users")
        .upsert(
          { auth_id: authUserId, firstname, lastname },
          { onConflict: "auth_id" },
        )
        .select("id")
        .single();

      if (upsertError) {
        const upsertMessage = upsertError.message?.toLowerCase() ?? "";
        const isDuplicateLike =
          upsertMessage.includes("users_auth_id_fkey") ||
          upsertMessage.includes("foreign key constraint");

        return {
          data: authData,
          error: {
            message: isDuplicateLike
              ? "This email is already associated with an account. Please sign in instead."
              : "Could not complete signup. Please try again.",
          },
        };
      }

      // Step 3: Save bio + questionnaire data if provided and we have the internal user ID.
      if (bioData && userData?.id) {
        const { error: bioError } = await supabase.from("bio_profile").upsert(
          {
            user_id: userData.id,
            age: bioData.age,
            weight: bioData.weight,
            weight_unit: "lbs",
            height: bioData.height,
            height_unit: "inches",
            sex: bioData.sex,
            goal: bioData.goal,
            activity_level: bioData.activity_level ?? null,
            workout_style: bioData.workout_style ?? null,
            workouts_per_week: bioData.workouts_per_week ?? null,
            calorie_goal: bioData.calorie_goal ?? null,
          },
          { onConflict: "user_id" },
        );

        if (bioError) {
          return {
            data: authData,
            error: {
              message:
                "Account was created, but we could not save your questionnaire and profile data. Please sign in and complete your profile.",
            },
          };
        }
      }

      return { data: authData, error: null };
    } catch (error) {
      console.error("Signup error:", error);
      return {
        data: null,
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      };
    }
  }

  async function signIn(email: string, password: string): Promise<AuthResult> {
    return await supabase.auth.signInWithPassword({ email, password });
  }

  async function resetPassword(email: string): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "app2026://reset-password",
    });
    return { error };
  }

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false);
  }

  async function signOut() {
    clearCachedUserId();
    clearQueryCache();
    setInternalUserId(null);
    setIsPasswordRecovery(false);
    await supabase.auth.signOut({ scope: "local" });
    await clearInactivityMarker();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        authReady,
        internalUserId,
        isPasswordRecovery,
        clearPasswordRecovery,
        signUp,
        signIn,
        signOut,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
