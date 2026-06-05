// NAV.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
  Platform,
  Modal,
} from 'react-native';
import {
  Plus,
  UserRound,
  Settings,
  Clock,
  CalendarDays,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import type { AppRole } from '../services/subscriptionAccess';

type MainRoute = 'Home' | 'Barber-Home' | 'List-Barber' | 'Reservas' | 'Settings';

type Props = {
  currentRouteName?: string;
  role?: AppRole;
  onNavigate: (routeName: any, params?: any) => void;
};

const HIDDEN_ROUTES = new Set([
  'Login',
  'Register',
  'Plans',
  'Subscription-Settings',
  'Change-Password',
  'Recover-Password',
  'Account-Deletion-Request',
]);

function resolveActiveRoute(
  routeName?: string,
  role: AppRole = 'admin',
): MainRoute | undefined {
  if (role === 'barber') {
    if (routeName === 'Barber-Home') return 'Barber-Home';
    if (
      routeName === 'Reservas' ||
      routeName === 'Metrics' ||
      routeName === 'Settings' ||
      routeName === 'Notification-Settings' ||
      routeName === 'Usage-Guide' ||
      routeName === 'Change-Password' ||
      routeName === 'Recover-Password'
    ) {
      return 'Settings';
    }
    return undefined;
  }

  if (
    routeName === 'Barber-Home' ||
    routeName === 'Register-Employed' ||
    routeName === 'Barber-Access' ||
    routeName === 'List-Barber'
  ) {
    return 'List-Barber';
  }
  if (routeName === 'Home') return 'Home';
  if (routeName === 'Reservas') return 'Reservas';
  if (
    routeName === 'Settings' ||
    routeName === 'Appearance-Settings' ||
    routeName === 'Service-Settings' ||
    routeName === 'Payment-Settings' ||
    routeName === 'Notification-Settings' ||
    routeName === 'Shop-Closure-Settings' ||
    routeName === 'Change-Password' ||
    routeName === 'Recover-Password'
  ) {
    return 'Settings';
  }
  return undefined;
}

const NavButton = ({
  isActive,
  onPress,
  label,
  Icon,
  theme,
}: {
  isActive: boolean;
  onPress: () => void;
  label: string;
  Icon: any;
  theme: Theme;
}) => {
  const animValue = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [isActive]);

  // Estilos animados para el fondo y el ancho
  const activeButtonStyle = {
    backgroundColor: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['transparent', theme.primary],
    }),
    paddingHorizontal: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [12, 16],
    }),
  };

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.navItem, activeButtonStyle]}>
        <Icon
          size={20}
          strokeWidth={2.5}
          color={isActive ? theme.textOnPrimary : theme.textMuted}
        />
        {isActive && (
          <Animated.Text
            numberOfLines={1}
            style={[styles.text, { opacity: animValue, color: theme.textOnPrimary }]}
          >
            {label}
          </Animated.Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

function Nav({ currentRouteName, role = 'admin', onNavigate }: Props) {
  const { theme, businessCopy } = useTheme();
  const [showNewTurnModal, setShowNewTurnModal] = useState(false);

  if (!currentRouteName || HIDDEN_ROUTES.has(currentRouteName)) {
    return null;
  }
  const activeRoute = resolveActiveRoute(currentRouteName, role);

  return (
    <View style={[styles.safeArea]}>
      <View
        style={[
          styles.floatingContainer,
          { backgroundColor: theme.card, shadowColor: theme.primary, borderColor: theme.border },
        ]}
      >
        <View style={styles.navInner}>
          {role === 'barber' ? (
            <>
              <NavButton
                isActive={activeRoute === 'Barber-Home'}
                onPress={() => onNavigate('Barber-Home')}
                label="Agenda"
                Icon={UserRound}
                theme={theme}
              />

              <NavButton
                isActive={activeRoute === 'Settings'}
                onPress={() => onNavigate('Settings')}
                label="Ajustes"
                Icon={Settings}
                theme={theme}
              />
            </>
          ) : (
            <>
              <NavButton
                isActive={activeRoute === 'Home'}
                onPress={() => onNavigate('Home')}
                label="Agenda"
                Icon={CalendarDays}
                theme={theme}
              />

              <NavButton
                isActive={activeRoute === 'Reservas'}
                onPress={() => setShowNewTurnModal(true)}
                label="Nuevo Turno"
                Icon={Plus}
                theme={theme}
              />

              <NavButton
                isActive={activeRoute === 'List-Barber'}
                onPress={() => onNavigate('List-Barber')}
                label={businessCopy.staffPluralCapitalized}
                Icon={UserRound}
                theme={theme}
              />

              <NavButton
                isActive={activeRoute === 'Settings'}
                onPress={() => onNavigate('Settings')}
                label="Ajustes"
                Icon={Settings}
                theme={theme}
              />
            </>
          )}
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={[styles.codexText, { color: theme.textMuted }]}>
          {businessCopy.brandName} by CODEX®
        </Text>
      </View>

      {/* Modal: elegir cómo cargar el turno (con horario u orden de llegada) */}
      <Modal
        visible={showNewTurnModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewTurnModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowNewTurnModal(false)}
        >
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              ¿Qué querés cargar?
            </Text>

            <Pressable
              style={[styles.modalOption, { borderColor: theme.border }]}
              onPress={() => {
                setShowNewTurnModal(false);
                onNavigate('Reservas', { walkin: true });
              }}
            >
              <Clock size={22} color={theme.primary} />
              <View style={styles.modalOptionTextWrap}>
                <Text
                  style={[styles.modalOptionTitle, { color: theme.textPrimary }]}
                >
                  Orden de llegada
                </Text>
                <Text style={[styles.modalOptionSub, { color: theme.textMuted }]}>
                  Cliente que llegó ahora — carga rápida
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.modalOption, { borderColor: theme.border }]}
              onPress={() => {
                setShowNewTurnModal(false);
                onNavigate('Reservas');
              }}
            >
              <CalendarDays size={22} color={theme.primary} />
              <View style={styles.modalOptionTextWrap}>
                <Text
                  style={[styles.modalOptionTitle, { color: theme.textPrimary }]}
                >
                  Turno con horario
                </Text>
                <Text style={[styles.modalOptionSub, { color: theme.textMuted }]}>
                  Elegí fecha y horario disponible
                </Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20, // Más espacio en iOS para el home indicator
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  floatingContainer: {
    borderRadius: 35,
    width: '92%', // Un poquito más ancho para dar aire
    maxWidth: 380,
    paddingVertical: 6,
    paddingHorizontal: 8,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  navInner: {
    flexDirection: 'row',
    justifyContent: 'space-around', // Distribución uniforme
    alignItems: 'center',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44, 
    borderRadius: 22,
    justifyContent: 'center',
  },
  text: {
    fontSize: 12, 
    fontWeight: '800',
    marginLeft: 6,
  },
  footer: {
    marginTop: 4,
  },
  codexText: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 18,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalSheet: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  modalOptionTextWrap: {
    flex: 1,
  },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalOptionSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
});

export default Nav;
