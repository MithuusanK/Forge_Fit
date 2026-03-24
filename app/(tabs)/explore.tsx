import { DarkPalette, Radii, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { useLoadingGuard } from "@/hooks/useLoadingGuard";
import { useTheme } from "@/hooks/useTheme";
import { log } from "@/utils/log";

import { getCurrentUserBioProfile } from "@/services/bioProfile";
import {
  AIFoodItem,
  AIRecognitionResult,
  BarcodeProduct,
  DailySummary,
  FoodLog,
  FoodLogUpdateParams,
  MealType,
  deleteFoodLog,
  getDailySummary,
  getFoodLogs,
  logBarcodeFood,
  lookupBarcode,
  recognizeFoodImage,
  recognizeFoodText,
  updateFoodLog,
} from "@/services/foodRecognition";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Stop,
  LinearGradient as SvgGradient,
} from "react-native-svg";

// ── Helpers ─────────────────────────────────────────────────
// Use EST timezone consistently so food logs reset at midnight EST (same as water)
function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Food Log Detail Modal ───────────────────────────────────
function FoodLogDetailModal({
  visible,
  log,
  onClose,
  onDelete,
  onEdit,
}: {
  visible: boolean;
  log: FoodLog | null;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { palette: Palette } = useTheme();
  const detailModalStyles = useMemo(
    () => makeDetailModalStyles(Palette),
    [Palette],
  );
  if (!log) return null;

  const protein = log.total_protein ?? 0;
  const carbs = log.total_carbs ?? 0;
  const fat = log.total_fat ?? 0;
  const calories = log.total_calories ?? 0;
  const totalGrams = protein + carbs + fat;

  const proteinPercent = totalGrams > 0 ? (protein / totalGrams) * 100 : 0;
  const carbsPercent = totalGrams > 0 ? (carbs / totalGrams) * 100 : 0;
  const fatPercent = totalGrams > 0 ? (fat / totalGrams) * 100 : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={detailModalStyles.overlay} onPress={onClose}>
        <Pressable
          style={detailModalStyles.content}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={detailModalStyles.header}>
            <View style={detailModalStyles.headerTop}>
              <Text style={detailModalStyles.mealIcon}>
                {MEAL_ICONS[log.meal_type ?? "snack"]}
              </Text>
              <View style={{ flex: 1 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text style={detailModalStyles.mealTitle}>
                    {log.meal_type
                      ? log.meal_type.charAt(0).toUpperCase() +
                        log.meal_type.slice(1)
                      : "Meal"}
                  </Text>
                  {log.edited && (
                    <View
                      style={{
                        backgroundColor: Palette.warningMuted,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: Palette.warning,
                          fontSize: 10,
                          fontWeight: "700",
                        }}
                      >
                        EDITED
                      </Text>
                    </View>
                  )}
                  {log.source === "barcode" && (
                    <View
                      style={{
                        backgroundColor: Palette.accentMuted,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: Palette.accent,
                          fontSize: 10,
                          fontWeight: "700",
                        }}
                      >
                        BARCODE
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={detailModalStyles.mealTime}>
                  {new Date(log.created_at).toLocaleString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </View>
              <Pressable onPress={onClose} style={detailModalStyles.closeBtn}>
                <Text style={detailModalStyles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Calories Display */}
            <View style={detailModalStyles.caloriesSection}>
              <Text style={detailModalStyles.caloriesLabel}>
                Total Calories
              </Text>
              <Text style={detailModalStyles.caloriesValue}>
                {Math.round(calories)}
              </Text>
              <Text style={detailModalStyles.caloriesUnit}>kcal</Text>
            </View>

            {/* Macro Breakdown */}
            <View style={detailModalStyles.macrosSection}>
              <Text style={detailModalStyles.macrosTitle}>Macro Breakdown</Text>

              {/* Protein */}
              <View style={detailModalStyles.macroItem}>
                <View style={detailModalStyles.macroHeader}>
                  <View style={detailModalStyles.macroLabelRow}>
                    <Text style={detailModalStyles.macroEmoji}>🥩</Text>
                    <Text style={detailModalStyles.macroLabel}>Protein</Text>
                  </View>
                  <Text style={detailModalStyles.macroValue}>
                    {round1(protein)}g
                  </Text>
                </View>
                <View style={detailModalStyles.progressBar}>
                  <View
                    style={[
                      detailModalStyles.progressFill,
                      {
                        width: `${proteinPercent}%`,
                        backgroundColor: "#EF4444",
                      },
                    ]}
                  />
                </View>
                <Text style={detailModalStyles.macroPercent}>
                  {Math.round(proteinPercent)}%
                </Text>
              </View>

              {/* Carbs */}
              <View style={detailModalStyles.macroItem}>
                <View style={detailModalStyles.macroHeader}>
                  <View style={detailModalStyles.macroLabelRow}>
                    <Text style={detailModalStyles.macroEmoji}>🍞</Text>
                    <Text style={detailModalStyles.macroLabel}>Carbs</Text>
                  </View>
                  <Text style={detailModalStyles.macroValue}>
                    {round1(carbs)}g
                  </Text>
                </View>
                <View style={detailModalStyles.progressBar}>
                  <View
                    style={[
                      detailModalStyles.progressFill,
                      { width: `${carbsPercent}%`, backgroundColor: "#FBBF24" },
                    ]}
                  />
                </View>
                <Text style={detailModalStyles.macroPercent}>
                  {Math.round(carbsPercent)}%
                </Text>
              </View>

              {/* Fat */}
              <View style={detailModalStyles.macroItem}>
                <View style={detailModalStyles.macroHeader}>
                  <View style={detailModalStyles.macroLabelRow}>
                    <Text style={detailModalStyles.macroEmoji}>🥑</Text>
                    <Text style={detailModalStyles.macroLabel}>Fat</Text>
                  </View>
                  <Text style={detailModalStyles.macroValue}>
                    {round1(fat)}g
                  </Text>
                </View>
                <View style={detailModalStyles.progressBar}>
                  <View
                    style={[
                      detailModalStyles.progressFill,
                      { width: `${fatPercent}%`, backgroundColor: "#38BDF8" },
                    ]}
                  />
                </View>
                <Text style={detailModalStyles.macroPercent}>
                  {Math.round(fatPercent)}%
                </Text>
              </View>
            </View>

            {/* Notes if available */}
            {log.notes && (
              <View style={detailModalStyles.notesSection}>
                <Text style={detailModalStyles.notesTitle}>Notes</Text>
                <Text style={detailModalStyles.notesText}>{log.notes}</Text>
              </View>
            )}

            {/* Original values if edited */}
            {log.edited && log.original_calories != null && (
              <View style={detailModalStyles.notesSection}>
                <Text style={detailModalStyles.notesTitle}>
                  Original AI Values
                </Text>
                <Text style={detailModalStyles.notesText}>
                  {Math.round(log.original_calories ?? 0)} cal |{" "}
                  {round1(log.original_protein ?? 0)}g P |{" "}
                  {round1(log.original_carbs ?? 0)}g C |{" "}
                  {round1(log.original_fat ?? 0)}g F
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View
              style={{
                flexDirection: "row",
                gap: Spacing.md,
                margin: Spacing.lg,
                marginTop: 0,
              }}
            >
              <Pressable
                style={({ pressed }) => [
                  {
                    flex: 1,
                    backgroundColor: Palette.accentMuted,
                    padding: Spacing.md,
                    borderRadius: Radii.md,
                    alignItems: "center",
                  },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={onEdit}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: Palette.accent,
                  }}
                >
                  ✏️ Edit
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  detailModalStyles.deleteBtn,
                  { flex: 1, margin: 0 },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={onDelete}
              >
                <Text style={detailModalStyles.deleteBtnText}>🗑️ Delete</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeDetailModalStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: Spacing.lg,
    },
    content: {
      backgroundColor: P.bgCard,
      borderRadius: Radii.xl,
      width: "100%",
      maxWidth: 400,
      maxHeight: "85%",
      overflow: "hidden",
    },
    header: {
      backgroundColor: P.bgElevated,
      borderBottomWidth: 1,
      borderBottomColor: P.border,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      padding: Spacing.lg,
      gap: Spacing.md,
    },
    mealIcon: {
      fontSize: 32,
    },
    mealTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: P.textPrimary,
    },
    mealTime: {
      fontSize: 13,
      color: P.textSecondary,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: P.bgCard,
      alignItems: "center",
      justifyContent: "center",
    },
    closeBtnText: {
      fontSize: 18,
      color: P.textSecondary,
    },
    caloriesSection: {
      alignItems: "center",
      paddingVertical: Spacing["2xl"],
      borderBottomWidth: 1,
      borderBottomColor: P.border,
    },
    caloriesLabel: {
      fontSize: 12,
      color: P.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: Spacing.sm,
    },
    caloriesValue: {
      fontSize: 56,
      fontWeight: "800",
      color: P.accent,
      lineHeight: 60,
    },
    caloriesUnit: {
      fontSize: 14,
      color: P.textSecondary,
      marginTop: 4,
    },
    macrosSection: {
      padding: Spacing.lg,
    },
    macrosTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: P.textPrimary,
      marginBottom: Spacing.lg,
    },
    macroItem: {
      marginBottom: Spacing.lg,
    },
    macroHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.sm,
    },
    macroLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    macroEmoji: {
      fontSize: 20,
    },
    macroLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: P.textPrimary,
    },
    macroValue: {
      fontSize: 18,
      fontWeight: "800",
      color: P.textPrimary,
    },
    progressBar: {
      height: 8,
      backgroundColor: P.border,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: Spacing.xs,
    },
    progressFill: {
      height: "100%",
      borderRadius: 4,
    },
    macroPercent: {
      fontSize: 11,
      color: P.textMuted,
      textAlign: "right",
    },
    notesSection: {
      padding: Spacing.lg,
      paddingTop: 0,
    },
    notesTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: P.textPrimary,
      marginBottom: Spacing.sm,
    },
    notesText: {
      fontSize: 13,
      color: P.textSecondary,
      lineHeight: 20,
      backgroundColor: P.bg,
      padding: Spacing.md,
      borderRadius: Radii.md,
    },
    deleteBtn: {
      backgroundColor: "#FEE2E2",
      margin: Spacing.lg,
      marginTop: 0,
      padding: Spacing.md,
      borderRadius: Radii.md,
      alignItems: "center",
    },
    deleteBtnText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#DC2626",
    },
  });
}

// ── Macro Ring ──────────────────────────────────────────────
function MacroRing({
  consumed,
  target,
  label,
  color,
  size = 80,
}: {
  consumed: number;
  target: number;
  label: string;
  color: string;
  size?: number;
}) {
  const { palette: Palette } = useTheme();
  const macroStyles = useMemo(() => makeMacroStyles(Palette), [Palette]);
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;
  const center = size / 2;

  return (
    <View style={macroStyles.wrapper}>
      <View style={macroStyles.ringWrap}>
        <Svg width={size} height={size}>
          <Circle
            stroke={Palette.border}
            fill="none"
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
          />
          <Circle
            stroke={color}
            fill="none"
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
        <Text style={macroStyles.value}>{Math.round(consumed)}g</Text>
      </View>
      <Text style={macroStyles.label}>{label}</Text>
      <Text style={macroStyles.target}>{target}g goal</Text>
    </View>
  );
}

function makeMacroStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    wrapper: { alignItems: "center", flex: 1 },
    ringWrap: { justifyContent: "center", alignItems: "center" },
    value: {
      position: "absolute",
      fontSize: 14,
      fontWeight: "800",
      color: P.textPrimary,
    },
    label: {
      fontSize: 12,
      fontWeight: "700",
      color: P.textSecondary,
      marginTop: 6,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    target: {
      fontSize: 10,
      color: P.textMuted,
      marginTop: 2,
    },
  });
}

// ── Calorie Summary Ring ────────────────────────────────────
function CalorieRing({
  consumed,
  target,
}: {
  consumed: number;
  target: number;
}) {
  const { palette: Palette } = useTheme();
  const size = 140;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;
  const center = size / 2;
  const remaining = Math.max(target - consumed, 0);

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="calGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={Palette.success} />
            <Stop offset="100%" stopColor="#10B981" />
          </SvgGradient>
        </Defs>
        <Circle
          stroke={Palette.border}
          fill="none"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <Circle
          stroke="url(#calGrad)"
          fill="none"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: Palette.textPrimary,
          }}
        >
          {Math.round(remaining)}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: Palette.textMuted,
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          cal left
        </Text>
      </View>
    </View>
  );
}

// ── Meal type helpers ───────────────────────────────────────
const MEAL_ICONS: Record<string, string> = {
  breakfast: "🌅",
  lunch: "☀️",
  dinner: "🌙",
  snack: "🍎",
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

// ── Meal Card ───────────────────────────────────────────────
function MealCard({
  icon,
  title,
  calories,
  items,
  onAdd,
}: {
  icon: string;
  title: string;
  calories: number;
  items: string[];
  onAdd: () => void;
}) {
  const { palette: Palette } = useTheme();
  const mealStyles = useMemo(() => makeMealStyles(Palette), [Palette]);
  return (
    <View style={mealStyles.card}>
      <View style={mealStyles.row}>
        <View style={mealStyles.iconWrap}>
          <Text style={mealStyles.icon}>{icon}</Text>
        </View>
        <View style={mealStyles.info}>
          <Text style={mealStyles.title}>{title}</Text>
          <Text style={mealStyles.cal}>{Math.round(calories)} cal</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            mealStyles.addBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onAdd}
        >
          <Text style={mealStyles.addText}>+</Text>
        </Pressable>
      </View>
      {items.length > 0 ? (
        <View style={mealStyles.itemsList}>
          {items.map((item, idx) => (
            <View key={idx} style={mealStyles.itemPill}>
              <View style={mealStyles.itemPillDot} />
              <Text style={mealStyles.itemText} numberOfLines={1}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={mealStyles.emptyState}>
          <Text style={mealStyles.emptyText}>No items logged yet</Text>
        </View>
      )}
    </View>
  );
}

function makeMealStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: P.bgCard,
      borderRadius: Radii.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: P.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: 14,
      backgroundColor: P.accentMuted,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: P.border,
    },
    icon: { fontSize: 26 },
    info: {
      flex: 1,
      marginLeft: Spacing.md,
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: P.textPrimary,
      letterSpacing: -0.3,
    },
    cal: {
      fontSize: 14,
      fontWeight: "600",
      color: P.accent,
      marginTop: 3,
    },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: P.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: P.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    addText: {
      color: P.white,
      fontSize: 22,
      fontWeight: "700",
      lineHeight: 24,
    },
    itemsList: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: P.divider,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.sm,
    },
    emptyState: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: P.divider,
      alignItems: "center",
    },
    emptyText: {
      fontSize: 12,
      color: P.textMuted,
      fontStyle: "italic",
    },
    itemPill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: P.bgElevated,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: P.border,
      gap: Spacing.xs,
    },
    itemPillDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: P.accent,
    },
    itemText: {
      fontSize: 13,
      fontWeight: "600",
      color: P.textPrimary,
      maxWidth: 200,
    },
  });
}

// ── Nutrition Result Item ───────────────────────────────────
function FoodResultItem({ item }: { item: AIFoodItem }) {
  const { palette: Palette } = useTheme();
  const resultStyles = useMemo(() => makeResultStyles(Palette), [Palette]);
  return (
    <View style={resultStyles.itemCard}>
      <View style={resultStyles.itemHeader}>
        <Text style={resultStyles.itemName}>{item.food_name}</Text>
        {item.serving_size && (
          <Text style={resultStyles.itemServing}>{item.serving_size}</Text>
        )}
      </View>
      <View style={resultStyles.macroRow}>
        <View style={resultStyles.macroPill}>
          <Text style={resultStyles.macroEmoji}>🔥</Text>
          <Text style={resultStyles.macroVal}>{Math.round(item.calories)}</Text>
          <Text style={resultStyles.macroLabel}>cal</Text>
        </View>
        <View style={resultStyles.macroPill}>
          <Text style={[resultStyles.macroVal, { color: "#EF4444" }]}>
            {round1(item.protein)}g
          </Text>
          <Text style={resultStyles.macroLabel}>protein</Text>
        </View>
        <View style={resultStyles.macroPill}>
          <Text style={[resultStyles.macroVal, { color: "#FBBF24" }]}>
            {round1(item.carbs)}g
          </Text>
          <Text style={resultStyles.macroLabel}>carbs</Text>
        </View>
        <View style={resultStyles.macroPill}>
          <Text style={[resultStyles.macroVal, { color: "#38BDF8" }]}>
            {round1(item.fat)}g
          </Text>
          <Text style={resultStyles.macroLabel}>fat</Text>
        </View>
      </View>
      <View style={resultStyles.confidenceBar}>
        <View
          style={[
            resultStyles.confidenceFill,
            {
              width: `${item.confidence}%`,
              backgroundColor:
                item.confidence >= 80
                  ? Palette.success
                  : item.confidence >= 50
                    ? Palette.warning
                    : Palette.error,
            },
          ]}
        />
      </View>
      <Text style={resultStyles.confidenceText}>
        {Math.round(item.confidence)}% confidence
      </Text>
    </View>
  );
}

function makeResultStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    itemCard: {
      backgroundColor: P.bgElevated,
      borderRadius: Radii.md,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: P.border,
    },
    itemHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.sm,
    },
    itemName: {
      fontSize: 16,
      fontWeight: "700",
      color: P.textPrimary,
      flex: 1,
    },
    itemServing: {
      fontSize: 12,
      color: P.textMuted,
      marginLeft: Spacing.sm,
    },
    macroRow: {
      flexDirection: "row",
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    macroPill: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 6,
      backgroundColor: P.bgCard,
      borderRadius: Radii.sm,
    },
    macroEmoji: { fontSize: 12 },
    macroVal: {
      fontSize: 14,
      fontWeight: "800",
      color: P.textPrimary,
    },
    macroLabel: {
      fontSize: 9,
      color: P.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    confidenceBar: {
      height: 4,
      backgroundColor: P.border,
      borderRadius: 2,
      overflow: "hidden",
      marginBottom: 4,
    },
    confidenceFill: {
      height: "100%",
      borderRadius: 2,
    },
    confidenceText: {
      fontSize: 10,
      color: P.textMuted,
    },
  });
}

// ── Edit Food Log Modal ─────────────────────────────────────
function EditFoodLogModal({
  visible,
  log,
  onClose,
  onSave,
}: {
  visible: boolean;
  log: FoodLog | null;
  onClose: () => void;
  onSave: (updated: FoodLog) => void;
}) {
  const { palette: Palette } = useTheme();
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (log && visible) {
      setCalories(String(Math.round(log.total_calories ?? 0)));
      setProtein(String(round1(log.total_protein ?? 0)));
      setCarbs(String(round1(log.total_carbs ?? 0)));
      setFat(String(round1(log.total_fat ?? 0)));
      setNotes(log.notes ?? "");
    }
  }, [log, visible]);

  const handleSave = async () => {
    if (!log) return;
    setSaving(true);
    try {
      const updates: FoodLogUpdateParams = {
        total_calories: parseFloat(calories) || 0,
        total_protein: parseFloat(protein) || 0,
        total_carbs: parseFloat(carbs) || 0,
        total_fat: parseFloat(fat) || 0,
        notes: notes || undefined,
      };
      const result = await updateFoodLog(log.id, updates);
      if (result) {
        onSave(result);
      } else {
        Alert.alert("Error", "Failed to update food log. Please try again.");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to update food log.");
    } finally {
      setSaving(false);
    }
  };

  if (!log) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: Palette.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: Spacing.xl,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: Spacing.xl,
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: Palette.textPrimary,
                }}
              >
                Edit Food Log
              </Text>
              <Pressable
                onPress={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: Palette.bgCard,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 18, color: Palette.textSecondary }}>
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Calories */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: Palette.textSecondary,
                  marginBottom: 6,
                }}
              >
                Calories (kcal)
              </Text>
              <TextInput
                style={{
                  backgroundColor: Palette.bgInput ?? Palette.bgCard,
                  color: Palette.textPrimary,
                  borderRadius: Radii.md,
                  borderWidth: 1,
                  borderColor: Palette.borderLight ?? Palette.border,
                  padding: Spacing.md,
                  fontSize: 18,
                  fontWeight: "700",
                  marginBottom: Spacing.lg,
                }}
                value={calories}
                onChangeText={setCalories}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Palette.textMuted}
              />

              {/* Protein */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: Palette.textSecondary,
                  marginBottom: 6,
                }}
              >
                Protein (g)
              </Text>
              <TextInput
                style={{
                  backgroundColor: Palette.bgInput ?? Palette.bgCard,
                  color: Palette.textPrimary,
                  borderRadius: Radii.md,
                  borderWidth: 1,
                  borderColor: Palette.borderLight ?? Palette.border,
                  padding: Spacing.md,
                  fontSize: 18,
                  fontWeight: "700",
                  marginBottom: Spacing.lg,
                }}
                value={protein}
                onChangeText={setProtein}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Palette.textMuted}
              />

              {/* Carbs */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: Palette.textSecondary,
                  marginBottom: 6,
                }}
              >
                Carbs (g)
              </Text>
              <TextInput
                style={{
                  backgroundColor: Palette.bgInput ?? Palette.bgCard,
                  color: Palette.textPrimary,
                  borderRadius: Radii.md,
                  borderWidth: 1,
                  borderColor: Palette.borderLight ?? Palette.border,
                  padding: Spacing.md,
                  fontSize: 18,
                  fontWeight: "700",
                  marginBottom: Spacing.lg,
                }}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Palette.textMuted}
              />

              {/* Fat */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: Palette.textSecondary,
                  marginBottom: 6,
                }}
              >
                Fat (g)
              </Text>
              <TextInput
                style={{
                  backgroundColor: Palette.bgInput ?? Palette.bgCard,
                  color: Palette.textPrimary,
                  borderRadius: Radii.md,
                  borderWidth: 1,
                  borderColor: Palette.borderLight ?? Palette.border,
                  padding: Spacing.md,
                  fontSize: 18,
                  fontWeight: "700",
                  marginBottom: Spacing.lg,
                }}
                value={fat}
                onChangeText={setFat}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Palette.textMuted}
              />

              {/* Notes */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: Palette.textSecondary,
                  marginBottom: 6,
                }}
              >
                Notes
              </Text>
              <TextInput
                style={{
                  backgroundColor: Palette.bgInput ?? Palette.bgCard,
                  color: Palette.textPrimary,
                  borderRadius: Radii.md,
                  borderWidth: 1,
                  borderColor: Palette.borderLight ?? Palette.border,
                  padding: Spacing.md,
                  fontSize: 15,
                  marginBottom: Spacing.xl,
                  minHeight: 60,
                }}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes..."
                placeholderTextColor={Palette.textMuted}
                multiline
              />

              {/* Save Button */}
              <Pressable
                style={({ pressed }) => [
                  {
                    backgroundColor: Palette.accent,
                    borderRadius: Radii.lg,
                    paddingVertical: 16,
                    alignItems: "center",
                    marginBottom: Spacing.lg,
                  },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Palette.white} />
                ) : (
                  <Text
                    style={{
                      color: Palette.white,
                      fontSize: 16,
                      fontWeight: "800",
                    }}
                  >
                    Save Changes
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Barcode Scanner Modal ───────────────────────────────────
function BarcodeScannerModal({
  visible,
  mealType,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  mealType: MealType;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}) {
  const { palette: Palette } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields for confirmation
  const [editCalories, setEditCalories] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setProduct(null);
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (product) {
      setEditCalories(String(Math.round(product.calories)));
      setEditProtein(String(round1(product.protein)));
      setEditCarbs(String(round1(product.carbs)));
      setEditFat(String(round1(product.fat)));
    }
  }, [product]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);
    setError(null);

    try {
      const result = await lookupBarcode(data);
      if (!result) {
        setError(
          `Product not found for barcode: ${data}. Try manual entry instead.`,
        );
        setTimeout(() => setScanned(false), 2000);
      } else {
        setProduct(result);
      }
    } catch {
      setError("Failed to look up barcode. Please try again.");
      setTimeout(() => setScanned(false), 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const success = await logBarcodeFood({
        barcode: product.barcode,
        product_name: product.product_name,
        calories: parseFloat(editCalories) || 0,
        protein: parseFloat(editProtein) || 0,
        carbs: parseFloat(editCarbs) || 0,
        fat: parseFloat(editFat) || 0,
        serving_size: product.serving_size ?? undefined,
        meal_type: mealType,
      });
      if (success) {
        onClose();
        // The barcode log was saved before logBarcodeFood returned — no delay needed.
        await onSuccess();
      } else {
        Alert.alert("Error", "Failed to save food log.");
      }
    } catch {
      Alert.alert("Error", "Failed to save food log.");
    } finally {
      setSaving(false);
    }
  };

  if (!permission?.granted && visible) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: Spacing.xl,
          }}
        >
          <View
            style={{
              backgroundColor: Palette.bgCard,
              borderRadius: Radii.xl,
              padding: Spacing.xl,
              width: "100%",
              maxWidth: 400,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: Spacing.lg }}>📷</Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: Palette.textPrimary,
                marginBottom: Spacing.md,
                textAlign: "center",
              }}
            >
              Camera Permission Required
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: Palette.textSecondary,
                marginBottom: Spacing.xl,
                textAlign: "center",
              }}
            >
              We need camera access to scan barcodes on food products.
            </Text>
            <Pressable
              style={({ pressed }) => [
                {
                  backgroundColor: Palette.accent,
                  paddingVertical: 14,
                  paddingHorizontal: 32,
                  borderRadius: Radii.md,
                },
                pressed && { opacity: 0.8 },
              ]}
              onPress={requestPermission}
            >
              <Text
                style={{
                  color: Palette.white,
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                Continue
              </Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ marginTop: Spacing.lg }}>
              <Text style={{ color: Palette.textMuted, fontSize: 14 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)" }}>
        {/* Header */}
        <SafeAreaView
          edges={["top"]}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "800", color: "#fff" }}>
            Scan Barcode
          </Text>
          <Pressable
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 18, color: "#fff" }}>✕</Text>
          </Pressable>
        </SafeAreaView>

        {!product ? (
          <>
            {/* Camera View */}
            <View
              style={{
                flex: 1,
                overflow: "hidden",
                margin: Spacing.lg,
                borderRadius: Radii.xl,
              }}
            >
              {Platform.OS === "web" ? (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: Palette.bgCard,
                  }}
                >
                  <Text
                    style={{
                      color: Palette.textMuted,
                      fontSize: 16,
                      textAlign: "center",
                      padding: Spacing.xl,
                    }}
                  >
                    Barcode scanning is not supported on web.{"\n"}Please use a
                    mobile device.
                  </Text>
                </View>
              ) : (
                <CameraView
                  style={{ flex: 1 }}
                  barcodeScannerSettings={{
                    barcodeTypes: [
                      "ean13",
                      "ean8",
                      "upc_a",
                      "upc_e",
                      "code128",
                      "code39",
                    ],
                  }}
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                />
              )}
              {/* Scanning overlay */}
              <View
                style={{
                  position: "absolute",
                  top: "30%",
                  left: "15%",
                  right: "15%",
                  height: "20%",
                  borderWidth: 2,
                  borderColor: Palette.accent,
                  borderRadius: Radii.md,
                }}
              />
            </View>

            {loading && (
              <View
                style={{ alignItems: "center", paddingVertical: Spacing.lg }}
              >
                <ActivityIndicator size="large" color={Palette.accent} />
                <Text
                  style={{ color: "#fff", marginTop: Spacing.md, fontSize: 14 }}
                >
                  Looking up product...
                </Text>
              </View>
            )}

            {error && (
              <View
                style={{
                  margin: Spacing.lg,
                  padding: Spacing.md,
                  backgroundColor: "#FEE2E2",
                  borderRadius: Radii.md,
                }}
              >
                <Text
                  style={{ color: "#DC2626", fontSize: 13, fontWeight: "600" }}
                >
                  ⚠️ {error}
                </Text>
              </View>
            )}

            <View style={{ alignItems: "center", paddingBottom: Spacing.xl }}>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
                Point camera at a barcode
              </Text>
            </View>
          </>
        ) : (
          /* Product confirmation */
          <ScrollView
            style={{ flex: 1, padding: Spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                backgroundColor: Palette.bgCard,
                borderRadius: Radii.xl,
                padding: Spacing.xl,
              }}
            >
              {/* Product info */}
              <View style={{ alignItems: "center", marginBottom: Spacing.xl }}>
                {product.image_url && (
                  <Image
                    source={{ uri: product.image_url }}
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: Radii.lg,
                      marginBottom: Spacing.md,
                    }}
                  />
                )}
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: Palette.textPrimary,
                    textAlign: "center",
                  }}
                >
                  {product.product_name}
                </Text>
                {product.brand && (
                  <Text
                    style={{
                      fontSize: 14,
                      color: Palette.textSecondary,
                      marginTop: 4,
                    }}
                  >
                    {product.brand}
                  </Text>
                )}
                {product.serving_size && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: Palette.textMuted,
                      marginTop: 2,
                    }}
                  >
                    Serving: {product.serving_size}
                  </Text>
                )}
                <View
                  style={{
                    backgroundColor: Palette.accentMuted,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 12,
                    marginTop: Spacing.md,
                  }}
                >
                  <Text
                    style={{
                      color: Palette.accent,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {product.barcode}
                  </Text>
                </View>
              </View>

              {/* Editable nutrition fields */}
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: Palette.textPrimary,
                  marginBottom: Spacing.md,
                }}
              >
                Nutrition (adjust if needed)
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  gap: Spacing.md,
                  marginBottom: Spacing.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      color: Palette.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    Calories
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: Palette.bg,
                      color: Palette.textPrimary,
                      borderRadius: Radii.sm,
                      padding: Spacing.sm,
                      fontSize: 16,
                      fontWeight: "700",
                      textAlign: "center",
                      borderWidth: 1,
                      borderColor: Palette.border,
                    }}
                    value={editCalories}
                    onChangeText={setEditCalories}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      color: Palette.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    Protein (g)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: Palette.bg,
                      color: Palette.textPrimary,
                      borderRadius: Radii.sm,
                      padding: Spacing.sm,
                      fontSize: 16,
                      fontWeight: "700",
                      textAlign: "center",
                      borderWidth: 1,
                      borderColor: Palette.border,
                    }}
                    value={editProtein}
                    onChangeText={setEditProtein}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  gap: Spacing.md,
                  marginBottom: Spacing.xl,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      color: Palette.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    Carbs (g)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: Palette.bg,
                      color: Palette.textPrimary,
                      borderRadius: Radii.sm,
                      padding: Spacing.sm,
                      fontSize: 16,
                      fontWeight: "700",
                      textAlign: "center",
                      borderWidth: 1,
                      borderColor: Palette.border,
                    }}
                    value={editCarbs}
                    onChangeText={setEditCarbs}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      color: Palette.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    Fat (g)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: Palette.bg,
                      color: Palette.textPrimary,
                      borderRadius: Radii.sm,
                      padding: Spacing.sm,
                      fontSize: 16,
                      fontWeight: "700",
                      textAlign: "center",
                      borderWidth: 1,
                      borderColor: Palette.border,
                    }}
                    value={editFat}
                    onChangeText={setEditFat}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {product.calories === 0 &&
                product.protein === 0 &&
                product.carbs === 0 &&
                product.fat === 0 && (
                  <View
                    style={{
                      backgroundColor: "#FEF3C7",
                      padding: Spacing.md,
                      borderRadius: Radii.md,
                      marginBottom: Spacing.lg,
                    }}
                  >
                    <Text
                      style={{
                        color: "#D97706",
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      ⚠️ No nutrition data found for this product. Please enter
                      values manually.
                    </Text>
                  </View>
                )}

              <Pressable
                style={({ pressed }) => [
                  {
                    backgroundColor: Palette.accent,
                    paddingVertical: 16,
                    borderRadius: Radii.lg,
                    alignItems: "center",
                  },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleConfirmSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}
                  >
                    ✓ Save to{" "}
                    {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setProduct(null);
                  setScanned(false);
                  setError(null);
                }}
                style={{
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: Spacing.sm,
                }}
              >
                <Text
                  style={{
                    color: Palette.textSecondary,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  Scan Another
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Macro Progress Bar ──────────────────────────────────────
function MacroProgressBar({
  label,
  consumed,
  target,
  color,
  emoji,
}: {
  label: string;
  consumed: number;
  target: number;
  color: string;
  emoji: string;
}) {
  const { palette: Palette } = useTheme();
  const progress = target > 0 ? consumed / target : 0;
  const isOver = progress > 1;
  const clampedProgress = Math.min(progress, 1);
  const percent = Math.round(progress * 100);

  return (
    <View style={{ marginBottom: Spacing.lg }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 16 }}>{emoji}</Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: Palette.textPrimary,
            }}
          >
            {label}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: isOver ? Palette.error : Palette.textSecondary,
          }}
        >
          {Math.round(consumed)} / {Math.round(target)}
          {label === "Calories" ? " kcal" : "g"}
        </Text>
      </View>
      <View
        style={{
          height: 10,
          backgroundColor: Palette.border,
          borderRadius: 5,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${Math.min(percent, 100)}%`,
            backgroundColor: isOver ? Palette.error : color,
            borderRadius: 5,
          }}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          marginTop: 3,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: isOver ? Palette.error : Palette.textMuted,
            fontWeight: isOver ? "700" : "400",
          }}
        >
          {percent}%{isOver ? " — over target!" : ""}
        </Text>
      </View>
    </View>
  );
}

// ── Add Food Modal ──────────────────────────────────────────
function AddFoodModal({
  visible,
  mealType,
  onClose,
  onSuccess,
  onBarcodeScan,
}: {
  visible: boolean;
  mealType: MealType;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  onBarcodeScan?: () => void;
}) {
  const { palette: Palette } = useTheme();
  const modalStyles = useMemo(() => makeAddFoodModalStyles(Palette), [Palette]);
  const [mode, setMode] = useState<"choose" | "webcam" | "text" | "results">(
    "choose",
  );
  const [loading, setLoading] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [result, setResult] = useState<AIRecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const webcamRef = useRef<any>(null);
  const streamRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setMode("choose");
      setLoading(false);
      setImageUri(null);
      setTextInput("");
      setResult(null);
      setError(null);
    }
    return () => {
      // Cleanup webcam stream when modal closes
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: any) => t.stop());
        streamRef.current = null;
      }
    };
  }, [visible]);

  // Start webcam stream (web only) — attaches to a real <video> element via ref callback
  const attachStreamToVideo = useCallback((stream: MediaStream) => {
    streamRef.current = stream;
    // Poll for the video element (it may not be in DOM immediately after state change)
    const tryAttach = (attempts: number) => {
      const videoEl = document.getElementById(
        "grind-webcam",
      ) as HTMLVideoElement | null;
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.onloadedmetadata = () => videoEl.play();
        webcamRef.current = videoEl;
      } else if (attempts > 0) {
        setTimeout(() => tryAttach(attempts - 1), 150);
      }
    };
    tryAttach(20); // try for ~3 seconds
  }, []);

  const startWebcam = useCallback(async () => {
    if (Platform.OS !== "web") return;
    try {
      const stream = await (navigator as any).mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      attachStreamToVideo(stream);
    } catch (err: any) {
      setError(
        "Could not access camera: " + (err.message || "Permission denied"),
      );
      setMode("choose");
    }
  }, [attachStreamToVideo]);

  const stopWebcamStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: any) => t.stop());
      streamRef.current = null;
    }
    webcamRef.current = null;
  }, []);

  // Capture frame from webcam
  const captureWebcamFrame = useCallback(async () => {
    const video = webcamRef.current as HTMLVideoElement | null;
    if (!video || !video.videoWidth) {
      setError("Camera not ready yet — please wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopWebcamStream();
    setImageUri(dataUrl);
    setLoading(true);
    setError(null);
    try {
      const res = await recognizeFoodImage(dataUrl, mealType, true);
      setResult(res);
      setMode("results");
    } catch (err: any) {
      setError(err.message || "Failed to analyze image");
      setMode("choose");
    } finally {
      setLoading(false);
    }
  }, [mealType, stopWebcamStream]);

  const cancelWebcam = useCallback(() => {
    stopWebcamStream();
    setMode("choose");
  }, [stopWebcamStream]);

  const handleTakePhoto = async () => {
    if (Platform.OS === "web") {
      // On web/desktop, switch to webcam capture mode
      setMode("webcam");
      startWebcam();
      return;
    }
    // On native, use the camera
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Camera permission is required to take food photos.",
      );
      return;
    }
    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!pickerResult.canceled && pickerResult.assets[0]) {
      const uri = pickerResult.assets[0].uri;
      setImageUri(uri);
      await analyzeImage(uri);
    }
  };

  const handlePickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Photo library access is needed to select food photos.",
      );
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!pickerResult.canceled && pickerResult.assets[0]) {
      const uri = pickerResult.assets[0].uri;
      setImageUri(uri);
      await analyzeImage(uri);
    }
  };

  const analyzeImage = async (uri: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await recognizeFoodImage(uri, mealType, true);
      setResult(res);
      setMode("results");
    } catch (err: any) {
      setError(err.message || "Failed to analyze image");
      setMode("choose");
    } finally {
      setLoading(false);
    }
  };

  const handleTextAnalysis = async () => {
    if (!textInput.trim()) {
      Alert.alert("Enter food", "Please describe what you ate.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await recognizeFoodText(textInput.trim(), mealType, true);
      setResult(res);
      setMode("results");
    } catch (err: any) {
      setError(err.message || "Failed to analyze text");
    } finally {
      setLoading(false);
    }
  };

  const handleDone = async () => {
    onClose();
    // The food log was saved by the Edge Function before this callback fires,
    // so no delay is needed — refresh immediately.
    await onSuccess();
  };

  const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View style={modalStyles.header}>
                <Text style={modalStyles.title}>Add {mealLabel}</Text>
                <Pressable onPress={onClose} style={modalStyles.closeBtn}>
                  <Text style={modalStyles.closeText}>✕</Text>
                </Pressable>
              </View>

              {error && (
                <View style={modalStyles.errorBanner}>
                  <Text style={modalStyles.errorText}>⚠️ {error}</Text>
                </View>
              )}

              {/* Webcam capture mode (web only) */}
              {mode === "webcam" && Platform.OS === "web" && (
                <View
                  style={{ alignItems: "center", paddingVertical: Spacing.xl }}
                >
                  {/* Use a raw HTML video element via nativeID for DOM access */}
                  <View
                    style={{
                      width: "100%",
                      maxWidth: 640,
                      aspectRatio: 4 / 3,
                      borderRadius: Radii.lg,
                      overflow: "hidden",
                      backgroundColor: "#111",
                    }}
                  >
                    {/* @ts-ignore - RNW renders View as div; we inject a video via DOM */}
                    <video
                      id="grind-webcam"
                      autoPlay
                      playsInline
                      muted
                      style={
                        {
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        } as any
                      }
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: Spacing.lg,
                      marginTop: Spacing.xl,
                    }}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        {
                          paddingHorizontal: 36,
                          paddingVertical: 16,
                          borderRadius: Radii.lg,
                          backgroundColor: Palette.accent,
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={captureWebcamFrame}
                    >
                      <Text
                        style={{
                          color: Palette.white,
                          fontWeight: "800",
                          fontSize: 16,
                        }}
                      >
                        📸 Capture
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        {
                          paddingHorizontal: 28,
                          paddingVertical: 16,
                          borderRadius: Radii.lg,
                          backgroundColor: Palette.bgCard,
                          borderWidth: 1,
                          borderColor: Palette.border,
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={cancelWebcam}
                    >
                      <Text
                        style={{
                          color: Palette.textSecondary,
                          fontWeight: "700",
                          fontSize: 16,
                        }}
                      >
                        Cancel
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={{
                      color: Palette.textMuted,
                      fontSize: 12,
                      marginTop: Spacing.md,
                    }}
                  >
                    Point your camera at the food and press Capture
                  </Text>
                </View>
              )}

              {/* Loading state */}
              {loading && (
                <View style={modalStyles.loadingWrap}>
                  {imageUri && (
                    <Image
                      source={{ uri: imageUri }}
                      style={modalStyles.previewImage}
                    />
                  )}
                  <ActivityIndicator
                    size="large"
                    color={Palette.accent}
                    style={{ marginTop: Spacing.lg }}
                  />
                  <Text style={modalStyles.loadingText}>
                    🤖 Analyzing your food...
                  </Text>
                  <Text style={modalStyles.loadingSubtext}>
                    Our AI is identifying items and calculating nutrition
                  </Text>
                </View>
              )}

              {/* Choose input method */}
              {!loading && mode === "choose" && (
                <>
                  <Text style={modalStyles.subtitle}>
                    How would you like to log your meal?
                  </Text>

                  <Pressable
                    style={({ pressed }) => [
                      modalStyles.optionCard,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={handleTakePhoto}
                  >
                    <LinearGradient
                      colors={[Palette.gradientStart, Palette.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={modalStyles.optionGradient}
                    >
                      <Text style={modalStyles.optionIcon}>📸</Text>
                      <View style={modalStyles.optionInfo}>
                        <Text style={modalStyles.optionTitle}>
                          Take a Photo
                        </Text>
                        <Text style={modalStyles.optionDesc}>
                          Snap a picture of your meal for instant AI analysis
                        </Text>
                      </View>
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      modalStyles.optionCard,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={handlePickFromGallery}
                  >
                    <View style={modalStyles.optionOutline}>
                      <Text style={modalStyles.optionIcon}>🖼️</Text>
                      <View style={modalStyles.optionInfo}>
                        <Text
                          style={[
                            modalStyles.optionTitle,
                            { color: Palette.textPrimary },
                          ]}
                        >
                          Choose from Gallery
                        </Text>
                        <Text style={modalStyles.optionDescDark}>
                          Select a food photo from your library
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {onBarcodeScan && Platform.OS !== "web" && (
                    <Pressable
                      style={({ pressed }) => [
                        modalStyles.optionCard,
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() => {
                        onClose();
                        setTimeout(onBarcodeScan, 300);
                      }}
                    >
                      <View style={modalStyles.optionOutline}>
                        <Text style={modalStyles.optionIcon}>📊</Text>
                        <View style={modalStyles.optionInfo}>
                          <Text
                            style={[
                              modalStyles.optionTitle,
                              { color: Palette.textPrimary },
                            ]}
                          >
                            Scan Barcode
                          </Text>
                          <Text style={modalStyles.optionDescDark}>
                            Look up nutrition from product barcode
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  )}

                  <View style={modalStyles.textSection}>
                    <View style={modalStyles.dividerRow}>
                      <View style={modalStyles.dividerLine} />
                      <Text style={modalStyles.dividerText}>or type it</Text>
                      <View style={modalStyles.dividerLine} />
                    </View>
                    <TextInput
                      style={modalStyles.textArea}
                      value={textInput}
                      onChangeText={setTextInput}
                      placeholder='e.g. "2 scrambled eggs, toast with butter, orange juice"'
                      placeholderTextColor={Palette.textMuted}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                    <Pressable
                      style={({ pressed }) => [
                        modalStyles.analyzeBtn,
                        pressed && { opacity: 0.8 },
                        !textInput.trim() && { opacity: 0.5 },
                      ]}
                      onPress={handleTextAnalysis}
                      disabled={!textInput.trim()}
                    >
                      <Text style={modalStyles.analyzeBtnText}>
                        🔍 Analyze with AI
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}

              {/* Results */}
              {!loading && mode === "results" && result && (
                <>
                  {imageUri && (
                    <Image
                      source={{ uri: imageUri }}
                      style={modalStyles.resultImage}
                    />
                  )}

                  <View style={modalStyles.totalCard}>
                    <Text style={modalStyles.totalTitle}>Meal Totals</Text>
                    <View style={modalStyles.totalRow}>
                      <View style={modalStyles.totalItem}>
                        <Text style={modalStyles.totalVal}>
                          {Math.round(result.total_calories)}
                        </Text>
                        <Text style={modalStyles.totalLabel}>Calories</Text>
                      </View>
                      <View style={modalStyles.totalItem}>
                        <Text
                          style={[modalStyles.totalVal, { color: "#EF4444" }]}
                        >
                          {round1(result.total_protein)}g
                        </Text>
                        <Text style={modalStyles.totalLabel}>Protein</Text>
                      </View>
                      <View style={modalStyles.totalItem}>
                        <Text
                          style={[modalStyles.totalVal, { color: "#FBBF24" }]}
                        >
                          {round1(result.total_carbs)}g
                        </Text>
                        <Text style={modalStyles.totalLabel}>Carbs</Text>
                      </View>
                      <View style={modalStyles.totalItem}>
                        <Text
                          style={[modalStyles.totalVal, { color: "#38BDF8" }]}
                        >
                          {round1(result.total_fat)}g
                        </Text>
                        <Text style={modalStyles.totalLabel}>Fat</Text>
                      </View>
                    </View>
                    <View style={modalStyles.confidenceBadge}>
                      <Text style={modalStyles.confidenceBadgeText}>
                        {result.ai_confidence >= 80
                          ? "✅"
                          : result.ai_confidence >= 50
                            ? "⚠️"
                            : "❓"}{" "}
                        AI Confidence: {Math.round(result.ai_confidence)}%
                      </Text>
                    </View>
                  </View>

                  <Text style={modalStyles.itemsTitle}>Detected Items</Text>
                  {result.food_items.map((item, idx) => (
                    <FoodResultItem key={idx} item={item} />
                  ))}

                  <Pressable
                    style={({ pressed }) => [
                      modalStyles.doneBtn,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={handleDone}
                  >
                    <LinearGradient
                      colors={[Palette.success, "#10B981"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={modalStyles.doneBtnGradient}
                    >
                      <Text style={modalStyles.doneBtnText}>
                        ✓ Saved to {mealLabel}
                      </Text>
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      modalStyles.addAnotherBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      setMode("choose");
                      setResult(null);
                      setImageUri(null);
                      setTextInput("");
                    }}
                  >
                    <Text style={modalStyles.addAnotherText}>
                      + Log Another Item
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeAddFoodModalStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    container: {
      backgroundColor: P.bg,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      maxHeight: "92%",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.lg,
    },
    title: { fontSize: 22, fontWeight: "800", color: P.textPrimary },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: P.bgCard,
      alignItems: "center",
      justifyContent: "center",
    },
    closeText: { fontSize: 18, color: P.textSecondary },
    subtitle: {
      fontSize: 15,
      color: P.textSecondary,
      marginBottom: Spacing.xl,
    },
    errorBanner: {
      backgroundColor: P.errorMuted,
      padding: Spacing.md,
      borderRadius: Radii.md,
      marginBottom: Spacing.md,
    },
    errorText: { color: P.error, fontSize: 13, fontWeight: "600" },
    optionCard: {
      marginBottom: Spacing.md,
      borderRadius: Radii.lg,
      overflow: "hidden",
    },
    optionGradient: {
      flexDirection: "row",
      alignItems: "center",
      padding: Spacing.xl,
    },
    optionOutline: {
      flexDirection: "row",
      alignItems: "center",
      padding: Spacing.xl,
      borderWidth: 1,
      borderColor: P.border,
      borderRadius: Radii.lg,
      backgroundColor: P.bgCard,
    },
    optionIcon: { fontSize: 36, marginRight: Spacing.lg },
    optionInfo: { flex: 1 },
    optionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: P.white,
      marginBottom: 4,
    },
    optionDesc: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
    optionDescDark: { fontSize: 13, color: P.textSecondary },
    textSection: { marginTop: Spacing.md },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: Spacing.lg,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: P.border },
    dividerText: {
      color: P.textMuted,
      fontSize: 12,
      marginHorizontal: Spacing.md,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    textArea: {
      backgroundColor: P.bgInput,
      color: P.textPrimary,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: P.borderLight,
      padding: Spacing.lg,
      fontSize: 15,
      minHeight: 80,
    },
    analyzeBtn: {
      backgroundColor: P.accent,
      borderRadius: Radii.md,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: Spacing.md,
    },
    analyzeBtnText: { color: P.white, fontWeight: "700", fontSize: 15 },
    loadingWrap: { alignItems: "center", paddingVertical: Spacing["3xl"] },
    previewImage: { width: 200, height: 150, borderRadius: Radii.lg },
    loadingText: {
      fontSize: 16,
      fontWeight: "700",
      color: P.textPrimary,
      marginTop: Spacing.lg,
    },
    loadingSubtext: {
      fontSize: 13,
      color: P.textSecondary,
      marginTop: Spacing.sm,
      textAlign: "center",
    },
    resultImage: {
      width: "100%",
      height: 200,
      borderRadius: Radii.lg,
      marginBottom: Spacing.lg,
    },
    totalCard: {
      backgroundColor: P.bgCard,
      borderRadius: Radii.lg,
      padding: Spacing.xl,
      marginBottom: Spacing.lg,
      borderWidth: 1,
      borderColor: P.border,
    },
    totalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: P.textPrimary,
      marginBottom: Spacing.md,
    },
    totalRow: { flexDirection: "row", justifyContent: "space-between" },
    totalItem: { alignItems: "center" },
    totalVal: { fontSize: 20, fontWeight: "800", color: P.textPrimary },
    totalLabel: {
      fontSize: 10,
      color: P.textMuted,
      textTransform: "uppercase",
      marginTop: 2,
      letterSpacing: 0.3,
    },
    confidenceBadge: {
      marginTop: Spacing.md,
      paddingVertical: 6,
      paddingHorizontal: Spacing.md,
      backgroundColor: P.accentMuted,
      borderRadius: Radii.full,
      alignSelf: "center",
    },
    confidenceBadgeText: {
      fontSize: 12,
      fontWeight: "600",
      color: P.accentLight,
    },
    itemsTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: P.textPrimary,
      marginBottom: Spacing.md,
    },
    doneBtn: {
      borderRadius: Radii.lg,
      overflow: "hidden",
      marginTop: Spacing.md,
    },
    doneBtnGradient: { paddingVertical: 16, alignItems: "center" },
    doneBtnText: { color: P.white, fontSize: 16, fontWeight: "800" },
    addAnotherBtn: {
      paddingVertical: 14,
      alignItems: "center",
      marginTop: Spacing.sm,
    },
    addAnotherText: { color: P.accent, fontWeight: "700", fontSize: 14 },
  });
}

// ── Main Nutrition Screen ───────────────────────────────────
export default function NutritionScreen() {
  const { user, authReady } = useAuth();
  const { palette: Palette } = useTheme();
  const styles = useMemo(() => makeNutritionStyles(Palette), [Palette]);
  const [addMealType, setAddMealType] = useState<MealType>("breakfast");
  const [showAddModal, setShowAddModal] = useState(false);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { timedOut } = useLoadingGuard("NutritionScreen", refreshing);
  const [selectedLog, setSelectedLog] = useState<FoodLog | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLog, setEditingLog] = useState<FoodLog | null>(null);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodeMealType, setBarcodeMealType] = useState<MealType>("snack");

  const [calorieGoal, setCalorieGoal] = useState(2200);
  const [proteinGoal, setProteinGoal] = useState(180);
  const [carbsGoal, setCarbsGoal] = useState(250);
  const [fatGoal, setFatGoal] = useState(70);
  const [estDate, setEstDate] = useState(todayISO);

  // Load macro targets live from bio_profile (Supabase direct – no backend needed)
  const loadGoals = useCallback(async () => {
    if (!user || !authReady) return;
    try {
      const result = await getCurrentUserBioProfile();
      if (result.success && result.profile) {
        const p = result.profile;
        if (p.calorie_goal) setCalorieGoal(p.calorie_goal);
        if (p.protein_target) setProteinGoal(p.protein_target);
        if (p.carbs_target) setCarbsGoal(p.carbs_target);
        if (p.fat_target) setFatGoal(p.fat_target);
      }
    } catch (e) {
      log.warn("NutritionScreen", "Could not load macro targets: " + String(e));
    }
  }, [user, authReady]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    log.time("explore:loadData");
    try {
      const today = todayISO();
      const [summaryData, logsResult] = await Promise.all([
        getDailySummary(today),
        getFoodLogs(today, 100), // fetch up to 100 for today view
      ]);
      setSummary(summaryData);
      setTodayLogs(logsResult.data);
    } catch (e) {
      log.error(
        "NutritionScreen",
        "Failed to load nutrition data: " + String(e),
      );
      setLoadError("Could not load nutrition data.");
    } finally {
      setRefreshing(false);
      log.timeEnd("explore:loadData");
    }
  }, []);

  useEffect(() => {
    if (user && authReady) loadData();
  }, [user, authReady, loadData]);

  // ── Refresh on screen focus (keeps water + calorie goal in sync) ──
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadData();
        loadGoals();
      }
    }, [user, loadData, loadGoals]),
  );

  // ── Refresh when app comes to foreground ──────────────────
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && user) {
        loadData();
      }
    };
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [user, loadData]);

  // ── Detect EST day rollover and reload food logs at midnight EST ──────────
  useEffect(() => {
    const check = () => {
      const todayEst = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      });
      if (todayEst !== estDate) {
        setEstDate(todayEst);
        if (user) loadData();
      }
    };
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [estDate, user, loadData]);

  const handleAddMeal = (type: MealType) => {
    setAddMealType(type);
    setShowAddModal(true);
  };

  const handleDeleteLog = async (logId: string) => {
    Alert.alert("Delete Entry", "Remove this food log?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteFoodLog(logId);
          setSelectedLog(null); // Close detail modal
          loadData();
        },
      },
    ]);
  };

  const handleEditLog = (log: FoodLog) => {
    setSelectedLog(null);
    setTimeout(() => {
      setEditingLog(log);
      setShowEditModal(true);
    }, 300);
  };

  const handleEditSave = (updatedLog: FoodLog) => {
    setShowEditModal(false);
    setEditingLog(null);
    loadData();
  };

  const handleOpenBarcodeScanner = (mealType: MealType) => {
    setBarcodeMealType(mealType);
    setShowBarcodeModal(true);
  };

  const mealData = MEAL_ORDER.map((type) => {
    const logs = todayLogs.filter((l) => l.meal_type === type);
    const calories = logs.reduce((sum, l) => sum + (l.total_calories ?? 0), 0);
    const items: string[] = [];
    for (const log of logs) {
      if (log.food_items && log.food_items.length > 0) {
        // Use individual food item names from AI analysis
        for (const fi of log.food_items) {
          items.push(fi.food_name);
        }
      } else if (log.notes) {
        items.push(log.notes.replace("Text entry: ", ""));
      } else if (log.total_calories) {
        items.push(`${Math.round(log.total_calories)} cal meal`);
      }
    }
    return {
      type,
      icon: MEAL_ICONS[type],
      title: type.charAt(0).toUpperCase() + type.slice(1),
      calories,
      items,
      logs,
    };
  });

  const totalCals = summary?.total_calories ?? 0;
  const totalProtein = summary?.total_protein ?? 0;
  const totalCarbs = summary?.total_carbs ?? 0;
  const totalFat = summary?.total_fat ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Nutrition</Text>
        <Text style={styles.pageSub}>Track your meals & macros</Text>

        {/* Calorie Ring */}
        <View style={styles.calSection}>
          <CalorieRing consumed={totalCals} target={calorieGoal} />
          <View style={styles.calStats}>
            <View style={styles.calStat}>
              <Text style={styles.calStatVal}>
                {Math.round(totalCals).toLocaleString()}
              </Text>
              <Text style={styles.calStatLabel}>Eaten</Text>
            </View>
            <View style={styles.calStatDivider} />
            <View style={styles.calStat}>
              <Text style={styles.calStatVal}>
                {calorieGoal.toLocaleString()}
              </Text>
              <Text style={styles.calStatLabel}>Goal</Text>
            </View>
          </View>
        </View>

        {/* Macros */}
        <View style={styles.macroSection}>
          <Text style={styles.sectionTitle}>Macros</Text>
          <View style={styles.macroRow}>
            <MacroRing
              consumed={totalProtein}
              target={proteinGoal}
              label="Protein"
              color="#EF4444"
            />
            <MacroRing
              consumed={totalCarbs}
              target={carbsGoal}
              label="Carbs"
              color="#FBBF24"
            />
            <MacroRing
              consumed={totalFat}
              target={fatGoal}
              label="Fat"
              color="#38BDF8"
            />
          </View>
        </View>

        {/* Macro Progress Bars */}
        <View
          style={{
            backgroundColor: Palette.bgCard,
            borderRadius: Radii.xl,
            padding: Spacing.lg,
            marginBottom: Spacing.xl,
            borderWidth: 1,
            borderColor: Palette.border,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: Palette.textPrimary,
              marginBottom: Spacing.lg,
            }}
          >
            Daily Progress
          </Text>
          <MacroProgressBar
            label="Calories"
            consumed={totalCals}
            target={calorieGoal}
            color={Palette.accent}
            emoji="🔥"
          />
          <MacroProgressBar
            label="Protein"
            consumed={totalProtein}
            target={proteinGoal}
            color="#EF4444"
            emoji="🥩"
          />
          <MacroProgressBar
            label="Carbs"
            consumed={totalCarbs}
            target={carbsGoal}
            color="#FBBF24"
            emoji="🍞"
          />
          <MacroProgressBar
            label="Fat"
            consumed={totalFat}
            target={fatGoal}
            color="#38BDF8"
            emoji="🥑"
          />
        </View>

        {/* Meals */}
        <View style={styles.mealsHeader}>
          <Text style={styles.sectionTitle}>Today's Meals</Text>
          {refreshing && (
            <ActivityIndicator size="small" color={Palette.accent} />
          )}
        </View>

        {mealData.map((meal) => (
          <MealCard
            key={meal.type}
            icon={meal.icon}
            title={meal.title}
            calories={meal.calories}
            items={meal.items}
            onAdd={() => handleAddMeal(meal.type)}
          />
        ))}

        {/* Recent log entries with delete */}
        {todayLogs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Log Entries</Text>
            {todayLogs.map((log) => (
              <Pressable
                key={log.id}
                onPress={() => setSelectedLog(log)}
                onLongPress={() => handleDeleteLog(log.id)}
                style={({ pressed }) => [
                  styles.logEntry,
                  pressed && styles.logEntryPressed,
                ]}
              >
                <View style={styles.logEntryLeft}>
                  <View style={styles.logEntryIconContainer}>
                    <Text style={styles.logEntryIcon}>
                      {MEAL_ICONS[log.meal_type ?? "snack"]}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logEntryTitle} numberOfLines={2}>
                      {log.food_items && log.food_items.length > 0
                        ? log.food_items.map((fi) => fi.food_name).join(", ")
                        : log.notes
                          ? log.notes.replace("Text entry: ", "")
                          : `${Math.round(log.total_calories ?? 0)} cal meal`}
                    </Text>
                    <Text style={styles.logEntryTime}>
                      {log.meal_type
                        ? log.meal_type.charAt(0).toUpperCase() + log.meal_type.slice(1)
                        : "Meal"}{" · "}
                      {new Date(log.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                    {/* Macro preview pills */}
                    <View style={styles.macroPreview}>
                      <View
                        style={[
                          styles.macroPreviewPill,
                          { backgroundColor: "#FEE2E2" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.macroPreviewText,
                            { color: "#DC2626" },
                          ]}
                        >
                          {round1(log.total_protein ?? 0)}g P
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.macroPreviewPill,
                          { backgroundColor: "#FEF3C7" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.macroPreviewText,
                            { color: "#D97706" },
                          ]}
                        >
                          {round1(log.total_carbs ?? 0)}g C
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.macroPreviewPill,
                          { backgroundColor: "#DBEAFE" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.macroPreviewText,
                            { color: "#2563EB" },
                          ]}
                        >
                          {round1(log.total_fat ?? 0)}g F
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={styles.logEntryRight}>
                  <Text style={styles.logEntryCal}>
                    {Math.round(log.total_calories ?? 0)}
                  </Text>
                  <Text style={styles.logEntryCalUnit}>kcal</Text>
                  <View style={styles.tapIndicator}>
                    <Text style={styles.tapIndicatorText}>›</Text>
                  </View>
                </View>
              </Pressable>
            ))}
            <Text style={styles.logHint}>
              Tap to view details • Long-press to delete
            </Text>
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      <AddFoodModal
        visible={showAddModal}
        mealType={addMealType}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadData}
        onBarcodeScan={() => handleOpenBarcodeScanner(addMealType)}
      />

      <FoodLogDetailModal
        visible={selectedLog !== null}
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        onDelete={() => selectedLog && handleDeleteLog(selectedLog.id)}
        onEdit={() => selectedLog && handleEditLog(selectedLog)}
      />

      <EditFoodLogModal
        visible={showEditModal}
        log={editingLog}
        onClose={() => {
          setShowEditModal(false);
          setEditingLog(null);
        }}
        onSave={handleEditSave}
      />

      <BarcodeScannerModal
        visible={showBarcodeModal}
        mealType={barcodeMealType}
        onClose={() => setShowBarcodeModal(false)}
        onSuccess={loadData}
      />
    </SafeAreaView>
  );
}

function makeNutritionStyles(P: typeof DarkPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: P.bg },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
    pageTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: P.textPrimary,
      letterSpacing: -0.5,
    },
    pageSub: {
      fontSize: 14,
      color: P.textSecondary,
      marginTop: 4,
      marginBottom: Spacing.xl,
    },
    calSection: { alignItems: "center", marginBottom: Spacing["2xl"] },
    calStats: {
      flexDirection: "row",
      gap: Spacing["2xl"],
      marginTop: Spacing.lg,
      alignItems: "center",
    },
    calStat: { alignItems: "center" },
    calStatVal: { fontSize: 20, fontWeight: "800", color: P.textPrimary },
    calStatLabel: {
      fontSize: 11,
      color: P.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 2,
    },
    calStatDivider: { width: 1, height: 30, backgroundColor: P.border },
    macroSection: { marginBottom: Spacing.xl },
    macroRow: { flexDirection: "row", marginTop: Spacing.md },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: P.textPrimary,
      marginBottom: Spacing.md,
    },
    mealsHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.md,
    },
    logEntry: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: P.bgCard,
      borderRadius: Radii.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: P.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    logEntryPressed: {
      backgroundColor: P.bgElevated,
      transform: [{ scale: 0.98 }],
    },
    logEntryLeft: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.md,
      flex: 1,
    },
    logEntryIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: P.accentMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    logEntryIcon: { fontSize: 24 },
    logEntryTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: P.textPrimary,
    },
    logEntrySubtitle: {
      fontSize: 14,
      fontWeight: "500",
      color: P.textSecondary,
    },
    logEntryTime: {
      fontSize: 12,
      color: P.textMuted,
      marginTop: 2,
      marginBottom: Spacing.sm,
    },
    macroPreview: {
      flexDirection: "row",
      gap: Spacing.xs,
      flexWrap: "wrap",
    },
    macroPreviewPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    macroPreviewText: {
      fontSize: 11,
      fontWeight: "600",
    },
    logEntryRight: {
      alignItems: "flex-end",
      justifyContent: "center",
    },
    logEntryCal: {
      fontSize: 24,
      fontWeight: "800",
      color: P.accent,
      lineHeight: 28,
    },
    logEntryCalUnit: {
      fontSize: 11,
      color: P.textMuted,
      marginTop: -2,
    },
    tapIndicator: {
      marginTop: Spacing.xs,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: P.accentMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    tapIndicatorText: {
      fontSize: 18,
      fontWeight: "700",
      color: P.accent,
    },
    logEntryMacros: { fontSize: 10, color: P.textSecondary, marginTop: 2 },
    logHint: {
      fontSize: 11,
      color: P.textMuted,
      textAlign: "center",
      marginTop: Spacing.sm,
      marginBottom: Spacing.lg,
    },
  });
}
