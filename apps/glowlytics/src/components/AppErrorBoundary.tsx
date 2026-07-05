/**
 * AppErrorBoundary — top-level shield around the entire Stack tree.
 *
 * In React Native + Expo Router, an uncaught render error inside a screen
 * tears down the JS context and re-bootstraps from index.tsx. The user sees
 * the splash and ends up back on `/auth/sign-in` because Clerk's session
 * restore races the splash. That's the "the app crashes and dumps me at
 * sign-in" UX bug.
 *
 * This boundary swallows render-time errors at the navigator level and
 * shows an inline recovery card instead. We never lose the session.
 *
 * Caveats:
 *  - Errors in async callbacks (Promise rejections, setTimeout) are NOT
 *    caught by React error boundaries. Each interactive surface still needs
 *    its own try/catch — see AddProductSheet for the canonical pattern.
 *  - When `key` is bumped via the reset action, React re-mounts the entire
 *    subtree. The captured Clerk session + Zustand store are untouched.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontFamily, Glow } from '../constants/theme';
import { trackEvent } from '../services/analytics';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  resetKey: number;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: '', resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'Unknown error',
    };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Best-effort telemetry — never throws.
    try {
      trackEvent('render_error_caught', {
        message: error?.message?.slice(0, 200) ?? 'unknown',
        component_stack: (info?.componentStack ?? '').slice(0, 500),
      });
    } catch {
      /* ignore */
    }
    if (__DEV__) {
      console.error('[AppErrorBoundary]', error, info?.componentStack);
    }
  }

  handleReset = () => {
    // Bump the key on `children` to remount the entire subtree. State that
    // lives in Zustand or refs survives — only the React-tree state resets.
    this.setState((s) => ({ hasError: false, errorMessage: '', resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      const P = Glow.palette;
      return (
        <View style={[styles.host, { backgroundColor: P.bg }]}>
          <View style={[styles.card, { backgroundColor: P.surface, borderColor: P.glow }]}>
            <Text style={[styles.eyebrow, { color: P.muted }]}>SOMETHING TRIPPED</Text>
            <Text style={[styles.title, { color: P.ink }]}>
              That shouldn't have happened.
            </Text>
            <Text style={[styles.body, { color: P.muted }]}>
              We've logged it. Tap below to come back. Your data is still on the device.
            </Text>
            {__DEV__ && (
              <Text style={[styles.devMsg, { color: P.muted }]} numberOfLines={4}>
                {this.state.errorMessage}
              </Text>
            )}
            <Pressable
              onPress={this.handleReset}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: P.ink }]}
            >
              <Text style={[styles.btnText, { color: P.surface }]}>Try again</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontSize: 22,
    textAlign: 'center',
    marginTop: 8,
  },
  body: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
  },
  devMsg: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
  },
  btn: {
    marginTop: 22,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  btnText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
  },
});
