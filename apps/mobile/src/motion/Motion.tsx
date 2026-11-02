import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const ReducedMotionContext = createContext(true);
const nativeDriver = Platform.OS !== "web";
export function MotionProvider({ children }: PropsWithChildren) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return (
    <ReducedMotionContext.Provider value={reduced}>
      {children}
    </ReducedMotionContext.Provider>
  );
}
export const useReducedMotion = () => useContext(ReducedMotionContext);

export function Reveal({
  children,
  style,
  delay = 0,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; delay?: number }>) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay: Math.min(delay, 180),
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: nativeDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, delay, progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function PressFeedback({
  style,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  ...props
}: PressableProps) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const animate = (toValue: number) => {
    scale.stopAnimation();
    if (reduced) scale.setValue(1);
    else
      Animated.spring(scale, {
        toValue,
        speed: 28,
        bounciness: 2,
        useNativeDriver: nativeDriver,
      }).start();
  };
  return (
    <AnimatedPressable
      {...props}
      {...(Platform.OS === "web"
        ? {
            "aria-checked":
              props["aria-checked"] ?? props.accessibilityState?.checked,
            "aria-selected":
              props["aria-selected"] ?? props.accessibilityState?.selected,
            "aria-expanded":
              props["aria-expanded"] ?? props.accessibilityState?.expanded,
            "aria-busy": props["aria-busy"] ?? props.accessibilityState?.busy,
          }
        : {})}
      onPressIn={(event) => {
        setPressed(true);
        animate(0.97);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        animate(1);
        onPressOut?.(event);
      }}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      style={[
        typeof style === "function" ? style({ pressed, hovered }) : style,
        { transform: [{ scale }] },
      ]}
    />
  );
}

/** Fade the outgoing content before replacing it, then slide the incoming content into place. */
export function useContentTransition() {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const offset = useRef(new Animated.Value(0)).current;
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      progress.stopAnimation();
      offset.stopAnimation();
    };
  }, [progress, offset]);
  const [transitioning, setTransitioning] = useState(false);
  const transition = (replace: () => void, direction = 1): Promise<void> => {
    if (running.current) return Promise.resolve();
    if (reduced) {
      replace();
      return Promise.resolve();
    }
    running.current = true;
    setTransitioning(true);
    return new Promise((resolve) => {
      Animated.parallel([
        Animated.timing(progress, {
          toValue: 0,
          duration: 90,
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(offset, {
          toValue: -8 * direction,
          duration: 90,
          useNativeDriver: nativeDriver,
        }),
      ]).start(({ finished }) => {
        if (!finished || !mounted.current) {
          running.current = false;
          if (mounted.current) setTransitioning(false);
          resolve();
          return;
        }
        replace();
        offset.setValue(12 * direction);
        Animated.parallel([
          Animated.timing(progress, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: nativeDriver,
          }),
          Animated.timing(offset, {
            toValue: 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: nativeDriver,
          }),
        ]).start(() => {
          running.current = false;
          if (mounted.current) setTransitioning(false);
          resolve();
        });
      });
    });
  };
  return {
    transition,
    transitioning,
    motionStyle: { opacity: progress, transform: [{ translateX: offset }] },
  };
}
