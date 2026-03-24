/**
 * Food Recognition Service
 *
 * Calls Supabase Edge Functions for:
 * - Image-based food recognition (camera/gallery photos → AI nutrition analysis)
 * - Text-based food recognition (meal descriptions → AI nutrition estimate)
 * - Food log CRUD
 * - Barcode lookup
 *
 * Edge functions run on Supabase infrastructure — no separate backend needed.
 */

import { supabase } from "@/constants/supabase";
import { Platform } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// ── Types ──────────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type AIFoodItem = {
  food_name: string;
  serving_size: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
};

export type AIRecognitionResult = {
  food_items: AIFoodItem[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  ai_confidence: number;
  source: "openai" | "custom_model" | "hybrid" | "manual";
  raw_response?: string;
};

export type FoodLog = {
  id: string;
  user_id: string;
  image_url: string | null;
  total_calories: number | null;
  total_protein: number | null;
  total_carbs: number | null;
  total_fat: number | null;
  ai_confidence: number | null;
  logged_date: string;
  meal_type: string | null;
  notes: string | null;
  created_at: string;
  food_items?: AIFoodItem[];
  edited?: boolean;
  original_calories?: number | null;
  original_protein?: number | null;
  original_carbs?: number | null;
  original_fat?: number | null;
  source?: string | null;
  barcode?: string | null;
};

export type PaginatedResponse<T> = {
  data: T[];
  count: number;
  next_cursor: string | null;
  has_more: boolean;
};

export type DailySummary = {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  meal_count: number;
  meals_by_type: Record<
    string,
    {
      count: number;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }
  >;
};

// ── Helper: invoke edge function ───────────────────────────

async function invokeFunction<T>(
  functionName: string,
  body: object,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body,
  });
  if (error) {
    // Extract the actual error body from the response for better debugging
    let detail = (error as any)?.message ?? `Edge function ${functionName} failed`;
    try {
      const ctx = (error as any)?.context;
      if (ctx instanceof Response) {
        const text = await ctx.text();
        detail = text || detail;
      } else if (ctx) {
        detail = JSON.stringify(ctx);
      }
    } catch {}
    const lowerDetail = String(detail).toLowerCase();
    const isAuthError =
      lowerDetail.includes("unauthorized") ||
      lowerDetail.includes("not authenticated") ||
      lowerDetail.includes("invalid or expired session");

    // During auth transitions (sign-in/sign-out), edge functions can briefly
    // return 401 before the session is fully restored. Avoid noisy error logs.
    if (!isAuthError) {
      console.error(`[${functionName}] error:`, detail);
    }
    throw new Error(detail);
  }
  return data as T;
}

// ── Food Recognition ───────────────────────────────────────

/**
 * Compress and convert a local image URI to a base64 string.
 * Resizes to max 1024px and compresses to ~70% to stay within
 * Supabase Edge Function request body limits.
 */
async function imageUriToBase64(
  uri: string,
): Promise<{ base64: string; mimeType: string }> {
  const mimeType = "image/jpeg";

  if (Platform.OS === "web") {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve({ base64: dataUrl.split(",")[1], mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Compress on native: resize to max 1024px wide, 70% JPEG quality
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1024 });
  const imageRef = await ctx.renderAsync();
  const compressed = await imageRef.saveAsync({
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });

  return { base64: compressed.base64!, mimeType };
}

/** Returns today's date in EST timezone (YYYY-MM-DD). */
function getTodayEST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Send a food photo to the AI for analysis.
 */
export async function recognizeFoodImage(
  imageUri: string,
  mealType?: MealType,
  saveLog: boolean = true,
): Promise<AIRecognitionResult> {
  try {
    const { base64, mimeType } = await imageUriToBase64(imageUri);
    return await invokeFunction<AIRecognitionResult>("analyze-food", {
      type: "image",
      imageBase64: base64,
      mimeType,
      mealType,
      saveLog,
      loggedDate: getTodayEST(),
    });
  } catch (error: any) {
    throw new Error(error?.message ?? "Food analysis failed. Please try again.");
  }
}

/**
 * Send a text description of food to the AI for analysis.
 */
export async function recognizeFoodText(
  description: string,
  mealType?: MealType,
  saveLog: boolean = true,
): Promise<AIRecognitionResult> {
  try {
    return await invokeFunction<AIRecognitionResult>("analyze-food", {
      type: "text",
      description,
      mealType,
      saveLog,
      loggedDate: getTodayEST(),
    });
  } catch (error: any) {
    throw new Error(error?.message ?? "Food analysis failed");
  }
}

// ── Food Logs ──────────────────────────────────────────────

export async function getFoodLogs(
  targetDate?: string,
  limit: number = 20,
  cursor?: string | null,
): Promise<PaginatedResponse<FoodLog>> {
  try {
    const result = await invokeFunction<any>("food-logs", {
      action: "list",
      targetDate,
      limit,
      cursor,
    });
    return {
      data: result.data ?? [],
      count: result.count ?? 0,
      next_cursor: result.next_cursor ?? null,
      has_more: result.has_more ?? false,
    };
  } catch {
    return { data: [], count: 0, next_cursor: null, has_more: false };
  }
}

export async function getDailySummary(
  targetDate: string,
): Promise<DailySummary | null> {
  try {
    const result = await invokeFunction<any>("food-logs", {
      action: "summary",
      targetDate,
    });
    return result.data ?? null;
  } catch {
    return null;
  }
}

export async function deleteFoodLog(foodLogId: string): Promise<boolean> {
  try {
    await invokeFunction("food-logs", { action: "delete", foodLogId });
    return true;
  } catch {
    return false;
  }
}

export async function getFoodLogDetail(
  foodLogId: string,
): Promise<FoodLog | null> {
  try {
    const result = await invokeFunction<any>("food-logs", {
      action: "detail",
      foodLogId,
    });
    return result.data ?? null;
  } catch {
    return null;
  }
}

// ── Barcode ────────────────────────────────────────────────

export type BarcodeProduct = {
  barcode: string;
  product_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: string | null;
  image_url: string | null;
  brand: string | null;
  found: boolean;
};

export async function lookupBarcode(
  barcode: string,
): Promise<BarcodeProduct | null> {
  try {
    return await invokeFunction<BarcodeProduct>("barcode", {
      action: "lookup",
      barcode,
    });
  } catch (error: any) {
    if (
      error?.message?.includes("404") ||
      error?.message?.includes("not found")
    ) {
      return null;
    }
    console.error("[Barcode] Lookup failed:", error?.message);
    return null;
  }
}

export async function logBarcodeFood(params: {
  barcode: string;
  product_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size?: string | null;
  meal_type: MealType;
}): Promise<boolean> {
  try {
    await invokeFunction("barcode", {
      action: "log",
      barcode: params.barcode,
      productName: params.product_name,
      calories: params.calories,
      protein: params.protein,
      carbs: params.carbs,
      fat: params.fat,
      servingSize: params.serving_size,
      mealType: params.meal_type,
      loggedDate: getTodayEST(),
    });
    return true;
  } catch {
    return false;
  }
}

// ── Edit Food Log ──────────────────────────────────────────

export type FoodLogUpdateParams = {
  total_calories?: number;
  total_protein?: number;
  total_carbs?: number;
  total_fat?: number;
  serving_size?: string;
  notes?: string;
};

export async function updateFoodLog(
  foodLogId: string,
  updates: FoodLogUpdateParams,
): Promise<FoodLog | null> {
  try {
    const result = await invokeFunction<any>("food-logs", {
      action: "update",
      foodLogId,
      totalCalories: updates.total_calories,
      totalProtein: updates.total_protein,
      totalCarbs: updates.total_carbs,
      totalFat: updates.total_fat,
      notes: updates.notes,
    });
    return result.data ?? null;
  } catch {
    return null;
  }
}

// ── Macro Targets ──────────────────────────────────────────

export type MacroTargets = {
  calorie_goal: number | null;
  protein_target: number | null;
  carbs_target: number | null;
  fat_target: number | null;
};

export async function getMacroTargets(): Promise<MacroTargets | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", session.user.id)
      .single();
    if (!userData) return null;

    const { data } = await supabase
      .from("bio_profile")
      .select("calorie_goal, protein_target, carbs_target, fat_target")
      .eq("user_id", userData.id)
      .single();

    if (!data) return null;
    return {
      calorie_goal: data.calorie_goal ?? null,
      protein_target: data.protein_target ?? null,
      carbs_target: data.carbs_target ?? null,
      fat_target: data.fat_target ?? null,
    };
  } catch {
    return null;
  }
}

export async function updateMacroTargets(
  targets: Partial<MacroTargets>,
): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;

    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", session.user.id)
      .single();
    if (!userData) return false;

    const { error } = await supabase
      .from("bio_profile")
      .update({
        calorie_goal: targets.calorie_goal,
        protein_target: targets.protein_target,
        carbs_target: targets.carbs_target,
        fat_target: targets.fat_target,
      })
      .eq("user_id", userData.id);

    return !error;
  } catch {
    return false;
  }
}
