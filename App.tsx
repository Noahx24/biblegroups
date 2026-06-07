import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { AuthProvider } from '@/hooks/useAuth';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { navigationTheme } from '@/theme';
import { setNotificationHandler } from '@/lib/push';
import { navigationRef } from '@/lib/navigationRef';
import type { AppStackParamList } from '@/navigation/RootNavigator';
import * as Sentry from '@sentry/react-native';
import { initLogger, registerNavigation } from '@/lib/logger';

// Deep-linking map. churchflow:// + the Expo dev URL resolve to the main tabs;
// e.g. churchflow://my-week opens the My Week tab. GroupDetail is intentionally
// omitted — it needs a full group object as a route param that a URL can't
// reconstruct, so we route there in-app instead.
const linking: LinkingOptions<AppStackParamList> = {
  prefixes: [Linking.createURL('/'), 'churchflow://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Groups: 'groups',
          'My Week': 'my-week',
          News: 'news',
          Family: 'family',
          Profile: 'profile',
        },
      },
      Admin: 'admin',
    },
  },
};

// Init Sentry first so any failure during the rest of bootstrap or the
// component tree can still be captured. initLogger is a no-op when
// EXPO_PUBLIC_SENTRY_DSN is not set.
initLogger();

// Install the foreground notification handler before any render — push
// notifications arriving while the app is open show as banners.
setNotificationHandler();

function App() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!navigationRef.isReady()) return;
      // Assignment / reminder pushes carry a slot — send the user to My Week,
      // where their upcoming slots (and the assignment banner) are shown.
      const data = response.notification.request.content.data as { slot_id?: string } | undefined;
      if (data?.slot_id) {
        navigationRef.navigate('MainTabs', { screen: 'My Week' });
      } else {
        navigationRef.navigate('MainTabs');
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer
            theme={navigationTheme}
            ref={navigationRef}
            linking={linking}
            onReady={() => {
              // Wire navigation transitions into Sentry once the container is live.
              registerNavigation(navigationRef);
            }}
          >
            <RootNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// Wrap the root so React render-tree errors, touch/replay events, and app-start
// instrumentation are captured. No-op effect when Sentry isn't initialized.
export default Sentry.wrap(App);
