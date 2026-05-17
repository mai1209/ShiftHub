import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BellRing,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Crown,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Palette,
  ShieldCheck,
  BriefcaseBusiness,
  Users,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import {
  getUserProfile,
  removeToken,
  removeUserProfile,
  subscribeToUserProfile,
} from '../services/authStorage';
import { resolveUserRole } from '../services/subscriptionAccess';
import {
  PRIVACY_POLICY_URL,
  SUPPORT_EMAIL,
  SUPPORT_URL,
  buildSupportMailUrl,
} from '../utils/publicLinks';

type MenuItemProps = {
  icon: React.ComponentType<any>;
  label: string;
  description: string;
  theme: any;
  onPress: () => void;
  danger?: boolean;
  styles: any; // Pasamos los estilos para que MenuItem los reconozca
};

function MenuItem({
  icon: Icon,
  label,
  description,
  onPress,
  theme,
  danger = false,
  styles,
}: MenuItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && styles.menuItemPressed,
      ]}
    >
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Icon
          size={18}
          color={danger ? '#ff1414' : theme?.primary || '#FFFFFF'}
        />
      </View>
      <View style={styles.itemBody}>
        <Text style={[styles.itemLabel, danger && styles.itemLabelDanger]}>
          {label}
        </Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <ChevronRight size={18} color={theme?.textMuted || '#6E7585'} />
    </Pressable>
  );
}

export default function SettingsScreen({ navigation }: { navigation: any }) {
  const { theme, applyUserTheme, businessCopy } = useTheme();
  const styles = createStyles(theme);
  const isIOS = Platform.OS === 'ios';
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const storedUser = await getUserProfile();
      if (mounted) {
        setCurrentUser(storedUser);
      }
    })();

    const unsubscribe = subscribeToUserProfile(user => {
      setCurrentUser(user);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const isBarberUser = resolveUserRole(currentUser) === 'barber';

  const handleLogout = async () => {
    Alert.alert(
      'Cerrar sesión',
      'Vas a salir de esta cuenta en este dispositivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: async () => {
            await removeToken();
            await removeUserProfile();
            applyUserTheme(null);
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ],
    );
  };

  const handleSupportMail = async () => {
    const url = buildSupportMailUrl(`Soporte ${businessCopy.brandName}`);
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No pudimos abrir el mail', SUPPORT_EMAIL);
    }
  };

  const openExternalPage = async (url: string, fallbackLabel: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No pudimos abrir el enlace', fallbackLabel);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Ajustes</Text>
         
        </View>
      </View>

      <Text style={styles.sectionLabel}>Preferencias</Text>
      <View style={styles.groupCard}>
        <MenuItem
          icon={BellRing}
          label="Notificaciones y recordatorios"
          description={`Push al ${businessCopy.staffSingular} y mail recordatorio al cliente el día del turno.`}
          onPress={() => navigation.navigate('Notification-Settings')}
          theme={theme}
          styles={styles}
        />
        {!isBarberUser ? (
          <>
            <View style={styles.separator} />
            <MenuItem
              icon={Palette}
              label="Personalizar aspecto"
              description="Logo, colores de botones, textos destacados, tarjetas y fondo."
              onPress={() => navigation.navigate('Appearance-Settings')}
              theme={theme}
              styles={styles}
            />
            <View style={styles.separator} />
            <MenuItem
              icon={BriefcaseBusiness}
              label="Cargar servicios"
              description="Cargá, editá o sacá los servicios que ofrece tu local."
              onPress={() => navigation.navigate('Service-Settings')}
              theme={theme}
              styles={styles}
            />
            <View style={styles.separator} />
            <MenuItem
              icon={KeyRound}
              label={`Habilitar editar perfil ${businessCopy.staffSingular}`}
              description={`Activá o desactivá si el ${businessCopy.staffSingular} puede cambiar su propio perfil.`}
              onPress={() => navigation.navigate('Barber-Profile-Settings')}
              theme={theme}
              styles={styles}
            />
            <View style={styles.separator} />
            <MenuItem
              icon={CalendarDays}
              label="Cerrar negocio por día"
              description="Bloqueá una fecha puntual para que la web no tome turnos."
              onPress={() => navigation.navigate('Shop-Closure-Settings')}
              theme={theme}
              styles={styles}
            />
            <View style={styles.separator} />
            <MenuItem
              icon={MapPin}
              label="Perfil público del negocio"
              description="Dirección, mapa, reseñas, Instagram y Linktree visibles en la web de turnos."
              onPress={() => navigation.navigate('Public-Profile-Settings')}
              theme={theme}
              styles={styles}
            />
          </>
        ) : null}
      </View>

      {!isBarberUser ? (
        <>
          <Text style={styles.sectionLabel}>Cobros</Text>
          <View style={styles.groupCard}>
            <MenuItem
              icon={CreditCard}
              label="Configurar cobros"
              description={
                isIOS
                  ? 'Medios de cobro disponibles y estado general de la cuenta de pagos.'
                  : 'Efectivo, seña online y estado de Mercado Pago.'
              }
              onPress={() => navigation.navigate('Payment-Settings')}
              theme={theme}
              styles={styles}
            />
          </View>

          <Text style={styles.sectionLabel}>{isIOS ? 'Cuenta' : 'Plan'}</Text>
          <View style={styles.groupCard}>
            <MenuItem
              icon={Crown}
              label={isIOS ? 'Estado de cuenta' : 'Plan y suscripción'}
              description={
                isIOS
                  ? 'Estado actual y acceso disponible en la cuenta.'
                  : 'Estado del plan, vencimiento y comparación de opciones.'
              }
              onPress={() => navigation.navigate('Subscription-Settings')}
              theme={theme}
              styles={styles}
            />
          </View>
        </>
      ) : null}

      {!isBarberUser ? (
        <>
          <Text style={styles.sectionLabel}>Clientes</Text>
          <View style={styles.groupCard}>
            <MenuItem
              icon={MessageCircle}
              label="Promociones por WhatsApp"
              description="Escribí un mensaje y abrí WhatsApp para clientes que ya reservaron."
              onPress={() => navigation.navigate('WhatsApp-Campaigns')}
              theme={theme}
              styles={styles}
            />
            <View style={styles.separator} />
            <MenuItem
              icon={Users}
              label="Historial de clientes"
              description="Revisá visitas, últimos servicios, pagos y exportá el historial."
              onPress={() => navigation.navigate('Customer-History')}
              theme={theme}
              styles={styles}
            />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionLabel}>
        {isBarberUser ? 'Cuenta' : 'Seguridad y cuenta'}
      </Text>
      <View style={styles.groupCard}>
        <MenuItem
          icon={KeyRound}
          label="Cambiar contraseña"
          description="Actualizá la clave de acceso de esta cuenta."
          onPress={() => navigation.navigate('Change-Password')}
          theme={theme}
          styles={styles}
        />
        <View style={styles.separator} />
        <MenuItem
          icon={Mail}
          label="Recuperar contraseña"
          description="Te mandamos un código al mail para poner una nueva."
          onPress={() => navigation.navigate('Recover-Password')}
          theme={theme}
          styles={styles}
        />
      </View>

      <Text style={styles.sectionLabel}>Soporte</Text>
      <View style={styles.groupCard}>
        <MenuItem
          icon={BookOpen}
          label="Centro de soporte"
          description="Datos de contacto, tiempos de respuesta, privacidad y gestión de cuenta."
          onPress={() => openExternalPage(SUPPORT_URL, SUPPORT_URL)}
          theme={theme}
          styles={styles}
        />
        <View style={styles.separator} />
        <MenuItem
          icon={BookOpen}
          label="Manual de uso"
          description="Guía simple para arrancar, configurar y compartir tu sistema."
          onPress={() => navigation.navigate('Usage-Guide')}
          theme={theme}
          styles={styles}
        />
        <View style={styles.separator} />
        <MenuItem
          icon={ShieldCheck}
          label="Política de privacidad"
          description="Revisá cómo usamos, guardamos y protegemos tus datos."
          onPress={() => openExternalPage(PRIVACY_POLICY_URL, PRIVACY_POLICY_URL)}
          theme={theme}
          styles={styles}
        />
        <View style={styles.separator} />
        <MenuItem
          icon={ShieldCheck}
          label="Eliminar cuenta"
          description={
            'Solicitá la eliminación desde la app y revisá también la ruta pública requerida por tienda.'
          }
          onPress={() => navigation.navigate('Account-Deletion-Request')}
          theme={theme}
          styles={styles}
        />
        <View style={styles.separator} />
        <MenuItem
          icon={Mail}
          label="Comunicate con soporte"
          description="Abrí un mail y te ayudamos con la configuración."
          onPress={handleSupportMail}
          theme={theme}
          styles={styles}
        />
      </View>

      <Text style={styles.sectionLabel}>Sesión</Text>
      <View style={styles.groupCard}>
        <MenuItem
          icon={LogOut}
          label="Cerrar sesión"
          description="Salir de esta cuenta en este dispositivo."
          onPress={handleLogout}
          danger
          theme={theme}
          styles={styles}
        />
      </View>
    </ScrollView>
  );
}

// Función centralizada de estilos para evitar duplicados
function createStyles(theme: any) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingTop: Platform.OS === 'ios' ? 72 : 28,
      paddingHorizontal: 20,
      paddingBottom: 130,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 18,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 34,
      fontWeight: '800',
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 14,
      marginTop: 6,
    },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 10,
      marginTop: 6,
    },
    groupCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 20,
      overflow: 'hidden',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    menuItemPressed: {
      opacity: 0.82,
      backgroundColor: theme.surfaceAlt,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
      marginRight: 12,
    },
    iconWrapDanger: {
      backgroundColor: 'rgba(255, 138, 138, 0.12)',
    },
    itemBody: {
      flex: 1,
      paddingRight: 12,
    },
    itemLabel: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    itemLabelDanger: {
      color: '#FFD0D0',
    },
    itemDescription: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 4,
      lineHeight: 17,
    },
    separator: {
      height: 1,
      backgroundColor: theme.border,
      marginLeft: 64,
    },
  });
}
