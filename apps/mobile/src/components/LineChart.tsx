import Svg, { Line, Polyline } from "react-native-svg";
import { View } from "react-native";
import { colors } from "@/theme";

export function LineChart({
  series,
  color = colors.primary,
  height = 180,
}: {
  series: number[];
  color?: string;
  height?: number;
}) {
  const width = 320;
  const min = Math.min(...series, 0);
  const max = Math.max(...series, 1);
  const span = max - min || 1;
  const points = series
    .map(
      (value, index) =>
        `${(index / Math.max(series.length - 1, 1)) * width},${height - ((value - min) / span) * (height - 20) - 10}`,
    )
    .join(" ");
  return (
    <View style={{ overflow: "hidden" }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <Line
            key={fraction}
            x1="0"
            x2={width}
            y1={height * fraction}
            y2={height * fraction}
            stroke={colors.border}
            strokeDasharray="4 5"
          />
        ))}
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
