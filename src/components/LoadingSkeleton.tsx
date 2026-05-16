// Lightweight shimmer placeholder used in place of a bare spinner while
// list screens fetch. Animated.loop opacity gives a soft pulse without
// pulling in reanimated or a gradient library - good enough for our needs.
//
// Usage:
//   <SkeletonRow />                  // single 96px-tall card
//   <SkeletonList rows={4} />        // a list of stacked cards
//   <SkeletonBlock width="60%" />    // single block for custom layouts

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '@/theme';

function useShimmerOpacity() {
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}

export function SkeletonBlock({
  width = '100%',
  height = 12,
  style,
}: {
  width?: ViewStyle['width'];
  height?: number;
  style?: ViewStyle;
}) {
  const opacity = useShimmerOpacity();
  return (
    <Animated.View
      style={[styles.block, { width, height, opacity }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function SkeletonRow() {
  return (
    <View style={styles.card} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <View style={styles.accent} />
      <View style={styles.body}>
        <SkeletonBlock width="55%" height={16} />
        <SkeletonBlock width="90%" height={12} style={{ marginTop: 8 }} />
        <SkeletonBlock width="70%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <View style={styles.list} accessibilityLiveRegion="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.borderSoft,
    borderRadius: radius.sm,
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.md },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    ...shadow.card,
  },
  accent: { width: 4, backgroundColor: colors.borderSoft },
  body: { flex: 1, padding: spacing.lg },
});
