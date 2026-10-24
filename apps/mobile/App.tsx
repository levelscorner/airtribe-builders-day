import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

/**
 * Docs/14 names this file. Navigation itself is expo-router (`app/`),
 * so web and Expo Go share the same signup → chat routes.
 * The studio client is a process singleton in src/api.ts (mock, no network).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}
