import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  StatusBar,
  Alert,
  Platform,
  Share,
  PanResponder,
  Linking,
  Modal,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  getUserProfile,
  subscribeToUserProfile,
} from '../services/authStorage';
import { hasProPlanAccess, isFreePlan } from '../services/planAccess';
import ProFeatureModal from '../components/ProFeatureModal';
import {
  getCurrentUser,
  fetchAppointments,
  Appointment,
  fetchBarbers,
  fetchServices,
  updateAppointmentStatus,
  deleteAppointment,
} from '../services/api';
import {
  CheckCircle2,
  TrendingUp,
  Share2,
  Users,
  Clock,
  BriefcaseBusiness,
  CreditCard,
  Link2,
  CircleDashed,
} from 'lucide-react-native';
import { PUBLIC_WEB_BASE_URL } from '../utils/publicLinks';

const SHOP_TZ = 'America/Argentina/Cordoba';

type Props = {
  navigation: any;
};

const WELCOME_MODAL_KEY_PREFIX = 'HOME_WELCOME_MODAL_DISMISSED';
const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(
    sanitized.length === 3 ? sanitized.repeat(2) : sanitized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const sanitizeWhatsappNumber = (value: string) => value.replace(/[^\d]/g, '');

function buildCancellationMessage({
  shopName,
  customerName,
  service,
  startTime,
}: {
  shopName: string;
  customerName: string;
  service: string;
  startTime: string;
}) {
  const dateLabel = new Date(startTime).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Cordoba',
  });
  const timeLabel = formatTimeOnly(startTime);
  return `Hola ${customerName}, te escribimos de ${shopName}. Tuvimos que cancelar tu turno de ${service} del ${dateLabel} a las ${timeLabel}. Responde este mensaje y te ofrecemos un nuevo horario.`;
}

function buildWaitingReminderMessage({
  shopName,
  customerName,
}: {
  shopName: string;
  customerName: string;
}) {
  return `Hola ${customerName}, te escribimos de ${shopName}. No te olvides de tu turno, ya te estamos esperando.`;
}

function getPaymentSnapshot(appointment: Appointment) {
  if (appointment.status === 'completed') {
    if (appointment.paymentStatus === 'unpaid') {
      return { label: 'Sin cobrar', tone: 'neutral' as const };
    }
    if (appointment.paymentMethodCollected === 'transfer') {
      return {
        label: 'Cobrado por adelantado / transferencia',
        tone: 'transfer' as const,
      };
    }
    return { label: 'Cobrado en efectivo', tone: 'cash' as const };
  }

  if (appointment.status === 'awaiting_payment') {
    return {
      label: 'Pago online iniciado / esperando confirmación',
      tone: 'neutral' as const,
    };
  }

  if (appointment.paymentMethod === 'transfer') {
    return {
      label: 'Reserva con adelanto / transferencia',
      tone: 'transfer' as const,
    };
  }

  return {
    label: 'Reserva para cobrar en efectivo / transferencia en local',
    tone: 'cash' as const,
  };
}

function formatDateParam(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value ?? '0000';
  const month = parts.find(part => part.type === 'month')?.value ?? '00';
  const day = parts.find(part => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

function Home({ navigation }: Props) {
  const { theme, shopSlug, businessCopy } = useTheme();
  const isIOS = Platform.OS === 'ios';
  const [fullName, setFullName] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hasProAccess, setHasProAccess] = useState(false);
  const [setupSummary, setSetupSummary] = useState({
    loading: true,
    serviceCount: 0,
    barberCount: 0,
    isFreePlan: false,
    paymentReady: false,
    paymentLabel: 'Revisá tus métodos de cobro',
  });
  const [welcomeModalVisible, setWelcomeModalVisible] = useState(false);
  const [proModalVariant, setProModalVariant] = useState<
    null | 'metrics' | 'history'
  >(null);

  const selectedDateRef = useRef(selectedDate);
  const didInitDateEffect = useRef(false);
  const openedSwipeableIdRef = useRef<string | null>(null);
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const shareLink = useMemo(() => {
    if (!shopSlug) return '';
    const base = PUBLIC_WEB_BASE_URL.replace(/\/+$/, '');
    return `${base}/${shopSlug}`;
  }, [shopSlug]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const isToday = useMemo(
    () => isSameDay(selectedDate, new Date()),
    [selectedDate],
  );

  const formattedHeaderDate = useMemo(
    () =>
      new Intl.DateTimeFormat('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(selectedDate),
    [selectedDate],
  );

  const handleCopyLink = useCallback(async () => {
    if (!shareLink) return;
    Clipboard.setString(shareLink);
    try {
      await Share.share({ message: shareLink });
    } catch (_e) {}
    Alert.alert('¡Copiado!', 'El link de turnos se copió al portapapeles.');
  }, [shareLink]);

  const handleOpenSubscriptionSettings = useCallback(() => {
    setProModalVariant(null);
    navigation.navigate(isIOS ? 'Subscription-Settings' : 'Plans');
  }, [isIOS, navigation]);

  const freeBarberLimitReached =
    setupSummary.isFreePlan && setupSummary.barberCount >= 1;

  const onboardingItems = useMemo(
    () => [
      {
        key: 'services',
        title: 'Cargá tus servicios',
        description:
          setupSummary.serviceCount > 0
            ? `${setupSummary.serviceCount} servicio${
                setupSummary.serviceCount === 1 ? '' : 's'
              } cargado${setupSummary.serviceCount === 1 ? '' : 's'}.`
            : 'Definí nombre, duración y precio para que el cliente pueda reservar.',
        complete: setupSummary.serviceCount > 0,
        actionLabel: 'Servicios',
        icon: BriefcaseBusiness,
        onPress: () => navigation.navigate('Service-Settings'),
      },
      {
        key: 'barbers',
        title: freeBarberLimitReached
          ? `Límite de ${businessCopy.staffPlural}`
          : `Sumá tus ${businessCopy.staffPlural}`,
        description:
          freeBarberLimitReached
            ? `El plan gratis permite 1 ${businessCopy.staffSingular} activo. Actualizá para sumar más.`
            : setupSummary.barberCount > 0
            ? `${setupSummary.barberCount} ${
                setupSummary.barberCount === 1
                  ? businessCopy.staffSingular
                  : businessCopy.staffPlural
              } cargado${setupSummary.barberCount === 1 ? '' : 's'}.`
            : 'Creá al menos un perfil con horarios para empezar a tomar turnos.',
        complete: setupSummary.barberCount > 0,
        actionLabel: freeBarberLimitReached
          ? 'Upgrade'
          : businessCopy.staffPluralCapitalized,
        icon: Users,
        onPress: freeBarberLimitReached
          ? handleOpenSubscriptionSettings
          : () => navigation.navigate('List-Barber'),
      },
      {
        key: 'payments',
        title: 'Configurá cómo cobrás',
        description: setupSummary.paymentLabel,
        complete: setupSummary.paymentReady,
        actionLabel: 'Cobros',
        icon: CreditCard,
        onPress: () => navigation.navigate('Payment-Settings'),
      },
      {
        key: 'link',
        title: 'Compartí tu enlace de turnos',
        description: shareLink
          ? 'Tu link ya está listo para copiar y enviarlo a clientes.'
          : 'Cuando tu local tenga shopSlug, el link queda listo para compartir.',
        complete: Boolean(shareLink),
        actionLabel: 'Copiar',
        icon: Link2,
        onPress: handleCopyLink,
      },
    ],
    [
      businessCopy.staffPlural,
      businessCopy.staffPluralCapitalized,
      businessCopy.staffSingular,
      freeBarberLimitReached,
      handleCopyLink,
      handleOpenSubscriptionSettings,
      navigation,
      setupSummary.serviceCount,
      setupSummary.barberCount,
      setupSummary.paymentLabel,
      setupSummary.paymentReady,
      shareLink,
    ],
  );

  const completedSetupCount = useMemo(
    () => onboardingItems.filter(item => item.complete).length,
    [onboardingItems],
  );
  const shouldShowSetupCard = useMemo(
    () => !setupSummary.loading && completedSetupCount < onboardingItems.length,
    [completedSetupCount, onboardingItems.length, setupSummary.loading],
  );

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const offset = index - 3;
      const date = addDays(selectedDate, offset);

      return {
        key: `${date.toISOString()}-${index}`,
        date,
        isSelected: isSameDay(date, selectedDate),
        isToday: isSameDay(date, new Date()),
        dayName: new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(
          date,
        ),
        dayNumber: new Intl.DateTimeFormat('es-AR', { day: '2-digit' }).format(
          date,
        ),
      };
    });
  }, [selectedDate]);

  const loadData = useCallback(async (isRefresh = false, targetDate?: Date) => {
    const activeDate = targetDate ?? selectedDateRef.current;
    try {
      if (!isRefresh) setLoading(true);
      setError('');
      const appointmentsRes = await fetchAppointments({
        date: formatDateParam(activeDate),
      });
      setAppointments(
        appointmentsRes.appointments.filter(a => a.status !== 'cancelled'),
      );
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos cargar la información');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadSetupSummary = useCallback(async () => {
    try {
      const [servicesRes, barbersRes, currentUserRes] = await Promise.all([
        fetchServices().catch(() => ({ services: [] })),
        fetchBarbers().catch(() => ({ barbers: [] })),
        getCurrentUser().catch(async () => {
          const storedUser = await getUserProfile();
          return { user: storedUser };
        }),
      ]);

      const paymentSettings = currentUserRes?.user?.paymentSettings ?? {};
      const cashEnabled = paymentSettings.cashEnabled !== false;
      const mercadoPagoConnected =
        paymentSettings.mercadoPagoConnectionStatus === 'connected';
      const advanceEnabled = Boolean(paymentSettings.advancePaymentEnabled);

      let paymentLabel = 'Revisá tus métodos de cobro.';
      if (mercadoPagoConnected && advanceEnabled) {
        paymentLabel = 'Mercado Pago conectado y cobro online activo.';
      } else if (cashEnabled) {
        paymentLabel = 'Tenés cobro en el local activo.';
      }

      setSetupSummary({
        loading: false,
        serviceCount: servicesRes?.services?.length ?? 0,
        barberCount: barbersRes?.barbers?.length ?? 0,
        isFreePlan: isFreePlan(currentUserRes?.user),
        paymentReady: cashEnabled || mercadoPagoConnected,
        paymentLabel,
      });
    } catch (_error) {
      setSetupSummary(current => ({
        ...current,
        loading: false,
      }));
    }
  }, []);

  const handleDismissWelcomeModal = useCallback(async () => {
    setWelcomeModalVisible(false);
    const storageKey = `${WELCOME_MODAL_KEY_PREFIX}:${shopSlug || 'default'}`;
    try {
      await AsyncStorage.setItem(storageKey, '1');
    } catch (_error) {}
  }, [shopSlug]);

  const handleOpenGuideFromModal = useCallback(async () => {
    await handleDismissWelcomeModal();
    navigation.navigate('Usage-Guide');
  }, [handleDismissWelcomeModal, navigation]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const storedUser = await getUserProfile<{
        fullName?: string;
        paymentSettings?: any;
      }>();
      if (isMounted && storedUser) {
        if (storedUser?.fullName) setFullName(storedUser.fullName);
        setHasProAccess(hasProPlanAccess(storedUser));
        const paymentSettings = storedUser?.paymentSettings ?? {};
        const cashEnabled = paymentSettings.cashEnabled !== false;
        const mercadoPagoConnected =
          paymentSettings.mercadoPagoConnectionStatus === 'connected';
        const advanceEnabled = Boolean(paymentSettings.advancePaymentEnabled);
        setSetupSummary(current => ({
          ...current,
          isFreePlan: isFreePlan(storedUser),
          paymentReady: cashEnabled || mercadoPagoConnected,
          paymentLabel:
            mercadoPagoConnected && advanceEnabled
              ? 'Mercado Pago conectado y cobro online activo.'
              : cashEnabled
              ? 'Tenés cobro en el local activo.'
              : 'Revisá tus métodos de cobro.',
        }));
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!shopSlug) return;
      const storageKey = `${WELCOME_MODAL_KEY_PREFIX}:${shopSlug}`;
      try {
        const alreadyDismissed = await AsyncStorage.getItem(storageKey);
        if (!isMounted) return;
        if (!alreadyDismissed) {
          setWelcomeModalVisible(true);
        }
      } catch (_error) {
        if (isMounted) setWelcomeModalVisible(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [shopSlug]);

  useEffect(() => {
    return subscribeToUserProfile(user => {
      setHasProAccess(hasProPlanAccess(user));
      setFullName(user?.fullName || '');
      const paymentSettings = user?.paymentSettings ?? {};
      const cashEnabled = paymentSettings.cashEnabled !== false;
      const mercadoPagoConnected =
        paymentSettings.mercadoPagoConnectionStatus === 'connected';
      const advanceEnabled = Boolean(paymentSettings.advancePaymentEnabled);
      setSetupSummary(current => ({
        ...current,
        isFreePlan: isFreePlan(user),
        paymentReady: cashEnabled || mercadoPagoConnected,
        paymentLabel:
          mercadoPagoConnected && advanceEnabled
            ? 'Mercado Pago conectado y cobro online activo.'
            : cashEnabled
            ? 'Tenés cobro en el local activo.'
            : 'Revisá tus métodos de cobro.',
      }));
    });
  }, []);

  const handleOpenProModal = useCallback((variant: 'metrics' | 'history') => {
    setProModalVariant(variant);
  }, []);

  const handleCloseProModal = useCallback(() => {
    setProModalVariant(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData(false, selectedDateRef.current);
      loadSetupSummary();
      const intervalId = setInterval(
        () => loadData(true, selectedDateRef.current),
        15000,
      );
      return () => clearInterval(intervalId);
    }, [loadData, loadSetupSummary]),
  );

  useEffect(() => {
    if (!didInitDateEffect.current) {
      didInitDateEffect.current = true;
      return;
    }
    loadData(false, selectedDate);
  }, [selectedDate, loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadData(true, selectedDate), loadSetupSummary()]).finally(
      () => setRefreshing(false),
    );
  };

  const handleShiftDate = (days: number) =>
    setSelectedDate(prev => addDays(prev, days));
  const handleSelectDate = (date: Date) => setSelectedDate(date);
  const handleGoToToday = () => setSelectedDate(new Date());

  const greetingName = fullName || 'Barbería';

  const handleComplete = async (appointmentId: string) => {
    Alert.alert(
      'Finalizar turno',
      '¿Deseas marcar este turno como completado?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, finalizar',
          onPress: () => {
            const appointment = appointments.find(
              item => item._id === appointmentId,
            );
            const totalAmount = Number(
              appointment?.amountTotal ?? appointment?.servicePrice ?? 0,
            );

            Alert.alert(
              '¿Cómo pagó este cliente?',
              'Esto define las métricas reales del local.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Efectivo',
                  onPress: async () => {
                    try {
                      await updateAppointmentStatus(
                        appointmentId,
                        'completed',
                        {
                          paymentMethodCollected: 'cash',
                          paymentStatus: 'paid',
                          amountPaid: totalAmount,
                        },
                      );
                      await loadData(true, selectedDateRef.current);
                    } catch (err: any) {
                      setError(err?.message ?? 'Error');
                    }
                  },
                },
                {
                  text: 'Transferencia / adelantado',
                  onPress: async () => {
                    try {
                      await updateAppointmentStatus(
                        appointmentId,
                        'completed',
                        {
                          paymentMethodCollected: 'transfer',
                          paymentStatus: 'paid',
                          amountPaid: totalAmount,
                        },
                      );
                      await loadData(true, selectedDateRef.current);
                    } catch (err: any) {
                      setError(err?.message ?? 'Error');
                    }
                  },
                },
                {
                  text: 'Aún no pagó',
                  onPress: async () => {
                    try {
                      await updateAppointmentStatus(
                        appointmentId,
                        'completed',
                        {
                          paymentStatus: 'unpaid',
                          amountPaid: 0,
                        },
                      );
                      await loadData(true, selectedDateRef.current);
                    } catch (err: any) {
                      setError(err?.message ?? 'Error');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleRelease = async (appointmentId: string) => {
    const appointment = appointments.find(item => item._id === appointmentId);
    Alert.alert('Gestionar Turno', 'Elegí una acción para este turno:', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Liberar (Solo App)',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAppointment(appointmentId);
            await loadData(true, selectedDateRef.current);
          } catch (err: any) {
            setError('Error al liberar');
          }
        },
      },
      {
        text: 'Cancelar y Avisar WhatsApp',
        onPress: async () => {
          try {
            if (!appointment?.notes) {
              Alert.alert(
                'Sin contacto',
                'No hay WhatsApp registrado para este cliente.',
              );
              return;
            }
            const phone = sanitizeWhatsappNumber(appointment.notes);
            await deleteAppointment(appointmentId);
            await loadData(true, selectedDateRef.current);
            const message = buildCancellationMessage({
              shopName: greetingName,
              customerName: appointment.customerName,
              service: appointment.service,
              startTime: appointment.startTime,
            });
            await Linking.openURL(
              `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
            );
          } catch (err: any) {
            setError('Error al cancelar');
          }
        },
      },
    ]);
  };

  const handleWaitingReminder = async (appointment: Appointment) => {
    try {
      if (!appointment?.notes) {
        Alert.alert(
          'Sin contacto',
          'No hay WhatsApp registrado para este cliente.',
        );
        return;
      }
      const phone = sanitizeWhatsappNumber(appointment.notes);
      const message = buildWaitingReminderMessage({
        shopName: greetingName,
        customerName: appointment.customerName,
      });
      await Linking.openURL(
        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      );
    } catch (_err) {
      Alert.alert('Error', 'No pudimos abrir WhatsApp.');
    }
  };

  const datePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dy) < 10,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -40) handleShiftDate(1);
          else if (gestureState.dx > 40) handleShiftDate(-1);
        },
      }),
    [],
  );

  const handleSwipeableOpen = (appointmentId: string) => {
    const previousId = openedSwipeableIdRef.current;
    if (previousId && previousId !== appointmentId)
      swipeableRefs.current[previousId]?.close();
    openedSwipeableIdRef.current = appointmentId;
  };

  const renderAppointmentCard = (appointment: Appointment, index: number) => {
    const barberName =
      appointment.barber && typeof appointment.barber === 'object'
        ? appointment.barber.fullName
        : 'Sin asignar';
    const isCompleted = appointment.status === 'completed';
    const paymentSnapshot = getPaymentSnapshot(appointment);

    const card = (
      <View
        style={[
          styles.appointmentCard,
          isCompleted && styles.appointmentCardCompleted,
          { marginTop: index === 0 ? 0 : 12 },
        ]}
      >
        {/* Header: Hora y Estado */}
        <View style={styles.cardHeader}>
          <View style={styles.timeTag}>
            <Clock size={14} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={styles.timeText}>
              {formatTimeOnly(appointment.startTime)}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isCompleted ? styles.statusBadgeDone : styles.statusBadgePending,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isCompleted ? styles.statusTextDone : styles.statusTextPending,
              ]}
            >
              {isCompleted ? 'COMPLETADO' : 'PENDIENTE'}
            </Text>
          </View>
        </View>

        {/* Body: Cliente y Servicio */}
        <View style={styles.cardBody}>
          <Text style={styles.customerNameText}>
            {appointment.customerName}
          </Text>
          <View style={styles.serviceRow}>
            <BriefcaseBusiness
              size={14}
              color={theme.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.serviceNameText}>{appointment.service}</Text>
            <Text style={styles.dotSeparator}>•</Text>
            <Text style={styles.durationText}>
              {appointment.durationMinutes || 60} min
            </Text>
          </View>
          <Text style={styles.barberSubText}>
            Atendido por:{' '}
            <Text style={{ color: theme.textSecondary }}>{barberName}</Text>
          </Text>
          <View
            style={[
              styles.paymentInfoBadge,
              paymentSnapshot.tone === 'cash'
                ? styles.paymentInfoBadgeCash
                : paymentSnapshot.tone === 'transfer'
                ? styles.paymentInfoBadgeTransfer
                : styles.paymentInfoBadgeNeutral,
            ]}
          >
            <Text style={styles.paymentInfoText}>{paymentSnapshot.label}</Text>
          </View>
        </View>

        {/* Acciones */}
        {!isCompleted && (
          <View style={styles.cardActions}>
            <Pressable
              style={[styles.btnAction, styles.btnMain]}
              onPress={() => handleComplete(appointment._id)}
            >
              <Text style={styles.btnMainText}>Cobrar y finalizar</Text>
            </Pressable>
            <Pressable
              style={[styles.btnAction, styles.btnSec]}
              onPress={() => handleRelease(appointment._id)}
            >
              <Text style={styles.btnSecText}>Liberar</Text>
            </Pressable>
            <Pressable
              style={[styles.btnAction, styles.btnSec, styles.btnWhatsapp]}
              onPress={() => handleWaitingReminder(appointment)}
            >
              <View style={styles.btnWhatsappRow}>
                <Image
                  style={styles.btnWhatsappImage}
                  source={require('../assets/wp.png')}
                />
                <Text style={styles.btnWhatsappHint}>Recordatorio</Text>
              </View>
            </Pressable>
          </View>
        )}
      </View>
    );

    if (isCompleted) return <View key={appointment._id}>{card}</View>;

    return (
      <Swipeable
        key={appointment._id}
        ref={ref => {
          swipeableRefs.current[appointment._id] = ref;
        }}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            style={[styles.swipeAction, { marginTop: index === 0 ? 0 : 12 }]}
            onPress={() => handleRelease(appointment._id)}
          >
            <Text style={styles.swipeActionText}>Liberar</Text>
          </Pressable>
        )}
        onSwipeableOpen={() => handleSwipeableOpen(appointment._id)}
      >
        {card}
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.welcomeText}>¡Hola,</Text>
          <Text style={styles.nameText}>{greetingName}!</Text>
        </View>
        <Image
          source={theme.logo}
          style={styles.logo as any}
          resizeMode="contain"
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {shopSlug && (
          <Pressable style={styles.linkCardCompact} onPress={handleCopyLink}>
            <View style={styles.linkIconBox}>
              <Share2 size={16} color={theme.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitleCompact}>Link de autogestión</Text>
              <Text style={styles.linkUrlCompact} numberOfLines={1}>
                {shareLink}
              </Text>
              <Text style={styles.linkHelperCompact}>
                Copiá y enviá este link para turnos.
              </Text>
            </View>
            <View style={styles.copyBadgeCompact}>
              <Text style={styles.copyBadgeTextCompact}>COPIAR</Text>
            </View>
          </Pressable>
        )}

        {shouldShowSetupCard ? (
          <View style={styles.setupCard}>
            <View style={styles.setupHeader}>
              <View>
                <Text style={styles.setupEyebrow}>Primeros pasos</Text>
                <Text style={styles.setupTitle}>
                  {`Dejá listo ${businessCopy.yourBusiness}`}
                </Text>
                <Text style={styles.setupSubtitle}>
                  {`${completedSetupCount} de ${onboardingItems.length} pasos completos.`}
                </Text>
              </View>
              <Pressable
                style={styles.setupGuideButton}
                onPress={() => navigation.navigate('Usage-Guide')}
              >
                <Text style={styles.setupGuideButtonText}>Manual</Text>
              </Pressable>
            </View>

            <View style={styles.setupList}>
              {onboardingItems.map(item => {
                const Icon = item.icon;
                return (
                  <View key={item.key} style={styles.setupItem}>
                    <View style={styles.setupStatusWrap}>
                      {item.complete ? (
                        <CheckCircle2 size={18} color={theme.primary} />
                      ) : (
                        <CircleDashed size={18} color={theme.textMuted} />
                      )}
                    </View>
                    <View style={styles.setupBody}>
                      <Text style={styles.setupItemTitle}>{item.title}</Text>
                      <Text style={styles.setupItemText}>
                        {item.description}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.setupActionBtn}
                      onPress={item.onPress}
                    >
                      <Icon size={14} color={theme.primary} />
                      <Text style={styles.setupActionText}>
                        {item.actionLabel}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {(!isIOS || hasProAccess) ? (
          <View style={styles.compactCardsRow}>
          <Pressable
            style={[
              styles.dualCompactCard,
              !hasProAccess && styles.dualCompactCardLocked,
            ]}
            onPress={() =>
              hasProAccess
                ? navigation.navigate('Owner-Metrics')
                : handleOpenProModal('metrics')
            }
          >
            <View style={styles.metricsIconBox}>
              <TrendingUp size={20} color={theme.primary} />
            </View>
            <Text style={styles.metricsTitleCompact}>Métricas</Text>
            {!hasProAccess ? (
              <Text style={styles.proBadgeCompact}>PRO</Text>
            ) : null}
          </Pressable>

          <Pressable
            style={[
              styles.dualCompactCard,
              !hasProAccess && styles.dualCompactCardLocked,
            ]}
            onPress={() =>
              hasProAccess
                ? navigation.navigate('Customer-History')
                : handleOpenProModal('history')
            }
          >
            <View style={styles.metricsIconBox}>
              <Users size={20} color={theme.primary} />
            </View>
            <Text style={styles.metricsTitleCompact}>Historial</Text>
            {!hasProAccess ? (
              <Text style={styles.proBadgeCompact}>PRO</Text>
            ) : null}
          </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.agendaTopRow}>
            <Text style={styles.sectionTitle}>Agenda de turnos</Text>
            {!isToday && (
              <Pressable style={styles.todayButton} onPress={handleGoToToday}>
                <Text style={styles.todayButtonText}>Volver a hoy</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.dateHeroCard} {...datePanResponder.panHandlers}>
            <View style={styles.dateHeroHeader}>
              <Pressable
                style={styles.dateCircleBtn}
                onPress={() => handleShiftDate(-1)}
              >
                <Text style={styles.dateCircleBtnText}>‹</Text>
              </Pressable>
              <View style={styles.dateHeroTextWrap}>
                <Text style={styles.dateHeroTitle}>
                  {capitalize(formattedHeaderDate.split(',')[0])}
                </Text>
                <Text style={styles.dateHeroSubtitle}>
                  {capitalize(
                    formattedHeaderDate.split(',').slice(1).join(',').trim(),
                  )}
                </Text>
              </View>
              <Pressable
                style={styles.dateCircleBtn}
                onPress={() => handleShiftDate(1)}
              >
                <Text style={styles.dateCircleBtnText}>›</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.weekStripContent}
            >
              {weekDays.map(item => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.weekDayChip,
                    item.isSelected && styles.weekDayChipActive,
                  ]}
                  onPress={() => handleSelectDate(item.date)}
                >
                  <Text
                    style={[
                      styles.weekDayName,
                      item.isSelected && styles.weekDayNameActive,
                    ]}
                  >
                    {capitalize(item.dayName.replace('.', ''))}
                  </Text>
                  <Text
                    style={[
                      styles.weekDayNumber,
                      item.isSelected && styles.weekDayNumberActive,
                    ]}
                  >
                    {item.dayNumber}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={{ marginTop: 20 }}>
            {loading && !appointments.length ? (
              <ActivityIndicator
                color={theme.primary}
                style={{ marginTop: 40 }}
              />
            ) : appointments.length ? (
              appointments.map(renderAppointmentCard)
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Sin turnos hoy</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <ProFeatureModal
        visible={proModalVariant != null}
        variant={proModalVariant ?? 'metrics'}
        theme={theme}
        onClose={handleCloseProModal}
        onOpenPlan={handleOpenSubscriptionSettings}
      />
      <Modal
        visible={welcomeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleDismissWelcomeModal}
      >
        <View style={styles.welcomeOverlay}>
          <View style={styles.welcomeModalCard}>
            <Text style={styles.welcomeModalEyebrow}>Bienvenida</Text>
            <Text style={styles.welcomeModalTitle}>
              Te muestro por dónde empezar
            </Text>
            <Text style={styles.welcomeModalText}>
              {`Primero cargá tus servicios, después sumá tus ${businessCopy.staffPlural}, configurá`}
              cómo cobrás y por último compartí tu link de turnos. Todo eso
              queda explicado en el manual.
            </Text>
            <View style={styles.welcomeModalActions}>
              <Pressable
                style={styles.welcomeSecondaryBtn}
                onPress={handleDismissWelcomeModal}
              >
                <Text style={styles.welcomeSecondaryBtnText}>Más tarde</Text>
              </Pressable>
              <Pressable
                style={styles.welcomePrimaryBtn}
                onPress={handleOpenGuideFromModal}
              >
                <Text style={styles.welcomePrimaryBtnText}>Ver manual</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const formatTimeOnly = (value: string) =>
  new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SHOP_TZ,
  });
const capitalize = (text: string) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1) : '';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingBottom: 120,
    },
    topHeader: {
      paddingHorizontal: 25,
      paddingTop: Platform.OS === 'ios' ? 60 : 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    welcomeText: { color: theme.textPrimary, fontSize: 16, fontWeight: '500' },
    nameText: { color: theme.textPrimary, fontSize: 28, fontWeight: '800' },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },

    // Links y Métricas (Mismo estilo anterior)
    linkCardCompact: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 20,
      gap: 12,
    },
    setupCard: {
      marginTop: 14,
      backgroundColor: theme.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
    },
    setupHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    setupEyebrow: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    setupTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      marginTop: 4,
    },
    setupSubtitle: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 4,
      lineHeight: 17,
    },
    setupGuideButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    setupGuideButtonText: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    setupList: {
      marginTop: 16,
      gap: 10,
    },
    setupItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    setupStatusWrap: {
      width: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    setupBody: {
      flex: 1,
    },
    setupItemTitle: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    setupItemText: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 3,
      lineHeight: 16,
    },
    setupActionBtn: {
      minWidth: 76,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: hexToRgba(theme.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    setupActionText: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    welcomeOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.56)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    welcomeModalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 22,
    },
    welcomeModalEyebrow: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    welcomeModalTitle: {
      color: theme.textPrimary,
      fontSize: 24,
      fontWeight: '800',
      marginTop: 8,
    },
    welcomeModalText: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 10,
    },
    welcomeModalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 20,
    },
    welcomePrimaryBtn: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    welcomePrimaryBtnText: {
      color: theme.textOnPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    welcomeSecondaryBtn: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    welcomeSecondaryBtnText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    linkIconBox: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkTitleCompact: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    linkUrlCompact: { color: theme.textSecondary, fontSize: 13, marginTop: 1 },
    linkHelperCompact: {
      color: theme.textMuted,
      fontSize: 10,
      marginTop: 3,
      lineHeight: 14,
    },
    copyBadgeCompact: {
      backgroundColor: hexToRgba(theme.primary, 0.15),
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    copyBadgeTextCompact: {
      color: theme.primary,
      fontSize: 9,
      fontWeight: '900',
    },
    compactCardsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    dualCompactCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 20,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
    },
    metricsIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: hexToRgba(theme.primary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    metricsTitleCompact: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    dualCompactCardLocked: {
      opacity: 0.82,
      borderColor: hexToRgba(theme.primary, 0.25),
    },
    proBadgeCompact: {
      marginTop: 6,
      color: theme.primary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },

    // Agenda Section
    section: { marginTop: 25 },
    sectionTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: '700' },
    agendaTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    todayButton: {
      backgroundColor: hexToRgba(theme.primary, 0.12),
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    todayButtonText: { color: theme.primary, fontSize: 12, fontWeight: '700' },
    dateHeroCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 15,
    },
    dateHeroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
    },
    dateCircleBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateCircleBtnText: {
      color: theme.primary,
      fontSize: 24,
      fontWeight: '700',
    },
    dateHeroTextWrap: { flex: 1, alignItems: 'center' },
    dateHeroTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
    },
    dateHeroSubtitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '500',
    },
    weekStripContent: { paddingHorizontal: 14, paddingTop: 15 },
    weekDayChip: {
      width: 55,
      height: 60,
      borderRadius: 15,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    weekDayChipActive: {
      backgroundColor: hexToRgba(theme.primary, 0.15),
      borderWidth: 1,
      borderColor: theme.primary,
    },
    weekDayName: { color: theme.textMuted, fontSize: 10, fontWeight: '700' },
    weekDayNameActive: { color: theme.primary },
    weekDayNumber: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    weekDayNumberActive: { color: theme.primary },

    // NUEVO DISEÑO DE CARD DE TURNO
    appointmentCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 5,
    },
    appointmentCardCompleted: { opacity: 0.5 },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    timeTag: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    timeText: { color: theme.textPrimary, fontSize: 14, fontWeight: '800' },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusBadgePending: { backgroundColor: hexToRgba(theme.primary, 0.1) },
    statusBadgeDone: { backgroundColor: 'rgba(49, 201, 108, 0.1)' },
    statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    statusTextPending: { color: theme.primary },
    statusTextDone: { color: '#66DA92' },

    cardBody: {
      marginBottom: 16,
    },
    customerNameText: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 6,
    },
    serviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    serviceNameText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    dotSeparator: { color: theme.textMuted, marginHorizontal: 8 },
    durationText: { color: theme.textMuted, fontSize: 13 },
    barberSubText: { color: theme.textMuted, fontSize: 12, fontWeight: '500' },
    paymentInfoBadge: {
      marginTop: 10,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderWidth: 1,
      borderRadius: 8,
    },
    paymentInfoBadgeCash: {
      backgroundColor: 'rgba(56, 189, 118, 0.14)',
      borderColor: 'rgba(56, 189, 118, 0.34)',
    },
    paymentInfoBadgeTransfer: {
      backgroundColor: hexToRgba(theme.primary, 0.14),
      borderColor: hexToRgba(theme.primary, 0.34),
    },
    paymentInfoBadgeNeutral: {
      backgroundColor: 'rgba(148, 163, 184, 0.12)',
      borderColor: 'rgba(148, 163, 184, 0.28)',
    },
    paymentInfoText: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },

    cardActions: {
      flexDirection: 'row',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 16,
    },
    btnAction: {
      flex: 1,
      paddingHorizontal: 1,
      paddingVertical: 4,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnMain: { backgroundColor: theme.primary, flex: 1.18 },
    btnMainText: {
      color: theme.textOnPrimary,
      fontSize: 12,
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: 15,
    },
    btnSec: {
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      flex: 0.92,
    },
    btnSecText: { color: theme.textPrimary, fontSize: 13, fontWeight: '700' },
    btnWhatsapp: {
      borderColor: hexToRgba('#25D366', 0.34),
      backgroundColor: hexToRgba('#25D366', 0.08),
      flex: 1.08,
    },
    btnWhatsappRow: {
      alignItems: 'center',
    },
    btnWhatsappImage: {
      width: 16,
      height: 16,
      resizeMode: 'contain',
      marginBottom: 2,
    },
    btnWhatsappHint: {
      color: theme.textMuted,
      fontSize: 8,
      fontWeight: '600',
      lineHeight: 11,
    },

    swipeAction: {
      width: 90,
      borderRadius: 24,
      backgroundColor: '#9D2121',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 12,
    },
    swipeActionText: {
      color: theme.textOnPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 20,
      borderStyle: 'dashed',
      borderWidth: 1,
      borderColor: theme.border,
    },
    emptyTitle: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
    errorText: { color: '#ff7b7b', textAlign: 'center', marginBottom: 10 },
    logo: { width: 55, height: 55 },
  });

export default Home;
