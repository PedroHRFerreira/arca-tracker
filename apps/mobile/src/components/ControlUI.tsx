import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { PressFeedback } from '@/motion/Motion';
import { MoneyInput } from '@/components/MoneyInput';
import { colors, money } from '@/theme';

export const controlMoney = (cents: number) => money(cents / 100);
export const controlDateLabel = (date: string | null) => date ? date.slice(0, 10).split('-').reverse().join('/') : 'A informar';
export const controlMonthLabel = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

export function ControlField({ label, help, currency, ...props }: TextInputProps & { label: string; help?: string; currency?: boolean }) {
  const Input = currency ? MoneyInput : TextInput;
  return <View style={controlStyles.field}>
    <Text style={controlStyles.label}>{label}</Text>
    {!!help && <Text style={controlStyles.help}>{help}</Text>}
    <Input {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} style={[controlStyles.input, props.style]} />
  </View>;
}

export function ControlChoices<T extends string>({ label, value, onChange, options, help }: {
  label: string; value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[]; help?: string;
}) {
  return <View style={controlStyles.field}>
    <Text style={controlStyles.label}>{label}</Text>
    {!!help && <Text style={controlStyles.help}>{help}</Text>}
    <View style={controlStyles.wrap}>{options.map(option => <PressFeedback key={option.value} accessibilityRole="button"
      accessibilityLabel={option.label} accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)}
      style={[controlStyles.chip, value === option.value && controlStyles.selected]}>
      <Text style={[controlStyles.chipText, value === option.value && { color: '#FFF' }]}>{option.label}</Text>
    </PressFeedback>)}</View>
  </View>;
}

export function ControlToggle({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (value: boolean) => void }) {
  return <PressFeedback accessibilityRole="checkbox" accessibilityState={{ checked: value }} accessibilityLabel={label}
    onPress={() => onChange(!value)} style={controlStyles.toggle}>
    <View style={[controlStyles.check, value && controlStyles.selected]}><Text style={{ color: '#FFF', fontWeight: '800' }}>{value ? '✓' : ''}</Text></View>
    <View style={{ flex: 1 }}><Text style={controlStyles.label}>{label}</Text>{!!help && <Text style={controlStyles.help}>{help}</Text>}</View>
  </PressFeedback>;
}

export function ControlSection({ title, subtitle, action, children }: PropsWithChildren<{ title: string; subtitle?: string; action?: { label: string; onPress: () => void } }>) {
  return <View style={{ gap: 14 }}><View style={controlStyles.sectionHead}><View style={{ flex: 1 }}>
    <Text style={controlStyles.heading}>{title}</Text>{!!subtitle && <Text style={controlStyles.help}>{subtitle}</Text>}</View>
    {!!action && <PressFeedback accessibilityRole="button" onPress={action.onPress} style={controlStyles.smallAction}><Text style={controlStyles.actionText}>{action.label}</Text></PressFeedback>}
  </View>{children}</View>;
}

export function ControlRow({ title, detail, amount, hint, onPress, warning = false }: {
  title: string; detail?: string; amount?: string; hint?: string; onPress?: () => void; warning?: boolean;
}) {
  const content = <View style={controlStyles.row}>
    <View style={{ flex: 1, gap: 4 }}><Text style={controlStyles.rowTitle}>{title}</Text>{!!detail && <Text style={controlStyles.help}>{detail}</Text>}
      {!!hint && <Text style={[controlStyles.hint, warning && { color: '#9C5B18' }]}>{hint}</Text>}</View>
    {!!amount && <Text style={[controlStyles.rowAmount, warning && { color: '#9C5B18' }]}>{amount}</Text>}
    {!!onPress && <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>}
  </View>;
  return onPress ? <PressFeedback accessibilityRole="button" accessibilityLabel={`${title}${amount ? `, ${amount}` : ''}, ver detalhes`} onPress={onPress}>{content}</PressFeedback> : content;
}

export function ControlEmpty({ title, detail }: { title: string; detail: string }) {
  return <View style={controlStyles.empty}><Text style={controlStyles.rowTitle}>{title}</Text><Text style={controlStyles.help}>{detail}</Text></View>;
}

export function ControlTabs<T extends string>({ items, value, onChange }: { items: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
    {items.map(item => <PressFeedback accessibilityRole="tab" accessibilityState={{ selected: value === item.value }} key={item.value} onPress={() => onChange(item.value)}
      style={[controlStyles.chip, value === item.value && controlStyles.selected]}><Text style={[controlStyles.chipText, value === item.value && { color: '#FFF' }]}>{item.label}</Text></PressFeedback>)}
  </ScrollView>;
}

export const controlStyles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 150, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center' },
  heading: { color: colors.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.4, flexShrink: 1 },
  label: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  help: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  text: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  field: { gap: 5, marginBottom: 18 },
  input: { color: colors.ink, fontSize: 17, minHeight: 54, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, maxWidth: '100%', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 12, backgroundColor: '#E9EFEB', justifyContent: 'center' },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  toggle: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 19, paddingVertical: 6 },
  check: { width: 27, height: 27, borderRadius: 9, borderWidth: 1, borderColor: '#B5C5BA', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  sectionHead: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  smallAction: { minHeight: 44, padding: 11, backgroundColor: '#E8F0EB', borderRadius: 14, justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F0F3F1' },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  rowAmount: { color: colors.ink, fontSize: 15, fontWeight: '800', maxWidth: '100%' },
  hint: { color: colors.primary, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  empty: { borderRadius: 20, padding: 22, gap: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFF' },
  notice: { padding: 18, borderRadius: 20, gap: 8, backgroundColor: '#EDF3EF' },
  warning: { padding: 18, borderRadius: 20, gap: 8, backgroundColor: '#FFF4E4' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
});
