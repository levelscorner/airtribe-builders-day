import { useWindowDimensions } from "react-native";
import { layout } from "./theme";

/** Desktop web is a first-class layout. Phones and narrow browsers keep the 440 column. */
export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return width >= layout.desktop;
}
