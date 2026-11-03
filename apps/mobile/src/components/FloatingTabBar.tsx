import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressFeedback, useReducedMotion } from "@/motion/Motion";
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
  const itemWidth = Math.max(0, (width - 12) / destinations.length);
  useEffect(() => {
    if (reduced || !width) {
      x.setValue(index * itemWidth);
      return;
    }
    const movement = Animated.spring(x, {
      toValue: index * itemWidth,
      damping: 24,
      stiffness: 220,
      mass: 0.85,
      useNativeDriver: Platform.OS !== "web",
    });
    movement.start();
    return () => movement.stop();
  }, [index, itemWidth, reduced, width, x]);
  const height = 76 + Math.max(0, fontScale - 1) * 62;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.position, { bottom: Math.max(insets.bottom, 12), left: screenWidth < 360 ? 8 : 16, right: screenWidth < 360 ? 8 : 16 }]}
    >
      <View style={styles.shadow}>
        <BlurView
          intensity={72}
          tint="systemChromeMaterialLight"
          style={[styles.glass, { minHeight: height }]}
        >
          <View
            accessibilityRole="tablist"
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            style={[styles.items, { minHeight: height }]}
          >
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
                <PressFeedback
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
                  style={styles.item}
                >
                  <Ionicons
                    name={focused ? item.activeIcon : item.icon}
                    size={23}
                    color={focused ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[styles.label, focused && styles.activeLabel]}
                  >
                    {item.title}
                  </Text>
                </PressFeedback>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  position: { position: "absolute", left: 16, right: 16 },
  shadow: {
    borderRadius: 38,
    shadowColor: "#163B2D",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 12,
  },
  glass: {
    borderRadius: 38,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FFFFFFD9",
    backgroundColor: "#F7FAF8D9",
  },
  items: { flexDirection: "row", alignItems: "stretch", padding: 6 },
  selection: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: 6,
    backgroundColor: "#DCEBE3",
    borderRadius: 32,
  },
  item: {
    flex: 1,
    minWidth: 0,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 6,
    minHeight: 58,
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
