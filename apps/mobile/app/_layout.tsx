import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "../App";
import { useWebDocumentKeyboard } from "../src/chat/useKeyboardInset";
import { colors } from "../src/theme";

export default function RootLayout() {
  useWebDocumentKeyboard();
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
        }}
      />
    </AppProviders>
  );
}
