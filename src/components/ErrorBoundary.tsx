import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { captureException } from '@/lib/logger';
import { colors, radius, spacing } from '@/theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

// React's only first-class error-recovery primitive is still a class
// component with componentDidCatch, so we keep this small and dependency-free.
// Any unhandled render error inside `children` lands here instead of the
// white screen of death; the user can tap "Try again" to remount the tree.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    captureException(error, { componentStack: info.componentStack });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          The app hit an unexpected error. The team has been notified.
        </Text>
        <Text style={styles.detail} numberOfLines={4}>
          {this.state.error.message}
        </Text>
        <Pressable
          onPress={this.reset}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary },
  message: { fontSize: 15, color: colors.text, textAlign: 'center' },
  detail: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  retry: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
