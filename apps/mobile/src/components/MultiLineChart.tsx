import Svg, { Line, Polyline } from "react-native-svg";
import { colors } from "@/theme";

export function MultiLineChart({
  series,
  height = 180,
}: {
  series: Array<{ values: number[]; color: string }>;
  height?: number;
}) {
  const width = 320;
  const allValues = series.flatMap((item) => item.values);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 1);
  const span = max - min || 1;
  const points = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${(index / Math.max(values.length - 1, 1)) * width},${height - ((value - min) / span) * (height - 20) - 10}`,
      )
      .join(" ");
  return (
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
      {series.map((item) => (
        <Polyline
          key={item.color}
          points={points(item.values)}
          fill="none"
          stroke={item.color}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}
