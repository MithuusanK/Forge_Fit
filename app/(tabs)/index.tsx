import DailyWeightPrompt from "@/components/DailyWeightPrompt";
import { DashboardSkeleton } from "@/components/SkeletonLoader";
import { supabase } from "@/constants/supabase";
import { DarkPalette, Radii, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { useLoadingGuard } from "@/hooks/useLoadingGuard";
import { useSteps } from "@/hooks/useSteps";
import { useTheme } from "@/hooks/useTheme";
import { getCurrentUserBioProfile } from "@/services/bioProfile";
import { getDailySummary } from "@/services/foodRecognition";
import {
    DAILY_WATER_GOAL,
    getTodayWaterIntake,
    logWaterGlass,
    removeWaterGlass,
} from "@/services/waterTracking";
import { hasLoggedWeightToday } from "@/services/weightTracking";
import {
    getTodayWorkouts,
    getWeeklyWorkoutStats,
} from "@/services/workoutTracking";
import { log } from "@/utils/log";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    AppState,
    AppStateStatus,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
    Circle,
    Defs,
    Stop,
    LinearGradient as SvgGradient,
} from "react-native-svg";

// ── Motivational quotes ─────────────────────────────────────
const QUOTES = [
  "The only bad workout is the one that didn't happen.",
  "Your body can stand almost anything. It's your mind you have to convince.",
  "Strive for progress, not perfection.",
  "The pain you feel today will be the strength you feel tomorrow.",
  "Champions are made when nobody is watching.",
  "Discipline is choosing between what you want now and what you want most.",
  "You don't have to be extreme, just consistent.",
  "Success isn't always about greatness. It's about consistency.",
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTodayFormatted(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// ── Animated Progress Ring ──────────────────────────────────
function ProgressRing({
  progress = 0,
  size = 160,
  strokeWidth = 12,
}: {
  progress?: number;
  size?: number;
  strokeWidth?: number;
}) {
  const { palette: Palette } = useTheme();
  const ringStyles = useMemo(() => makeRingStyles(Palette), [Palette]);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <View style={ringStyles.container}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={Palette.gradientStart} />
            <Stop offset="100%" stopColor={Palette.gradientEnd} />
          </SvgGradient>
        </Defs>
        {/* Background track */}
        <Circle
          stroke={Palette.border}
          fill="none"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <Circle
          stroke="url(#ringGrad)"
          fill="none"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(progress, 1))}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>

      <View style={ringStyles.inner}>
        <Text style={ringStyles.pct}>{Math.round(progress * 100)}%</Text>
        <Text style={ringStyles.label}>daily goal</Text>
      </View>
    </View>
  );
}

function makeRingStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    container: { justifyContent: "center", alignItems: "center" },
    inner: {
      position: "absolute",
      alignItems: "center",
    },
    pct: {
      fontSize: 32,
      fontWeight: "800",
      color: P.textPrimary,
      letterSpacing: -1,
    },
    label: {
      fontSize: 12,
      color: P.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginTop: 2,
    },
  });
}

// ── Quick-Action Card ───────────────────────────────────────
function QuickAction({
  icon,
  label,
  value,
  sub,
  accentColor = DarkPalette.accent,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accentColor?: string;
  onPress?: () => void;
}) {
  const { palette: Palette } = useTheme();
  const qaStyles = useMemo(() => makeQaStyles(Palette), [Palette]);
  return (
    <Pressable
      style={({ pressed }) => [
        qaStyles.card,
        { borderColor: accentColor + "25" },
        onPress && pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View
        style={[qaStyles.iconWrap, { backgroundColor: accentColor + "18" }]}
      >
        <Text style={qaStyles.icon}>{icon}</Text>
      </View>
      <Text style={qaStyles.value}>{value}</Text>
      <Text style={qaStyles.label}>{label}</Text>
      {sub ? <Text style={qaStyles.sub}>{sub}</Text> : null}
      {onPress && (
        <Text style={[qaStyles.sub, { color: accentColor, marginTop: 4 }]}>
          tap →
        </Text>
      )}
    </Pressable>
  );
}

function makeQaStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: P.bgCard,
      borderRadius: Radii.lg,
      padding: Spacing.lg,
      alignItems: "center",
      borderWidth: 1,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.sm,
    },
    icon: { fontSize: 22 },
    value: {
      fontSize: 22,
      fontWeight: "800",
      color: P.textPrimary,
      marginBottom: 2,
    },
    label: {
      fontSize: 11,
      fontWeight: "600",
      color: P.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    sub: {
      fontSize: 10,
      color: P.textMuted,
      marginTop: 2,
    },
  });
}

// ── Home Screen ─────────────────────────────────────────────
export default function HomeScreen() {
  const { user, authReady } = useAuth();
  const { palette: Palette } = useTheme();
  const styles = useMemo(() => makeHomeStyles(Palette), [Palette]);
  const steps = useSteps();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { timedOut } = useLoadingGuard("HomeScreen", loading, {
    timeoutMs: 20_000,
  });
  const [showWeightPrompt, setShowWeightPrompt] = useState(false);
  const [hasLoggedWeight, setHasLoggedWeight] = useState(false);
  const [bioProfile, setBioProfile] = useState<any | null>(null);
  const [weeklyStats, setWeeklyStats] = useState({
    workoutCount: 0,
    totalSets: 0,
    totalDuration: 0,
  });
  const [consumedCalories, setConsumedCalories] = useState(0);
  const [mealsLogged, setMealsLogged] = useState({
    breakfast: false,
    lunch: false,
    dinner: false,
  });
  const [hasWorkoutToday, setHasWorkoutToday] = useState(false);
  const [waterIntake, setWaterIntake] = useState(0);
  // track EST date string so we can detect day rollover in Eastern Time (US)
  const [estDate, setEstDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  );
  // track whether we've shown the congrats popup for the current EST day
  const [congratsShownDate, setCongratsShownDate] = useState<string | null>(
    null,
  );
  // Hydrate the congrats-shown date from AsyncStorage so the popup doesn't
  // re-fire every time the user logs in when they've already hit the goal.
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(`waterCongrats:${user.id}`)
      .then((stored) => {
        if (stored) setCongratsShownDate(stored);
      })
      .catch(() => {});
  }, [user?.id]);
  const [quote] = useState(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)],
  );
  const [firstname, setFirstname] = useState("");
  const [streakCount, setStreakCount] = useState<number>(0);
  const [consumedProtein, setConsumedProtein] = useState(0);
  const [consumedCarbs, setConsumedCarbs] = useState(0);
  const [consumedFat, setConsumedFat] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Fade in when loading resolves
  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [loading]);

  // ── Calorie / meal data loader (background — calls backend) ─
  async function loadCalorieData() {
    try {
      if (!authReady || !user) return;

      // During auth transitions, `user` can be set just before the access token
      // is fully available to edge-function calls. Skip this refresh until the
      // session is present.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const summary = await getDailySummary(
        new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
      );
      setConsumedCalories(summary?.total_calories ?? 0);
      setConsumedProtein(summary?.total_protein ?? 0);
      setConsumedCarbs(summary?.total_carbs ?? 0);
      setConsumedFat(summary?.total_fat ?? 0);
      const meals = summary?.meals_by_type ?? {};
      setMealsLogged({
        breakfast: (meals.breakfast?.count ?? 0) > 0,
        lunch: (meals.lunch?.count ?? 0) > 0,
        dinner: (meals.dinner?.count ?? 0) > 0,
      });
    } catch {
      // backend unavailable — leave calories at 0, non-fatal
    }
  }

  // ── Fast Supabase-only data loader ────────────────────────
  // getDailySummary (backend HTTP call) is intentionally excluded here and
  // fired separately in the background so it never delays the initial render.
  async function loadAllData(isInitial = false) {
    if (!user || !authReady) return;
    if (isInitial) setLoading(true);
    setLoadError(null);
    log.time("home:loadAllData");

    try {
      // ensure estDate is current when loading initially
      const currentEst = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      });
      if (isInitial) setEstDate(currentEst);
      // Fire Supabase requests in parallel (these are all local-cache or direct DB
      // calls — they resolve in ~200-500 ms even on a slow connection).
      // Login streak update runs concurrently — no reason to block data fetch.
      const withTimeout = (p: Promise<any>, ms = 8000): Promise<any> =>
        Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

      const [
        nameResult,
        bioResult,
        statsResult,
        weightResult,
        workoutsResult,
        waterResult,
      ] = await Promise.allSettled([
        withTimeout(Promise.resolve(supabase
          .from("users")
          .select("firstname")
          .eq("auth_id", user.id)
          .single())),
        withTimeout(getCurrentUserBioProfile()),
        withTimeout(getWeeklyWorkoutStats()),
        withTimeout(hasLoggedWeightToday()),
        withTimeout(getTodayWorkouts()),
        withTimeout(getTodayWaterIntake()),
        // Login streak runs in parallel — non-blocking
        updateLoginStreak(currentEst).catch(() => {}),
      ]);
      // ensure we keep estDate in sync with today in EST
      setEstDate(
        new Date().toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        }),
      );
      // Apply all Supabase results (single render batch)
      if (
        nameResult.status === "fulfilled" &&
        nameResult.value.data?.firstname
      ) {
        setFirstname(nameResult.value.data.firstname);
      }

      if (
        bioResult.status === "fulfilled" &&
        bioResult.value.success &&
        bioResult.value.profile
      ) {
        setBioProfile(bioResult.value.profile);
      }

      if (statsResult.status === "fulfilled" && statsResult.value.success) {
        setWeeklyStats({
          workoutCount: statsResult.value.workoutCount || 0,
          totalSets: statsResult.value.totalSets || 0,
          totalDuration: statsResult.value.totalDuration || 0,
        });
      }

      if (weightResult.status === "fulfilled") {
        setHasLoggedWeight(weightResult.value);
      }

      if (workoutsResult.status === "fulfilled") {
        const wres = workoutsResult.value;
        const has = Array.isArray(wres?.data)
          ? wres.data.length > 0
          : !!(
              wres &&
              (wres as any).success &&
              (wres as any).data &&
              (wres as any).data.length > 0
            );
        setHasWorkoutToday(has);
      }

      if (waterResult.status === "fulfilled") {
        setWaterIntake(waterResult.value);
      }
    } catch (err) {
      log.error("HomeScreen", "loadAllData failed: " + String(err));
      setLoadError("Could not load dashboard data.");
    } finally {
      // Reveal the UI as soon as Supabase data is ready, then fetch
      // calorie data from the backend in the background without blocking.
      if (isInitial) setLoading(false);
      log.timeEnd("home:loadAllData");
      if (isInitial) loadCalorieData(); // on focus, useFocusEffect calls it directly
    }
  }

  // --- Streak helpers (persisted in AsyncStorage per-user) ----------------
  function getStreakKey() {
    return user ? `streak:${user.id}` : null;
  }

  function getYesterdayEst(dateStr?: string) {
    // Compute yesterday relative to the provided date (or today) in ET.
    const base = dateStr
      ? new Date(dateStr + "T12:00:00") // noon avoids DST edge cases
      : new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    base.setDate(base.getDate() - 1);
    return base.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  }

  async function updateLoginStreak(currentEstDate?: string) {
    if (!user) return;
    const key = getStreakKey();
    if (!key) return;
    const today =
      currentEstDate ??
      new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) {
        // first-time: start streak at 1
        const payload = { count: 1, last: today };
        await AsyncStorage.setItem(key, JSON.stringify(payload));
        setStreakCount(1);
        return;
      }

      const parsed = JSON.parse(raw || "{}");
      const last = parsed.last as string | undefined;
      const count = Number(parsed.count) || 0;

      if (last === today) {
        // already recorded today
        setStreakCount(count);
        return;
      }

      const yesterday = getYesterdayEst();
      if (last === yesterday) {
        // consecutive day: increment
        const next = count + 1 || 1;
        const payload = { count: next, last: today };
        await AsyncStorage.setItem(key, JSON.stringify(payload));
        setStreakCount(next);
      } else {
        // broke streak: reset to 1
        const payload = { count: 1, last: today };
        await AsyncStorage.setItem(key, JSON.stringify(payload));
        setStreakCount(1);
      }
    } catch (err) {
      // fallback: set zero or keep existing
      // don't crash the app for storage errors
    }
  }

  // ── Initial load when user signs in ───────────────────────
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setFirstname("");
      setBioProfile(null);
      setConsumedCalories(0);
      setMealsLogged({ breakfast: false, lunch: false, dinner: false });
      setHasWorkoutToday(false);
      setHasLoggedWeight(false);
      setWeeklyStats({ workoutCount: 0, totalSets: 0, totalDuration: 0 });
      setWaterIntake(0);
      setLoading(false);
      return;
    }
    loadAllData(true);
  }, [user, authReady]);

  // ── Refresh on screen focus ───────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadAllData(false);
        loadCalorieData(); // fire immediately — don't wait for loadAllData to finish
      }
    }, [user]),
  );

  // ── Refresh when app comes to foreground ──────────────────
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && user) {
        loadAllData(false);
      }
    };
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [user]);

  // ── Detect EST day rollover and reset water at midnight EST ─────────────────
  useEffect(() => {
    // check every minute whether the date in America/New_York changed
    const check = () => {
      const todayEst = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      });
      if (todayEst !== estDate) {
        // new EST day: reset water, calories, meals and refresh remote data
        setEstDate(todayEst);
        setWaterIntake(0);
        setConsumedCalories(0);
        setConsumedProtein(0);
        setConsumedCarbs(0);
        setConsumedFat(0);
        setMealsLogged({ breakfast: false, lunch: false, dinner: false });
        // allow the congrats popup to show again on the new day
        setCongratsShownDate(null);
        if (user)
          AsyncStorage.removeItem(`waterCongrats:${user.id}`).catch(() => {});
        if (user) loadAllData(false);
      }
    };

    const id = setInterval(check, 60_000);
    // also run once immediately in case interval delay would miss exact rollover
    check();
    return () => clearInterval(id);
  }, [estDate, user]);

  async function handleAddWater() {
    if (waterIntake >= DAILY_WATER_GOAL) {
      Alert.alert(
        "Goal reached",
        "You've already reached your daily water goal.",
      );
      return;
    }

    const updated = await logWaterGlass();
    setWaterIntake(Math.min(updated, DAILY_WATER_GOAL));
  }

  async function handleRemoveWater() {
    const updated = await removeWaterGlass();
    setWaterIntake(updated);
  }

  // show a one-time congrats popup when the user reaches the daily water goal
  useEffect(() => {
    if (
      typeof DAILY_WATER_GOAL === "number" &&
      waterIntake >= DAILY_WATER_GOAL &&
      estDate &&
      congratsShownDate !== estDate
    ) {
      Alert.alert(
        "Nice!",
        `You hit ${DAILY_WATER_GOAL}/${DAILY_WATER_GOAL} glasses today — great job!`,
        [{ text: "Awesome" }],
      );
      setCongratsShownDate(estDate);
      if (user) {
        AsyncStorage.setItem(`waterCongrats:${user.id}`, estDate).catch(
          () => {},
        );
      }
    }
  }, [waterIntake, estDate, congratsShownDate, user]);

  const displayName = firstname || "Athlete";

  const workoutsValue = String(weeklyStats.workoutCount ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      {loading && user && !timedOut ? (
        <DashboardSkeleton />
      ) : (timedOut || loadError) && user ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Text
            style={{
              color: Palette.textSecondary,
              fontSize: 15,
              marginBottom: 12,
              textAlign: "center",
            }}
          >
            {loadError || "Loading is taking too long."}
          </Text>
          <Pressable
            onPress={() => loadAllData(true)}
            style={{
              backgroundColor: Palette.accent,
              paddingHorizontal: 24,
              paddingVertical: 10,
              borderRadius: Radii.md,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <Animated.ScrollView
          style={[styles.scroll, { opacity: fadeAnim }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ─────────────────────────── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>
                {getGreeting()}, {displayName} 👋
              </Text>
              <Text style={styles.date}>{getTodayFormatted()}</Text>
            </View>
            <View style={styles.headerBadges}>
              {!hasLoggedWeight && user && (
                <Pressable
                  onPress={() => setShowWeightPrompt(true)}
                  style={({ pressed }) => [
                    styles.weightBadge,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.weightBadgeIcon}>⚖️</Text>
                </Pressable>
              )}
              <View style={styles.streakBadge}>
                <Text style={styles.streakIcon}>🔥</Text>
                <Text style={styles.streakCount}>{streakCount}</Text>
              </View>
            </View>
          </View>

          {/* ── Progress Ring ──────────────────── */}
          <View style={styles.ringSection}>
            {
              // compute composite progress from workout, meals, and weight
            }
            <ProgressRing
              progress={(() => {
                const WORKOUT_PCT = 0.2; // 20% (reduced 10% to give to Water)
                const WATER_PCT = 0.1; // 10% new for water
                const WEIGHT_PCT = 0.1; // 10%
                const BREAKFAST_PCT = 0.2; // 20%
                const LUNCH_PCT = 0.2; // 20%
                const DINNER_PCT = 0.2; // 20%

                let score = 0;
                if (hasWorkoutToday) score += WORKOUT_PCT;
                if (waterIntake >= DAILY_WATER_GOAL) score += WATER_PCT;
                if (hasLoggedWeight) score += WEIGHT_PCT;
                if (mealsLogged.breakfast) score += BREAKFAST_PCT;
                if (mealsLogged.lunch) score += LUNCH_PCT;
                if (mealsLogged.dinner) score += DINNER_PCT;

                return Math.min(score, 1);
              })()}
            />
            <Text style={styles.legendHeader}>Daily Tasks</Text>
            <View style={styles.legendGrid}>
              {(
                [
                  {
                    key: "workout",
                    icon: "🔥",
                    done: hasWorkoutToday,
                    label: "Workout",
                  },
                  {
                    key: "water",
                    icon: "💧",
                    done: waterIntake >= DAILY_WATER_GOAL,
                    label: "Water",
                  },
                  {
                    key: "breakfast",
                    icon: "🍳",
                    done: mealsLogged.breakfast,
                    label: "Breakfast",
                  },
                  {
                    key: "lunch",
                    icon: "🥗",
                    done: mealsLogged.lunch,
                    label: "Lunch",
                  },
                  {
                    key: "dinner",
                    icon: "🍽️",
                    done: mealsLogged.dinner,
                    label: "Dinner",
                  },
                  {
                    key: "weight",
                    icon: "⚖️",
                    done: hasLoggedWeight,
                    label: "Log Weight",
                  },
                ] as const
              ).map((it) => (
                <View
                  key={it.key}
                  style={[
                    styles.taskChip,
                    it.done ? styles.taskChipDone : styles.taskChipPending,
                  ]}
                >
                  <Text style={styles.taskChipIcon}>
                    {it.done ? "✓" : it.icon}
                  </Text>
                  <Text
                    style={[
                      styles.taskChipLabel,
                      {
                        color: it.done
                          ? Palette.success
                          : Palette.textSecondary,
                      },
                    ]}
                  >
                    {it.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Quick Stats ────────────────────── */}
          <View style={styles.statsRow}>
            <QuickAction
              icon="🏋️"
              label="Workouts"
              value={workoutsValue}
              sub="this week"
              accentColor={Palette.accent}
              onPress={() => router.push("/(tabs)/workout")}
            />
            <QuickAction
              icon="🔥"
              label="Calories"
              value={Math.round(consumedCalories).toString()}
              sub="eaten today"
              accentColor={Palette.warning}
              onPress={() => router.push("/(tabs)/explore")}
            />
            <QuickAction
              icon="👣"
              label="Steps"
              value={steps.todayStepsFormatted}
              sub="today"
              accentColor={Palette.success}
            />
          </View>

          {/* ── Water Intake Tracker ───────────── */}
          <View style={styles.goalCard}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalIcon}>💧</Text>
              <Text style={styles.goalTitle}>Water Intake</Text>
              <Text style={styles.waterCount}>
                {waterIntake}/{DAILY_WATER_GOAL} glasses
              </Text>
            </View>
            <View style={styles.waterRow}>
              {Array.from({ length: DAILY_WATER_GOAL }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.waterDrop,
                    i < waterIntake
                      ? styles.waterDropFilled
                      : styles.waterDropEmpty,
                  ]}
                >
                  <Text style={{ fontSize: 18 }}>
                    {i < waterIntake ? "💧" : "○"}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.goalProgress}>
              <View style={styles.goalBarTrack}>
                <View
                  style={[
                    styles.goalBarFill,
                    {
                      width: `${Math.min(waterIntake / DAILY_WATER_GOAL, 1) * 100}%`,
                      backgroundColor: "#38BDF8",
                    },
                  ]}
                />
              </View>
              <Text style={[styles.goalPct, { color: "#38BDF8" }]}>
                {Math.round(Math.min(waterIntake / DAILY_WATER_GOAL, 1) * 100)}%
              </Text>
            </View>
            <View style={styles.waterButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.waterBtnMinus,
                  pressed && { opacity: 0.7 },
                  waterIntake === 0 && { opacity: 0.3 },
                ]}
                onPress={handleRemoveWater}
                disabled={waterIntake === 0}
              >
                <Text style={styles.waterBtnText}>−</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.waterBtnPlus,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
                onPress={handleAddWater}
              >
                <Text style={styles.waterBtnPlusText}>+ Log Glass</Text>
              </Pressable>
            </View>
          </View>

          {/* ── Calories Remaining Card ─────────── */}
          <View style={styles.goalCard}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalIcon}>🍽️</Text>
              <Text style={styles.goalTitle}>Calories Left</Text>
            </View>
            {bioProfile?.calorie_goal ? (
              <>
                <Text style={styles.goalBody}>
                  {Math.max(
                    Math.round(
                      (bioProfile.calorie_goal ?? 0) - consumedCalories,
                    ),
                    0,
                  )}{" "}
                  cal left
                </Text>
                <View style={styles.goalProgress}>
                  <View style={styles.goalBarTrack}>
                    <View
                      style={[
                        styles.goalBarFill,
                        {
                          width: `${
                            Math.min(
                              (consumedCalories || 0) /
                                (bioProfile?.calorie_goal || 1),
                              1,
                            ) * 100
                          }%`,
                          backgroundColor: Palette.warning,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.goalPct}>
                    {bioProfile.calorie_goal
                      ? `${Math.round(
                          Math.min(
                            (consumedCalories / bioProfile.calorie_goal) * 100,
                            100,
                          ),
                        )}%`
                      : "—"}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    color: Palette.textMuted,
                    marginTop: Spacing.sm,
                  }}
                >
                  {Math.round(consumedCalories)} eaten •{" "}
                  {bioProfile.calorie_goal} goal
                </Text>
              </>
            ) : (
              <Text style={styles.goalBody}>
                Set a daily calorie goal in your profile
              </Text>
            )}
          </View>

          {/* ── Macro Breakdown ───────────────── */}
          {(consumedProtein > 0 || consumedCarbs > 0 || consumedFat > 0) && (
            <View style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <Text style={styles.goalIcon}>📊</Text>
                <Text style={styles.goalTitle}>Macros Today</Text>
              </View>
              {(
                [
                  {
                    label: "Protein",
                    value: consumedProtein,
                    color: Palette.accent,
                  },
                  {
                    label: "Carbs",
                    value: consumedCarbs,
                    color: Palette.warning,
                  },
                  { label: "Fat", value: consumedFat, color: Palette.success },
                ] as const
              ).map((m) => {
                const total =
                  consumedProtein + consumedCarbs + consumedFat || 1;
                const pct = (m.value / total) * 100;
                return (
                  <View key={m.label} style={{ marginBottom: Spacing.sm }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: Palette.textSecondary,
                          fontWeight: "600",
                        }}
                      >
                        {m.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: m.color,
                          fontWeight: "700",
                        }}
                      >
                        {Math.round(m.value)}g
                      </Text>
                    </View>
                    <View style={styles.goalBarTrack}>
                      <View
                        style={[
                          styles.goalBarFill,
                          {
                            width: `${Math.round(pct)}%` as any,
                            backgroundColor: m.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
              <Text
                style={{
                  fontSize: 11,
                  color: Palette.textMuted,
                  marginTop: Spacing.xs,
                }}
              >
                {Math.round(consumedProtein + consumedCarbs + consumedFat)}g
                total · tap Calories card for full log
              </Text>
            </View>
          )}

          {/* ── Motivational Quote ─────────────── */}
          <View style={styles.quoteCard}>
            <Text style={styles.quoteIcon}>💬</Text>
            <Text style={styles.quoteText}>"{quote}"</Text>
          </View>

          <View style={{ height: 30 }} />
        </Animated.ScrollView>
      )}

      {/* ── Weight Prompt Modal (manual trigger after skip) ── */}
      <DailyWeightPrompt
        visible={showWeightPrompt}
        onComplete={() => {
          setShowWeightPrompt(false);
          loadAllData(false);
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
function makeHomeStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: P.bg,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: Spacing.lg,
    },
    loadingText: {
      fontSize: 14,
      color: P.textSecondary,
      fontWeight: "600",
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
    },

    // Header
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.xl,
    },
    headerBadges: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    greeting: {
      fontSize: 24,
      fontWeight: "700",
      color: P.textPrimary,
      letterSpacing: -0.5,
    },
    date: {
      fontSize: 14,
      color: P.textSecondary,
      marginTop: 4,
    },
    weightBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: P.accentMuted,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: P.accent + "30",
    },
    weightBadgeIcon: {
      fontSize: 20,
    },
    streakBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: P.warningMuted,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radii.full,
      gap: 4,
    },
    streakIcon: { fontSize: 18 },
    streakCount: {
      fontSize: 16,
      fontWeight: "800",
      color: P.warning,
    },
    // Progress ring
    ringSection: {
      alignItems: "center",
      marginBottom: Spacing["2xl"],
    },
    // Stats row
    statsRow: {
      flexDirection: "row",
      gap: Spacing.md,
      marginBottom: Spacing.xl,
    },
    // Goal card
    goalCard: {
      backgroundColor: P.bgCard,
      borderRadius: Radii.lg,
      padding: Spacing.xl,
      marginBottom: Spacing.lg,
      borderWidth: 1,
      borderColor: P.border,
    },
    goalHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: Spacing.sm,
    },
    goalIcon: { fontSize: 20 },
    goalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: P.textPrimary,
    },
    goalBody: {
      fontSize: 14,
      color: P.textSecondary,
      lineHeight: 20,
      marginBottom: Spacing.md,
    },
    goalProgress: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
    },
    goalBarTrack: {
      flex: 1,
      height: 8,
      backgroundColor: P.border,
      borderRadius: 4,
      overflow: "hidden",
    },
    goalBarFill: {
      height: "100%",
      backgroundColor: P.accent,
      borderRadius: 4,
    },
    goalPct: {
      fontSize: 13,
      fontWeight: "700",
      color: P.accent,
    },
    // Quote card
    quoteCard: {
      backgroundColor: P.accentMuted,
      borderRadius: Radii.lg,
      padding: Spacing.xl,
      flexDirection: "row",
      gap: Spacing.md,
      alignItems: "flex-start",
      borderWidth: 1,
      borderColor: P.accent + "30",
    },
    quoteIcon: { fontSize: 20, marginTop: 2 },
    quoteText: {
      flex: 1,
      fontSize: 14,
      fontStyle: "italic",
      color: P.accentLight,
      lineHeight: 22,
    },
    legendRow: {
      flexDirection: "row",
      gap: Spacing.md,
      marginTop: Spacing.md,
      justifyContent: "center",
      flexWrap: "wrap",
    },
    legendHeader: {
      fontSize: 13,
      fontWeight: "700",
      color: P.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: Spacing.sm,
      marginTop: Spacing.md,
      alignSelf: "center",
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: Spacing.sm,
    },
    legendItemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    legendIcon: {
      fontSize: 16,
    },
    legendLabel: {
      fontSize: 12,
      color: P.textSecondary,
    },
    legendPct: {
      fontSize: 12,
      marginLeft: 6,
      color: P.textSecondary,
      fontWeight: "700",
    },
    // Water intake tracker
    waterCount: {
      fontSize: 13,
      color: "#38BDF8",
      fontWeight: "700",
      marginLeft: "auto",
    },
    waterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.sm,
      marginBottom: Spacing.md,
      justifyContent: "center",
    },
    waterDrop: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    waterDropFilled: {
      backgroundColor: "rgba(56, 189, 248, 0.15)",
    },
    waterDropEmpty: {
      backgroundColor: P.bgCard,
    },
    waterButtons: {
      flexDirection: "row",
      gap: Spacing.md,
      marginTop: Spacing.md,
    },
    waterBtnMinus: {
      width: 44,
      height: 40,
      borderRadius: Radii.md,
      backgroundColor: P.bgCard,
      borderWidth: 1,
      borderColor: P.border,
      alignItems: "center",
      justifyContent: "center",
    },
    waterBtnText: {
      fontSize: 20,
      fontWeight: "700",
      color: P.textSecondary,
    },
    waterBtnPlus: {
      flex: 1,
      height: 40,
      borderRadius: Radii.md,
      backgroundColor: "rgba(56, 189, 248, 0.12)",
      borderWidth: 1,
      borderColor: "rgba(56, 189, 248, 0.20)",
      alignItems: "center",
      justifyContent: "center",
    },
    waterBtnPlusText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#38BDF8",
      letterSpacing: 0.3,
    },
    // ── Task chips (Daily Tasks redesign) ────────────────────
    legendGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.sm,
      marginTop: Spacing.md,
      justifyContent: "center",
    },
    taskChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
      borderRadius: Radii.full,
      borderWidth: 1,
    },
    taskChipDone: {
      backgroundColor: P.successMuted,
      borderColor: P.success + "50",
    },
    taskChipPending: {
      backgroundColor: P.bgCard,
      borderColor: P.border,
    },
    taskChipIcon: {
      fontSize: 13,
      color: P.textPrimary,
    },
    taskChipLabel: {
      fontSize: 12,
      fontWeight: "600" as const,
    },
  });
}
