import type { ClassAllocation } from "@arca/domain";
import Svg, { Circle, G } from "react-native-svg";
import { Text, View } from "react-native";
import { arcaColors, colors } from "@/theme";

export function DonutChart({
  allocations,
  size = 180,
}: {
  allocations: ClassAllocation[];
  size?: number;
}) {
  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 180 180">
        <G rotation="-90" origin="90,90">
          <Circle
            cx="90"
            cy="90"
            r={radius}
            stroke="#EDF0F5"
            strokeWidth="22"
            fill="none"
          />
          {allocations.map((item) => {
            const length = (circumference * Number(item.percent)) / 100;
            const node = (
              <Circle
                key={item.arcaClass}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={arcaColors[item.arcaClass]}
                strokeWidth="22"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return node;
          })}
        </G>
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontWeight: "900", color: colors.ink, fontSize: 16 }}>
          ARCA
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>carteira</Text>
      </View>
    </View>
  );
}
