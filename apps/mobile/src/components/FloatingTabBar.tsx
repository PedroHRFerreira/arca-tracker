import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "@/motion/Motion";
import { colors } from "@/theme";

type TabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];
const destinations = [
  {
    name: "dashboard",
    title: "Início",
    icon: "home-outline",
    activeIcon: "home",
  },
  { name: "finances", title: "Finanças", icon: "card-outline", activeIcon: "card" },
  { name: "plan", title: "Meu plano", icon: "map-outline", activeIcon: "map" },
  {
    name: "assets",
    title: "Carteira",
    icon: "wallet-outline",
    activeIcon: "wallet",
  },
  {
    name: "evolution",
    title: "Evolução",
    icon: "stats-chart-outline",
    activeIcon: "stats-chart",
  },
] as const;

export function FloatingTabBar({ state, navigation }: TabBarProps) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { fontScale, width: screenWidth } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const measuredWidth = useRef(0);
  const x = useRef(new Animated.Value(0)).current;
  const routeName = state.routes[state.index]?.name;
  const selected =
    routeName === "rebalance"
      ? "plan"
      : ["history", "projection"].includes(routeName ?? "")
        ? "evolution"
        : routeName;
  const index = Math.max(
    0,
    destinations.findIndex((item) => item.name === selected),
  );
  const itemWidth = Math.max(0, width / destinations.length);
  useEffect(() => {
    if (reduced || !width || measuredWidth.current !== width) {
      x.setValue(index * itemWidth);
      measuredWidth.current = width;
      return;
    }
    const movement = Animated.timing(x, {
      toValue: index * itemWidth,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    movement.start();
    return () => movement.stop();
  }, [index, itemWidth, reduced, width, x]);
  const height = 64 + Math.max(0, fontScale - 1) * 54;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.position, { paddingBottom: insets.bottom, backgroundColor: colors.surface }]}
    >
      <View style={[styles.items, { minHeight: height }]} accessibilityRole="tablist" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {!!width && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.selection,
              { width: itemWidth, transform: [{ translateX: x }] },
            ]}
          />
        )}
        {destinations.map((item) => {
          const route = state.routes.find(
            (candidate) => candidate.name === item.name,
          );
          if (!route) return null;
          const focused = selected === item.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={item.title}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented)
                  navigation.navigate(route.name, route.params);
              }}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.65 }]}
            >
              <Ionicons
                name={focused ? item.activeIcon : item.icon}
                size={23}
                color={focused ? colors.primary : colors.muted}
              />
              <Text
                maxFontSizeMultiplier={1.2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                numberOfLines={1}
                testID="main-navigation-label"
                style={[styles.label, screenWidth < 360 && { fontSize: 10 }, focused && styles.activeLabel]}
              >
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  position: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: colors.border },
  items: { flexDirection: "row", alignItems: "stretch" },
  selection: { position: "absolute", top: 0, left: 0, height: 3, backgroundColor: colors.primary },
  item: {
    flex: 1,
    minWidth: 0,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 6,
    minHeight: 60,
  },
  label: {
    alignSelf: "stretch",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    color: colors.muted,
    fontWeight: "600",
  },
  activeLabel: { color: colors.primary, fontWeight: "800" },
});
