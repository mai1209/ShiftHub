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
  TextInput,
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
import { isFreePlan } from '../services/planAccess';
import ProFeatureModal from '../components/ProFeatureModal';
import {
  getCurrentUser,
  fetchAppointments,
  Appointment,
  fetchBarbers,
  fetchServices,
  updateAppointmentStatus,
  deleteAppointment,
  createAppointment,
} from '../services/api';
import {
  CheckCircle2,
  Share2,
  Users,
  Clock,
  BriefcaseBusiness,
  CreditCard,
  Link2,
  CircleDashed,
  BarChart3,
  TrendingUp,
  UserRound,
  Wallet,
} from 'lucide-react-native';
import { PUBLIC_WEB_BASE_URL } from '../utils/publicLinks';

const SHOP_TZ = 'America/Argentina/Cordoba';

// Tiempo que un turno ocupa realmente en la agenda: duración + buffer posterior.
// El backend bloquea la disponibilidad con duración + buffer, así que el
// calendario debe pintar lo mismo para no mostrar "libre" algo ocupado.
const occupiedMinutesOf = (a: any) =>
  (Number(a?.durationMinutes) || 30) +
  (Number(a?.bufferAfterMinutesApplied) || 0);

// Construye el ISO como "hora de pared" en la zona horaria de la barbería,
// independiente de la zona del dispositivo (evita que el turno se corra de slot).
function shopOffsetMs(utcMillis: number) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMillis));
  const g = (t: string) => Number(p.find(x => x.type === t)?.value);
  let h = g('hour');
  if (h === 24) h = 0;
  return (
    Date.UTC(g('year'), g('month') - 1, g('day'), h, g('minute'), g('second')) -
    utcMillis
  );
}

function shopWallClockToISO(
  y: number,
  m0: number,
  d: number,
  hh: number,
  mm: number,
) {
  const guess = Date.UTC(y, m0, d, hh, mm, 0);
  return new Date(guess - shopOffsetMs(guess)).toISOString();
}

type Props = {
  navigation: any;
};

const WELCOME_MODAL_KEY_PREFIX = 'HOME_WELCOME_MODAL_DISMISSED';
const AGENDA_VIEW_KEY = 'HOME_AGENDA_VIEW';
const CAL_PALETTE = [
  '#ec4899',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#f97316',
];
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

function formatAppointmentPrice(value: number) {
  return `$${Math.max(0, Number(value || 0)).toLocaleString('es-AR')}`;
}

function getPaymentSnapshot(appointment: Appointment) {
  if (appointment.status === 'completed') {
    if (appointment.paymentStatus === 'unpaid') {
      return { label: 'Sin cobrar', tone: 'neutral' as const };
    }
    if (appointment.paymentMethodCollected === 'mixed') {
      const cash = Number(appointment.cashAmount || 0);
      const transfer = Number(appointment.transferAmount || 0);
      return {
        label: `Pago mixto · Efvo ${formatAppointmentPrice(
          cash,
        )} + Transf ${formatAppointmentPrice(transfer)}`,
        tone: 'transfer' as const,
      };
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
  const [setupSummary, setSetupSummary] = useState({
    loading: true,
    serviceCount: 0,
    barberCount: 0,
    isFreePlan: false,
    paymentReady: false,
    paymentLabel: 'Revisá tus métodos de cobro',
  });
  const [welcomeModalVisible, setWelcomeModalVisible] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [proModalVariant, setProModalVariant] = useState<
    null | 'metrics' | 'history'
  >(null);

  // Modal de cobro (con pago mixto)
  const [paymentModal, setPaymentModal] = useState<{
    appointmentId: string;
    total: number;
  } | null>(null);
  const [mixedMode, setMixedMode] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [transferInput, setTransferInput] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Vista de la agenda (Lista / Calendario)
  const [agendaView, setAgendaView] = useState<'list' | 'calendar'>('list');
  const [barbersFull, setBarbersFull] = useState<any[]>([]);
  const [servicesList, setServicesList] = useState<any[]>([]);
  const [quickCreate, setQuickCreate] = useState<{
    barberId: string;
    barberName: string;
    slot: string;
  } | null>(null);
  const [qcName, setQcName] = useState('');
  const [qcPhone, setQcPhone] = useState('');
  const [qcServiceIds, setQcServiceIds] = useState<string[]>([]);
  const [qcSaving, setQcSaving] = useState(false);

  const selectedDateRef = useRef(selectedDate);
  const didInitDateEffect = useRef(false);
  const openedSwipeableIdRef = useRef<string | null>(null);
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  // Recordar la vista elegida (Lista / Calendario) entre sesiones.
  useEffect(() => {
    AsyncStorage.getItem(AGENDA_VIEW_KEY).then(v => {
      if (v === 'calendar' || v === 'list') setAgendaView(v);
    });
  }, []);

  const changeAgendaView = (v: 'list' | 'calendar') => {
    setAgendaView(v);
    AsyncStorage.setItem(AGENDA_VIEW_KEY, v).catch(() => {});
  };

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

      setBarbersFull(barbersRes?.barbers || []);
      setServicesList(servicesRes?.services || []);

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

  const applyPayment = async (
    appointmentId: string,
    extras: {
      paymentMethodCollected?: 'cash' | 'transfer' | 'mixed';
      paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'refunded';
      amountPaid?: number;
      cashAmount?: number;
      transferAmount?: number;
    },
  ) => {
    try {
      setSavingPayment(true);
      await updateAppointmentStatus(appointmentId, 'completed', extras);
      setPaymentModal(null);
      await loadData(true, selectedDateRef.current);
    } catch (err: any) {
      setError(err?.message ?? 'Error');
    } finally {
      setSavingPayment(false);
    }
  };

  const openPaymentModal = (appointmentId: string) => {
    const appointment = appointments.find(item => item._id === appointmentId);
    const totalAmount = Number(
      appointment?.amountTotal ?? appointment?.servicePrice ?? 0,
    );
    setMixedMode(false);
    setCashInput('');
    setTransferInput('');
    setPaymentModal({ appointmentId, total: totalAmount });
  };

  const confirmMixedPayment = () => {
    if (!paymentModal) return;
    const cash = Number(cashInput.replace(',', '.')) || 0;
    const transfer = Number(transferInput.replace(',', '.')) || 0;
    const sum = Number((cash + transfer).toFixed(2));
    if (sum <= 0) {
      Alert.alert(
        'Montos inválidos',
        'Ingresá cuánto se pagó en efectivo y/o transferencia.',
      );
      return;
    }
    applyPayment(paymentModal.appointmentId, {
      paymentMethodCollected: 'mixed',
      paymentStatus: 'paid',
      amountPaid: sum,
      cashAmount: cash,
      transferAmount: transfer,
    });
  };

  const handleComplete = (appointmentId: string) => {
    Alert.alert(
      'Finalizar turno',
      '¿Deseas marcar este turno como completado?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, finalizar',
          onPress: () => openPaymentModal(appointmentId),
        },
      ],
    );
  };

  const handleUndoCharge = (appointmentId: string) => {
    Alert.alert(
      'Deshacer cobro',
      'El turno vuelve a "pendiente" y sale de la caja y las métricas. Vas a poder cobrarlo de nuevo o eliminarlo.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, deshacer',
          onPress: async () => {
            try {
              await updateAppointmentStatus(appointmentId, 'pending');
              await loadData(true, selectedDateRef.current);
            } catch (err: any) {
              setError(err?.message ?? 'No se pudo deshacer el cobro.');
            }
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
        {isCompleted && (
          <View style={styles.cardActions}>
            <Pressable
              style={[styles.btnAction, styles.btnSec]}
              onPress={() => handleUndoCharge(appointment._id)}
            >
              <Text style={styles.btnSecText}>Deshacer cobro</Text>
            </Pressable>
            <Pressable
              style={[styles.btnAction, styles.btnSec]}
              onPress={() => handleRelease(appointment._id)}
            >
              <Text style={styles.btnSecText}>Eliminar</Text>
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

  // ===== Vista Calendario (agenda del día tipo timeline) =====
  const CAL_HOUR_H = 104;
  const CAL_HEADER_H = 52;
  const CAL_COL_W = 158;

  const calColBarbers = useMemo(() => {
    if (barbersFull.length) {
      return barbersFull.map((b: any) => ({
        id: String(b._id),
        name: b.fullName || businessCopy.staffSingular,
        raw: b,
      }));
    }
    const map = new Map<string, any>();
    appointments.forEach(a => {
      const b: any = a.barber;
      if (b && typeof b === 'object' && b._id) map.set(String(b._id), b);
    });
    return Array.from(map.entries()).map(([id, b]) => ({
      id,
      name: b.fullName || businessCopy.staffSingular,
      raw: b,
    }));
  }, [barbersFull, appointments, businessCopy]);

  const colorForBarber = (barberId: string) => {
    const idx = calColBarbers.findIndex(c => c.id === barberId);
    return CAL_PALETTE[(idx < 0 ? 0 : idx) % CAL_PALETTE.length];
  };

  const calStartMin = (iso: string) => {
    const [h, m] = formatTimeOnly(iso).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const hmToMin = (s: string) => {
    const [h, m] = String(s).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const barberRangesOf = (barber: any): { start: number; end: number }[] => {
    if (!barber) return [];
    const sr = Array.isArray(barber.scheduleRanges) ? barber.scheduleRanges : [];
    const ranges = sr
      .filter((r: any) => r?.start && r?.end)
      .map((r: any) => ({ start: hmToMin(r.start), end: hmToMin(r.end) }));
    if (ranges.length) return ranges;
    if (
      typeof barber.scheduleRange === 'string' &&
      barber.scheduleRange.includes('-')
    ) {
      const [a, b] = barber.scheduleRange.split('-').map((x: string) => x.trim());
      if (a && b) return [{ start: hmToMin(a), end: hmToMin(b) }];
    }
    return [];
  };

  const barberIntervalOf = (barber: any) =>
    Math.max(5, Number(barber?.bookingSlotIntervalMinutes) || 30);

  const apptsOfBarber = (barberId: string) =>
    appointments.filter(a => {
      const b: any = a.barber;
      return b && typeof b === 'object' && String(b._id) === barberId;
    });

  const freeSlotsOf = (barber: any, appts: Appointment[]) => {
    const ranges = barberRangesOf(barber);
    const interval = barberIntervalOf(barber);
    const busy = appts.map(a => {
      const s = calStartMin(a.startTime);
      return { s, e: s + occupiedMinutesOf(a) };
    });
    const out: { min: number; label: string }[] = [];
    ranges.forEach(r => {
      for (let m = r.start; m + interval <= r.end; m += interval) {
        const occ = busy.some(x => m >= x.s && m < x.e);
        if (!occ) {
          const hh = String(Math.floor(m / 60)).padStart(2, '0');
          const mm = String(m % 60).padStart(2, '0');
          out.push({ min: m, label: `${hh}:${mm}` });
        }
      }
    });
    return out;
  };

  const calRange = useMemo(() => {
    let minM = Infinity;
    let maxM = -Infinity;
    calColBarbers.forEach(col => {
      barberRangesOf(col.raw).forEach(r => {
        if (r.start < minM) minM = r.start;
        if (r.end > maxM) maxM = r.end;
      });
    });
    appointments.forEach(a => {
      const s = calStartMin(a.startTime);
      const e = s + occupiedMinutesOf(a);
      if (s < minM) minM = s;
      if (e > maxM) maxM = e;
    });
    if (!Number.isFinite(minM)) return { start: 9, end: 20 };
    return {
      start: Math.max(0, Math.floor(minM / 60)),
      end: Math.min(24, Math.ceil(maxM / 60)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calColBarbers, appointments]);

  const openQuickCreate = (
    barberId: string,
    barberName: string,
    label: string,
  ) => {
    setQcName('');
    setQcPhone('');
    setQcServiceIds(servicesList[0]?._id ? [String(servicesList[0]._id)] : []);
    setQuickCreate({ barberId, barberName, slot: label });
  };

  const toggleQcService = (id: string) => {
    setQcServiceIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const submitQuickCreate = async () => {
    if (!quickCreate) return;
    if (!qcName.trim()) {
      Alert.alert('Falta el nombre', 'Ingresá el nombre del cliente.');
      return;
    }
    if (qcPhone.trim().length < 6) {
      Alert.alert('Falta el teléfono', 'El teléfono (WhatsApp) es obligatorio.');
      return;
    }
    const selected = servicesList.filter(s =>
      qcServiceIds.includes(String(s._id)),
    );
    if (!selected.length) {
      Alert.alert('Falta el servicio', 'Elegí al menos un servicio.');
      return;
    }
    const totalDuration = selected.reduce(
      (a, s) => a + Number(s.durationMinutes || 30),
      0,
    );
    const totalPrice = selected.reduce((a, s) => a + Number(s.price || 0), 0);
    const serviceName = selected.map(s => s.name).join(' + ');
    const [hh, mm] = quickCreate.slot.split(':').map(Number);
    const d = selectedDate;
    const startTime = shopWallClockToISO(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      hh || 0,
      mm || 0,
    );
    try {
      setQcSaving(true);
      await createAppointment({
        barberId: quickCreate.barberId,
        customerName: qcName.trim(),
        service: serviceName,
        startTime,
        durationMinutes: totalDuration,
        servicePrice: totalPrice,
        notes: qcPhone.trim(),
        email: '',
        paymentMethod: 'cash',
      });
      setQuickCreate(null);
      await loadData(true, selectedDateRef.current);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo crear el turno.');
    } finally {
      setQcSaving(false);
    }
  };

  const openCalAppt = (appointment: Appointment) => {
    const subtitle = `${appointment.service} · ${formatTimeOnly(
      appointment.startTime,
    )}`;
    if (appointment.status === 'completed') {
      Alert.alert(appointment.customerName, subtitle, [
        { text: 'Cerrar', style: 'cancel' },
        {
          text: 'Deshacer cobro',
          onPress: () => handleUndoCharge(appointment._id),
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => handleRelease(appointment._id),
        },
      ]);
    } else {
      Alert.alert(appointment.customerName, subtitle, [
        { text: 'Cerrar', style: 'cancel' },
        {
          text: 'Cobrar y finalizar',
          onPress: () => handleComplete(appointment._id),
        },
        {
          text: 'Liberar',
          style: 'destructive',
          onPress: () => handleRelease(appointment._id),
        },
      ]);
    }
  };

  const renderCalendar = () => {
    const startHour = calRange.start;
    const endHour = calRange.end;
    const gridHeight = Math.max(CAL_HOUR_H, (endHour - startHour) * CAL_HOUR_H);

    if (!calColBarbers.length) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            Sin {businessCopy.staffPlural} cargados
          </Text>
        </View>
      );
    }

    const globalInterval = Math.min(
      ...calColBarbers.map(c => barberIntervalOf(c.raw)),
      30,
    );
    const ticks: number[] = [];
    for (let m = startHour * 60; m <= endHour * 60; m += globalInterval) {
      ticks.push(m);
    }
    const minToLabel = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(
        2,
        '0',
      )}`;
    const topOf = (m: number) => ((m - startHour * 60) / 60) * CAL_HOUR_H;

    return (
      <View style={{ flexDirection: 'row' }}>
        {/* Gutter de horas (fijo a la izquierda) */}
        <View style={{ width: 48 }}>
          <View style={{ height: CAL_HEADER_H }} />
          <View style={{ height: gridHeight }}>
            {ticks.map(m => (
              <Text
                key={m}
                style={[
                  styles.calHourLabel,
                  {
                    position: 'absolute',
                    top: topOf(m) - 7,
                    fontWeight: m % 60 === 0 ? '800' : '600',
                    opacity: m % 60 === 0 ? 1 : 0.6,
                  },
                ]}
              >
                {minToLabel(m)}
              </Text>
            ))}
          </View>
        </View>

        {/* Columnas de profesionales (scroll horizontal) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {calColBarbers.map(col => {
            const appts = apptsOfBarber(col.id);
            const free = freeSlotsOf(col.raw, appts);
            const interval = barberIntervalOf(col.raw);
            const color = colorForBarber(col.id);
            return (
              <View key={col.id} style={{ width: CAL_COL_W }}>
                <View style={[styles.calColHead, { height: CAL_HEADER_H }]}>
                  <View
                    style={[styles.calColDot, { backgroundColor: color }]}
                  />
                  <Text style={styles.calColHeadName} numberOfLines={1}>
                    {col.name}
                  </Text>
                </View>
                <View style={[styles.calGrid, { height: gridHeight }]}>
                  {ticks.map(m => (
                    <View
                      key={m}
                      style={[
                        styles.calColHourLine,
                        { top: topOf(m), opacity: m % 60 === 0 ? 1 : 0.4 },
                      ]}
                    />
                  ))}
                  {free.map(s => {
                    const top =
                      ((s.min - startHour * 60) / 60) * CAL_HOUR_H;
                    const height = Math.max(
                      24,
                      (interval / 60) * CAL_HOUR_H - 3,
                    );
                    return (
                      <Pressable
                        key={`f-${s.min}`}
                        onPress={() =>
                          openQuickCreate(col.id, col.name, s.label)
                        }
                        style={[styles.calFreeCol, { top: top + 1, height }]}
                      >
                        <Text style={styles.calFreePlusText} numberOfLines={1}>
                          ＋ {s.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {appts.map(a => {
                    const startMin = calStartMin(a.startTime);
                    const top =
                      ((startMin - startHour * 60) / 60) * CAL_HOUR_H;
                    const occ = occupiedMinutesOf(a);
                    const height = Math.max(34, (occ / 60) * CAL_HOUR_H - 3);
                    const endLabel = minToLabel(startMin + occ);
                    const isCompleted = a.status === 'completed';
                    return (
                      <Pressable
                        key={a._id}
                        onPress={() => openCalAppt(a)}
                        style={[
                          styles.calBlockCol,
                          {
                            top: top + 1,
                            height,
                            backgroundColor: hexToRgba(color, 0.16),
                            borderColor: color,
                            opacity: isCompleted ? 0.55 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.calBlockTime, { color }]}>
                          {formatTimeOnly(a.startTime)} – {endLabel}
                        </Text>
                        <Text style={styles.calBlockName} numberOfLines={1}>
                          {a.customerName}
                        </Text>
                        {height > 50 ? (
                          <Text style={styles.calBlockSvc} numberOfLines={1}>
                            {a.service}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
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
        <Pressable
          style={styles.headerSettingsBtn}
          onPress={() => setShowDataModal(true)}
          hitSlop={10}
        >
          <BarChart3 size={24} color={theme.textPrimary} />
        </Pressable>
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

        {/* Métricas e Historial ahora se acceden desde el botón "Datos" del menú inferior. */}

        <View style={styles.section}>
          <View style={styles.agendaTopRow}>
            {!isToday ? (
              <Pressable style={styles.todayButton} onPress={handleGoToToday}>
                <Text style={styles.todayButtonText}>Volver a hoy</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View style={styles.calViewToggle}>
              {(['list', 'calendar'] as const).map(v => {
                const active = agendaView === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => changeAgendaView(v)}
                    style={[styles.calViewBtn, active && styles.calViewBtnActive]}
                  >
                    <Text
                      style={[
                        styles.calViewBtnText,
                        active && styles.calViewBtnTextActive,
                      ]}
                    >
                      {v === 'list' ? 'Lista' : 'Calendario'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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

          <View style={{ marginTop: agendaView === 'calendar' ? 8 : 20 }}>
            {loading && !appointments.length ? (
              <ActivityIndicator
                color={theme.primary}
                style={{ marginTop: 40 }}
              />
            ) : agendaView === 'calendar' ? (
              renderCalendar()
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
        visible={quickCreate !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setQuickCreate(null)}
      >
        <Pressable
          style={styles.qcOverlay}
          onPress={() => (qcSaving ? null : setQuickCreate(null))}
        >
          <Pressable style={styles.qcCard} onPress={() => {}}>
            <Text style={styles.qcTitle}>Nuevo turno</Text>
            <Text style={styles.qcSubtitle}>
              {quickCreate?.barberName} · {quickCreate?.slot} hs
            </Text>

            <TextInput
              style={styles.qcInput}
              placeholder="Nombre del cliente"
              placeholderTextColor={theme.placeholder}
              value={qcName}
              onChangeText={setQcName}
            />
            <TextInput
              style={styles.qcInput}
              placeholder="Teléfono (WhatsApp)"
              placeholderTextColor={theme.placeholder}
              keyboardType="phone-pad"
              value={qcPhone}
              onChangeText={t => setQcPhone(t.replace(/[^0-9+\s-]/g, ''))}
            />

            <Text style={styles.qcLabel}>Servicios (podés elegir varios)</Text>
            <ScrollView style={{ maxHeight: 190 }}>
              {servicesList.map(s => {
                const active = qcServiceIds.includes(String(s._id));
                return (
                  <Pressable
                    key={s._id}
                    onPress={() => toggleQcService(String(s._id))}
                    style={[styles.qcSvc, active && styles.qcSvcActive]}
                  >
                    <Text
                      style={[
                        styles.qcSvcName,
                        active && styles.qcSvcNameActive,
                      ]}
                    >
                      {active ? '✓ ' : ''}
                      {s.name}
                    </Text>
                    <Text style={styles.qcSvcMeta}>
                      {formatAppointmentPrice(Number(s.price || 0))}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              style={[styles.qcConfirm, qcSaving && { opacity: 0.6 }]}
              disabled={qcSaving}
              onPress={submitQuickCreate}
            >
              <Text style={styles.qcConfirmText}>
                {qcSaving ? 'Creando…' : 'Crear turno'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.qcCancel}
              disabled={qcSaving}
              onPress={() => setQuickCreate(null)}
            >
              <Text style={styles.qcCancelText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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

      <Modal
        visible={paymentModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentModal(null)}
      >
        <Pressable
          style={styles.pmOverlay}
          onPress={() => (savingPayment ? null : setPaymentModal(null))}
        >
          <Pressable style={styles.pmCard} onPress={() => {}}>
            <Text style={styles.pmTitle}>¿Cómo pagó este cliente?</Text>
            <Text style={styles.pmSubtitle}>
              Total del turno: {formatAppointmentPrice(paymentModal?.total ?? 0)}
            </Text>

            {!mixedMode ? (
              <>
                <Pressable
                  style={styles.pmOption}
                  disabled={savingPayment}
                  onPress={() =>
                    paymentModal &&
                    applyPayment(paymentModal.appointmentId, {
                      paymentMethodCollected: 'cash',
                      paymentStatus: 'paid',
                      amountPaid: paymentModal.total,
                    })
                  }
                >
                  <Text style={styles.pmOptionText}>Efectivo</Text>
                </Pressable>

                <Pressable
                  style={styles.pmOption}
                  disabled={savingPayment}
                  onPress={() =>
                    paymentModal &&
                    applyPayment(paymentModal.appointmentId, {
                      paymentMethodCollected: 'transfer',
                      paymentStatus: 'paid',
                      amountPaid: paymentModal.total,
                    })
                  }
                >
                  <Text style={styles.pmOptionText}>
                    Transferencia / adelantado
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.pmOption, styles.pmOptionMixed]}
                  disabled={savingPayment}
                  onPress={() => {
                    setMixedMode(true);
                    setCashInput('');
                    setTransferInput('');
                  }}
                >
                  <Text style={[styles.pmOptionText, styles.pmOptionTextMixed]}>
                    Pago mixto (efectivo + transferencia)
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.pmOptionGhost}
                  disabled={savingPayment}
                  onPress={() =>
                    paymentModal &&
                    applyPayment(paymentModal.appointmentId, {
                      paymentStatus: 'unpaid',
                      amountPaid: 0,
                    })
                  }
                >
                  <Text style={styles.pmOptionGhostText}>Aún no pagó</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.pmInputRow}>
                  <Text style={styles.pmInputLabel}>Efectivo</Text>
                  <TextInput
                    style={styles.pmInput}
                    placeholder="0"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    value={cashInput}
                    onChangeText={setCashInput}
                  />
                </View>
                <View style={styles.pmInputRow}>
                  <Text style={styles.pmInputLabel}>Transferencia</Text>
                  <TextInput
                    style={styles.pmInput}
                    placeholder="0"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    value={transferInput}
                    onChangeText={setTransferInput}
                  />
                </View>

                {(() => {
                  const cash = Number(cashInput.replace(',', '.')) || 0;
                  const transfer = Number(transferInput.replace(',', '.')) || 0;
                  const sum = cash + transfer;
                  const total = paymentModal?.total ?? 0;
                  const diff = Number((total - sum).toFixed(2));
                  return (
                    <View style={styles.pmHintRow}>
                      <Text style={styles.pmHintText}>
                        Ingresado: {formatAppointmentPrice(sum)}
                      </Text>
                      <Text
                        style={[
                          styles.pmHintText,
                          diff === 0 ? styles.pmHintOk : styles.pmHintWarn,
                        ]}
                      >
                        {diff === 0
                          ? 'Coincide con el total'
                          : diff > 0
                          ? `Falta ${formatAppointmentPrice(diff)}`
                          : `Sobra ${formatAppointmentPrice(Math.abs(diff))}`}
                      </Text>
                    </View>
                  );
                })()}

                <Pressable
                  style={[styles.pmConfirmBtn, savingPayment && { opacity: 0.6 }]}
                  disabled={savingPayment}
                  onPress={confirmMixedPayment}
                >
                  <Text style={styles.pmConfirmText}>
                    {savingPayment ? 'Guardando...' : 'Confirmar pago mixto'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.pmBackBtn}
                  disabled={savingPayment}
                  onPress={() => setMixedMode(false)}
                >
                  <Text style={styles.pmBackText}>Volver</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Datos del negocio (Métricas / Historial / Caja) */}
      <Modal
        visible={showDataModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDataModal(false)}
      >
        <Pressable
          style={styles.dataModalOverlay}
          onPress={() => setShowDataModal(false)}
        >
          <Pressable
            style={[
              styles.dataModalSheet,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.dataModalTitle, { color: theme.textPrimary }]}>
              Datos del negocio
            </Text>

            <Pressable
              style={[styles.dataModalOption, { borderColor: theme.border }]}
              onPress={() => {
                setShowDataModal(false);
                navigation.navigate('Owner-Metrics');
              }}
            >
              <TrendingUp size={22} color={theme.primary} />
              <View style={styles.dataModalOptionTextWrap}>
                <Text
                  style={[styles.dataModalOptionTitle, { color: theme.textPrimary }]}
                >
                  Métricas
                </Text>
                <Text style={[styles.dataModalOptionSub, { color: theme.textMuted }]}>
                  Facturación y turnos
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.dataModalOption, { borderColor: theme.border }]}
              onPress={() => {
                setShowDataModal(false);
                navigation.navigate('Customer-History');
              }}
            >
              <UserRound size={22} color={theme.primary} />
              <View style={styles.dataModalOptionTextWrap}>
                <Text
                  style={[styles.dataModalOptionTitle, { color: theme.textPrimary }]}
                >
                  Historial
                </Text>
                <Text style={[styles.dataModalOptionSub, { color: theme.textMuted }]}>
                  Servicios y clientes
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.dataModalOption, { borderColor: theme.border }]}
              onPress={() => {
                setShowDataModal(false);
                navigation.navigate('Caja');
              }}
            >
              <Wallet size={22} color={theme.primary} />
              <View style={styles.dataModalOptionTextWrap}>
                <Text
                  style={[styles.dataModalOptionTitle, { color: theme.textPrimary }]}
                >
                  Caja
                </Text>
                <Text style={[styles.dataModalOptionSub, { color: theme.textMuted }]}>
                  Ingresos, egresos y ganancia
                </Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
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
    nameText: { color: theme.textPrimary, fontSize: 20, fontWeight: '800', maxWidth: 260 },
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
    // Toggle Lista / Calendario
    calViewToggle: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 999,
      padding: 3,
      borderWidth: 1,
      borderColor: theme.border,
    },
    calViewBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
    calViewBtnActive: { backgroundColor: theme.primary },
    calViewBtnText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
    calViewBtnTextActive: { color: theme.textOnPrimary },
    // Calendario (timeline)
    calHourLabel: {
      width: 48,
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    calGrid: { position: 'relative', marginTop: 4 },
    calBlockTime: { fontSize: 11, fontWeight: '800' },
    calBlockName: { color: theme.textPrimary, fontSize: 13, fontWeight: '700' },
    calBlockSvc: { color: theme.textMuted, fontSize: 11 },
    calFreePlusText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 16,
    },
    calColHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    calColDot: { width: 8, height: 8, borderRadius: 4 },
    calColHeadName: {
      color: theme.textPrimary,
      fontWeight: '800',
      fontSize: 13,
      flex: 1,
    },
    calColHourLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: theme.border,
    },
    calFreeCol: {
      position: 'absolute',
      left: 4,
      right: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calBlockCol: {
      position: 'absolute',
      left: 3,
      right: 3,
      borderRadius: 10,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderWidth: 1,
      overflow: 'hidden',
    },
    // Popup quick-create
    qcOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 22,
    },
    qcCard: {
      backgroundColor: theme.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
      gap: 10,
    },
    qcTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: '800' },
    qcSubtitle: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 6,
    },
    qcInput: {
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.textPrimary,
      fontSize: 15,
    },
    qcLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 6,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    qcSvc: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 8,
      backgroundColor: theme.surfaceAlt,
    },
    qcSvcActive: {
      borderColor: theme.primary,
      backgroundColor: hexToRgba(theme.primary, 0.12),
    },
    qcSvcName: { color: theme.textPrimary, fontWeight: '700', fontSize: 14 },
    qcSvcNameActive: { color: theme.primary },
    qcSvcMeta: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    qcConfirm: {
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
      marginTop: 4,
    },
    qcConfirmText: {
      color: theme.textOnPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    qcCancel: { paddingVertical: 10, alignItems: 'center' },
    qcCancelText: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
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
    logo: { width: 42, height: 42 },
    headerSettingsBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },

    // Modal de cobro (pago mixto)
    pmOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    pmCard: {
      backgroundColor: theme.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
      gap: 10,
    },
    pmTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: '800' },
    pmSubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
    },
    pmOption: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    pmOptionText: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
    },
    pmOptionMixed: {
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderColor: theme.primary,
    },
    pmOptionTextMixed: { color: theme.primary },
    pmOptionGhost: { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
    pmOptionGhostText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    pmInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    pmInputLabel: { color: theme.textPrimary, fontSize: 15, fontWeight: '700' },
    pmInput: {
      flex: 1,
      maxWidth: 160,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'right',
    },
    pmHintRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 6,
    },
    pmHintText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    pmHintOk: { color: '#16a34a' },
    pmHintWarn: { color: theme.primary },
    pmConfirmBtn: {
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
    },
    pmConfirmText: {
      color: theme.textOnPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    pmBackBtn: { paddingVertical: 10, alignItems: 'center' },
    pmBackText: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },

    // Modal: Datos del negocio (Métricas / Historial / Caja)
    dataModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
      padding: 18,
      paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    },
    dataModalSheet: {
      borderRadius: 24,
      borderWidth: 1,
      padding: 18,
      gap: 12,
    },
    dataModalTitle: {
      fontSize: 17,
      fontWeight: '800',
      marginBottom: 4,
    },
    dataModalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
    },
    dataModalOptionTextWrap: {
      flex: 1,
    },
    dataModalOptionTitle: {
      fontSize: 15,
      fontWeight: '700',
    },
    dataModalOptionSub: {
      fontSize: 12.5,
      marginTop: 2,
    },
  });

export default Home;
