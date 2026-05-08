import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native'; 
import { DefaultTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import StackNavigator from './src/navigation/StackNavigation';
import { getCurrentUser, savePushTokenApi } from './src/services/api';
import {
  getToken,
  getUserProfile,
  removeToken,
  removeUserProfile,
  saveUserProfile,
  subscribeToUserProfile,
} from './src/services/authStorage';
import {
  isSubscriptionRestricted,
  resolvePostAuthRoute,
  resolveUserRole,
} from './src/services/subscriptionAccess';
import { ThemeProvider } from './src/context/ThemeContext';

export const navigationRef = createNavigationContainerRef();

const appNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F8FFF1',
    card: '#FFFFFF',
    border: 'rgba(57, 224, 31, 0.12)',
    primary: '#39E01F',
  },
};

export default function App() {
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>();
  const [initialRouteName, setInitialRouteName] = useState<
    'Login' | 'Home' | 'Barber-Home' | 'Subscription-Settings'
  >('Login');
  const [sessionReady, setSessionReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  useEffect(() => {
    return subscribeToUserProfile(user => {
      setCurrentUser(user);
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      try {
        const token = await getToken();
        const storedUser = await getUserProfile();

        if (!token) {
          if (isMounted) {
            setInitialRouteName('Login');
            setCurrentUser(null);
          }
          return;
        }

        try {
          const response = await getCurrentUser();
          await saveUserProfile(response.user);

          if (isMounted) {
            setCurrentUser(response.user);
            setInitialRouteName(resolvePostAuthRoute(response.user));
          }
        } catch (error: any) {
          const unauthorized = error?.status === 401 || error?.status === 403;

          if (unauthorized) {
            await removeToken();
            await removeUserProfile();

            if (isMounted) {
              setInitialRouteName('Login');
              setCurrentUser(null);
            }
          } else if (isMounted) {
            if (storedUser) {
              await saveUserProfile(storedUser);
              setCurrentUser(storedUser);
            }
            setInitialRouteName(storedUser ? resolvePostAuthRoute(storedUser) : 'Login');
          }
        }
      } finally {
        if (isMounted) {
          setSessionReady(true);
        }
      }
    };

    bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, []);

useEffect(() => {
  let unsubscribeRefresh: (() => void) | undefined;
  let unsubscribeForeground: (() => void) | undefined;

  const initNotifications = async () => {
    try {
      await messaging().registerDeviceForRemoteMessages();

      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        const token = await messaging().getToken();
        console.log("✅ TOKEN:", token);
        await AsyncStorage.setItem('@push_token', token);
        try {
          await savePushTokenApi(token);
        } catch (err: any) {
          console.log('No se pudo enviar token al backend:', err?.message);
        }
      }

      unsubscribeRefresh = messaging().onTokenRefresh(async newToken => {
        await AsyncStorage.setItem('@push_token', newToken);
        try {
          await savePushTokenApi(newToken);
        } catch (err: any) {
          console.log('No se pudo enviar token refrescado:', err?.message);
        }
      });

      unsubscribeForeground = messaging().onMessage(async remoteMessage => {
        Alert.alert(
          remoteMessage.notification?.title || 'Notificación',
          remoteMessage.notification?.body || 'Tienes una nueva notificación'
        );
      });
    } catch (e) {
      console.log("Error en initNotifications:", e);
    }
  };

  initNotifications();

  return () => {
    unsubscribeForeground?.();
    unsubscribeRefresh?.();
  };
	}, []);

  if (!sessionReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <View
            style={{
              flex: 1,
              backgroundColor: '#F8FFF1',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator size="large" color="#39E01F" />
          </View>
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  const isSubscriptionLocked = isSubscriptionRestricted(currentUser?.subscription?.status);
	
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <View style={{ flex: 1, backgroundColor: '#F8FFF1' }}>
          <NavigationContainer
            theme={appNavigationTheme}
            ref={navigationRef}
            onReady={() => {
              setCurrentRouteName(navigationRef.getCurrentRoute()?.name);
            }}
            onStateChange={() => {
              setCurrentRouteName(navigationRef.getCurrentRoute()?.name);
            }}
          >
            <StackNavigator
              currentRouteName={currentRouteName}
              initialRouteName={initialRouteName}
              isSubscriptionLocked={isSubscriptionLocked}
              currentUserRole={resolveUserRole(currentUser)}
            />
          </NavigationContainer>
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
