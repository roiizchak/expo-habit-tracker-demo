/**
 * CoachCard — presentational card for AI coaching output (nudge or reflection).
 * Amber-accented surface that matches the Home challenge card / Insights panels.
 * Loading + empty states are handled here; data fetching lives in the screens.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, space, tintOf, type as typo } from '../theme/tokens';

export function CoachCard({
  title,
  emoji = '✨',
  text,
  loading,
  placeholder = 'No coaching yet.',
  footer,
  textTestID,
  style,
}: {
  title: string;
  emoji?: string;
  text: string | null;
  loading?: boolean;
  placeholder?: string;
  footer?: React.ReactNode;
  textTestID?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
        {loading ? <ActivityIndicator size="small" color={colors.amber} /> : null}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}

      {text ? (
        <Text style={styles.body} testID={textTestID}>
          {text}
        </Text>
      ) : (
        <Text style={[styles.body, styles.placeholder]} testID={textTestID}>
          {loading ? 'Thinking…' : placeholder}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: tintOf(colors.amber, 0.5),
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  emoji: { fontSize: 20 },
  title: { ...typo.bodyStrong, color: colors.ink, flex: 1 },
  footer: { gap: space.md },
  body: { ...typo.body, color: colors.inkSecondary },
  placeholder: { color: colors.inkMuted, fontStyle: 'italic' },
});
