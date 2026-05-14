import { createNavigationContainerRef } from '@react-navigation/native';
import type { AppStackParamList } from '@/navigation/RootNavigator';

export const navigationRef = createNavigationContainerRef<AppStackParamList>();
