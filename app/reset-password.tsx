import { Palette, Radii, Spacing } from "@/constants/theme";
import { supabase } from "@/constants/supabase";
import { useAuth } from "@/hooks/useAuth";
import { isValidPassword } from "@/utils/signupValidation";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ScreenState = "waiting" | "form" | "loading" | "success" | "error" | "invalid";

export default function ResetPasswordScreen() {
  const { isPasswordRecovery, clearPasswordRecovery } = useAuth();
  // If _layout navigated here because of a PASSWORD_RECOVERY event, the session
  // is already set — skip the waiting/token-exchange step and show the form directly.
  const [screenState, setScreenState] = useState<ScreenState>(
    isPasswordRecovery ? "form" : "waiting"
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const recoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let subscriptionCleanup: (() => void) | null = null;

    // Listen for PASSWORD_RECOVERY event — fired after we call setSession below.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current);
        setScreenState("form");
      }
    });
    subscriptionCleanup = () => subscription.unsubscribe();

    // On native, Supabase does not auto-parse URL tokens (detectSessionInUrl: false).
    // We must manually extract the token from the deep link and call setSession,
    // which will fire the PASSWORD_RECOVERY event in the listener above.
    async function processDeepLink(url: string | null) {
      if (!url) return;

      // The token is in the URL fragment (after #), e.g.:
      // app2026://reset-password#access_token=xxx&refresh_token=yyy&type=recovery
      const hashIndex = url.indexOf("#");
      if (hashIndex === -1) return;

      const fragment = url.slice(hashIndex + 1);
      const params = new URLSearchParams(fragment);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (type !== "recovery" || !accessToken || !refreshToken) return;

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        // Token was invalid or expired
        setScreenState((prev) => {
          if (prev === "waiting") {
            successTimeoutRef.current = setTimeout(() => router.replace("/(tabs)"), 500);
            return "invalid";
          }
          return prev;
        });
      } else {
        // Session is valid — show the form immediately without waiting for
        // onAuthStateChange to fire, which saves an extra async round-trip.
        if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current);
        setScreenState("form");
      }
    }

    // Get the URL that opened the app (cold launch)
    Linking.getInitialURL().then(processDeepLink);

    // Also listen for URL events while app is already open (warm launch)
    const linkingSub = Linking.addEventListener("url", ({ url }) => processDeepLink(url));

    // Fallback timeout — if after 3 seconds we still haven't got a valid token,
    // redirect back to the app rather than leaving the user on a blank screen.
    recoveryTimeoutRef.current = setTimeout(() => {
      setScreenState((prev) => {
        if (prev === "waiting") {
          router.replace("/(tabs)");
          return "invalid";
        }
        return prev;
      });
    }, 3_000);

    return () => {
      subscriptionCleanup?.();
      linkingSub.remove();
      if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  async function handleUpdatePassword() {
    setErrorText(null);

    if (!password || !confirmPassword) {
      setErrorText("Please fill in both password fields");
      return;
    }
    if (password !== confirmPassword) {
      setErrorText("Passwords do not match");
      return;
    }
    if (!isValidPassword(password)) {
      setErrorText(
        "Password must be at least 8 characters and include at least one special character"
      );
      return;
    }

    setScreenState("loading");
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setScreenState("error");
      setPassword("");
      setConfirmPassword("");
      setErrorText(error.message || "Failed to update password. Please request a new reset link.");
      return;
    }

    setScreenState("success");
    clearPasswordRecovery();
    successTimeoutRef.current = setTimeout(() => router.replace("/(tabs)"), 1500);
  }

  if (screenState === "waiting") {
    return (
      <View style={styles.centered}>
        <Text style={styles.waitingText}>Verifying reset link…</Text>
      </View>
    );
  }

  if (screenState === "invalid") {
    return (
      <View style={styles.centered}>
        <Text style={styles.waitingText}>Invalid or expired reset link. Redirecting…</Text>
      </View>
    );
  }

  if (screenState === "success") {
    return (
      <View style={styles.centered}>
        <Text style={styles.successEmoji}>✅</Text>
        <Text style={styles.successText}>Password updated! Redirecting…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>🔐</Text>
            <Text style={styles.title}>Set New Password</Text>
            <Text style={styles.subtitle}>
              Choose a strong password for your account.
            </Text>
          </View>

          {errorText ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorText}</Text>
              {screenState === "error" ? (
                <Text style={styles.errorHint}>
                  The reset link may have expired. Return to sign in and request a new one.
                </Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.inputLabel}>New Password</Text>
          <TextInput
            placeholder="••••••••"
            placeholderTextColor={Palette.textMuted}
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
            autoFocus
          />

          <Text style={styles.inputLabel}>Confirm Password</Text>
          <TextInput
            placeholder="••••••••"
            placeholderTextColor={Palette.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.input}
            secureTextEntry
          />

          {password.length > 0 && !isValidPassword(password) ? (
            <Text style={styles.passwordHint}>
              Must be at least 8 characters and include a special character.
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              screenState === "loading" && { opacity: 0.6 },
            ]}
            onPress={handleUpdatePassword}
            disabled={screenState === "loading"}
          >
            <Text style={styles.primaryBtnText}>
              {screenState === "loading" ? "Updating…" : "Update Password"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: Palette.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  waitingText: {
    color: Palette.textSecondary,
    fontSize: 16,
  },
  successEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  successText: {
    color: Palette.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Palette.bg,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: Palette.bgElevated,
    borderRadius: Radii.xl,
    padding: Spacing["3xl"],
    borderWidth: 1,
    borderColor: Palette.border,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  headerEmoji: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: Palette.textPrimary,
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: Palette.textSecondary,
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: Palette.errorMuted,
    borderRadius: Radii.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: Palette.error,
    fontSize: 13,
    fontWeight: "500",
  },
  errorHint: {
    color: Palette.textSecondary,
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Palette.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Palette.bgInput,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    padding: 14,
    fontSize: 16,
    color: Palette.textPrimary,
  },
  passwordHint: {
    color: Palette.textSecondary,
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  primaryBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radii.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  primaryBtnText: {
    color: Palette.white,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
