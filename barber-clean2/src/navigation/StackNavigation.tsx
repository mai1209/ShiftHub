import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import type { Barber } from '../services/api';

import Login from '../screnn/Login';
import Register from '../screnn/Register';
import Home from '../screnn/Home';
import ReservasForm from '../screnn/ReservasForm';
import RegisterEmployed from '../screnn/RegisterEmployed';
import BarberAccessScreen from '../screnn/BarberAccessScreen';
import ListBarber from '../screnn/ListBarber';
import Nav from '../screnn/Nav';
import BarberDashboard from '../screnn/BarberDashboard';
import MetricsScreen from '../screnn/MetricsScreen';
import OwnerMetricsScreen from '../screnn/OwnerMetricsScreen';
import CustomerHistoryScreen from '../screnn/CustomerHistoryScreen';
import AppearanceSettingsScreen from '../screnn/AppearanceSettingsScreen';
import PublicProfileSettingsScreen from '../screnn/PublicProfileSettingsScreen';
import ServiceSettingsScreen from '../screnn/ServiceSettingsScreen';
import PaymentSettingsScreen from '../screnn/PaymentSettingsScreen';
import NotificationSettingsScreen from '../screnn/NotificationSettingsScreen';
import BarberProfileSettingsScreen from '../screnn/BarberProfileSettingsScreen';
import ShopClosureSettingsScreen from '../screnn/ShopClosureSettingsScreen';
import WhatsAppCampaignScreen from '../screnn/WhatsAppCampaignScreen';
import ChangePasswordScreen from '../screnn/ChangePasswordScreen';
import RecoverPasswordScreen from '../screnn/RecoverPasswordScreen';
import SettingsScreen from '../screnn/SettingsScreen';
import UsageGuideScreen from '../screnn/UsageGuideScreen';
import SubscriptionSettingsScreen from '../screnn/SubscriptionSettingsScreen';
import PlansScreen from '../screnn/PlansScreen';
import AccountDeletionRequestScreen from '../screnn/AccountDeletionRequestScreen';
import ScreenGradient from '../components/ScreenGradient';
import { navigationRef } from '../../App';
import type { AppRole } from '../services/subscriptionAccess';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Reservas:
    | {
        barberId?: string;
        lockBarber?: boolean;
      }
    | undefined;
  'Register-Employed':
    | {
        barber?: Barber;
        selfEdit?: boolean;
        advancedSection?: 'buffer' | 'closedDays' | 'timeBlocks';
      }
    | undefined;
  'Barber-Access': { barber: Barber; returnLabel?: string };
  'List-Barber': undefined;
  'Barber-Home':
    | {
        barberId: string;
        barberName?: string;
        barber?: Barber;
      }
    | undefined;
  Metrics:
    | {
        barberId?: string;
        barberName?: string;
      }
    | undefined;
  'Owner-Metrics': undefined;
  'Customer-History': undefined;
  Settings: undefined;
  'Appearance-Settings': undefined;
  'Public-Profile-Settings': undefined;
  'Service-Settings': undefined;
  'Payment-Settings': undefined;
  'Notification-Settings': undefined;
  'Barber-Profile-Settings': undefined;
  'Shop-Closure-Settings': undefined;
  'WhatsApp-Campaigns': undefined;
  'Subscription-Settings': undefined;
  Plans: undefined;
  'Usage-Guide': undefined;
  'Change-Password': undefined;
  'Recover-Password': undefined;
  'Account-Deletion-Request': undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type Props = {
  currentRouteName?: string;
  initialRouteName?: 'Login' | 'Home' | 'Barber-Home' | 'Subscription-Settings';
  isSubscriptionLocked?: boolean;
  currentUserRole?: AppRole;
};

export default function StackNavigator({
  currentRouteName,
  initialRouteName = 'Login',
  isSubscriptionLocked = false,
  currentUserRole = 'admin',
}: Props) {
  const styles = useMemo(() => createStyles(), []);
  const isBarberUser = currentUserRole === 'barber';
  const showAdminArea = !isBarberUser && !isSubscriptionLocked;
  const showBarberArea = isBarberUser && !isSubscriptionLocked;
  const showNav = showAdminArea || showBarberArea;

  return (
    <View style={styles.container}>
      <ScreenGradient />

      <View style={styles.stackContainer}>
        <Stack.Navigator
          initialRouteName={initialRouteName}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        >
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen name="Register" component={Register} />
          <Stack.Screen name="Subscription-Settings" component={SubscriptionSettingsScreen} />
          <Stack.Screen name="Plans" component={PlansScreen} />
          <Stack.Screen name="Change-Password" component={ChangePasswordScreen} />
          <Stack.Screen name="Recover-Password" component={RecoverPasswordScreen} />
          <Stack.Screen
            name="Account-Deletion-Request"
            component={AccountDeletionRequestScreen}
          />
          {showAdminArea ? (
            <>
              <Stack.Screen name="Home" component={Home} />
              <Stack.Screen name="Reservas" component={ReservasForm} />
              <Stack.Screen name="Register-Employed" component={RegisterEmployed} />
              <Stack.Screen name="Barber-Access" component={BarberAccessScreen} />
              <Stack.Screen name="List-Barber" component={ListBarber} />
              <Stack.Screen name="Barber-Home" component={BarberDashboard} />
              <Stack.Screen name="Metrics" component={MetricsScreen} />
              <Stack.Screen name="Owner-Metrics" component={OwnerMetricsScreen} />
              <Stack.Screen name="Customer-History" component={CustomerHistoryScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Usage-Guide" component={UsageGuideScreen} />
              <Stack.Screen name="Appearance-Settings" component={AppearanceSettingsScreen} />
              <Stack.Screen name="Public-Profile-Settings" component={PublicProfileSettingsScreen} />
              <Stack.Screen name="Service-Settings" component={ServiceSettingsScreen} />
              <Stack.Screen name="Payment-Settings" component={PaymentSettingsScreen} />
              <Stack.Screen name="Notification-Settings" component={NotificationSettingsScreen} />
              <Stack.Screen name="Barber-Profile-Settings" component={BarberProfileSettingsScreen} />
              <Stack.Screen name="Shop-Closure-Settings" component={ShopClosureSettingsScreen} />
              <Stack.Screen name="WhatsApp-Campaigns" component={WhatsAppCampaignScreen} />
            </>
          ) : null}
          {showBarberArea ? (
            <>
              <Stack.Screen name="Barber-Home" component={BarberDashboard} />
              <Stack.Screen name="Register-Employed" component={RegisterEmployed} />
              <Stack.Screen name="Reservas" component={ReservasForm} />
              <Stack.Screen name="Metrics" component={MetricsScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Usage-Guide" component={UsageGuideScreen} />
              <Stack.Screen
                name="Notification-Settings"
                component={NotificationSettingsScreen}
              />
            </>
          ) : null}
        </Stack.Navigator>
      </View>

      {showNav ? (
        <Nav currentRouteName={currentRouteName} role={currentUserRole} onNavigate={routeName => {
          navigationRef.navigate(routeName as never);
        }} />
      ) : null}
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F8FAFC',
    },
    stackContainer: {
      flex: 1,
    },
  });
