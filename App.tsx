import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '@/hooks/useAuth';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { navigationTheme } from '@/theme';
import { setNotificationHandler } from '@/lib/push';
import { navigationRef } from '@/lib/navigationRef';

// Install the foreground notification handler before any render — push
// notifications arriving while the app is open show as banners.
setNotificationHandler();

export default function App() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      // Bring the user to the app; detailed deep-linking handled by the navigator.
      if (navigationRef.isReady()) {
        navigationRef.navigate('MainTabs');
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer theme={navigationTheme} ref={navigationRef}>
            <RootNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
