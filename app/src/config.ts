import Constants from "expo-constants";

/**
 * API base URL.
 * - Web / local: http://localhost:8787
 * - Expo Go on phone: set EXPO_PUBLIC_API_URL to your Replit server URL
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  extra.apiBaseUrl ||
  "http://localhost:8787"
).replace(/\/$/, "");
