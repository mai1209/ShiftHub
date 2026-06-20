import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Text,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
  PanResponder,
  Linking,
  Image,
  Modal,
  TextInput,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BarberDayCalendar from '../components/BarberDayCalendar';
import {
  Appointment,
  Barber,
  getCurrentUser,
  fetchBarberAppointments,
  updateAppointmentStatus,
  deleteAppointment,
} from '../services/api';
import {
  getUserProfile,
  saveUserProfile,
  subscribeToUserProfile,
} from '../services/authStorage';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/StackNavigation';
import { hasProPlanAccess } from '../services/planAccess';
import { resolveUserRole } from '../services/subscriptionAccess';
import ProFeatureModal from '../components/ProFeatureModal';
import {
  Pencil,
  BarChart2,
  Plus,
  Clock,
  Timer,
  CalendarOff,
  Scissors,
  User,
} from 'lucide-react-native';

const SHOP_TZ = 'America/Argentina/Cordoba';

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

const formatAppointmentPrice = (value: number) =>
  `$${Math.max(0, Number(value || 0)).toLocaleString('es-AR')}`;

const sanitizeWhatsappNumber = (value: string) => value.replace(/[^\d]/g, '');

type Props = NativeStackScreenProps<RootStackParamList, 'Barber-Home'>;

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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTimeOnly(value: string) {
  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SHOP_TZ,
  });
}

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

function capitalize(text: string) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
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

function BarberDashboard({ route, navigation }: Props) {
  const { theme, businessCopy } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [authUser, setAuthUser] = useState<any | null>(null);
  const { barberId, barberName, barber: initialBarber } = route.params ?? {};
  const activeBarberId = barberId ?? initialBarber?._id ?? authUser?.barberId ?? null;
  const resolvedBarberName =
    barberName ?? initialBarber?.fullName ?? authUser?.fullName ?? 'Mi Agenda';
  const isBarberUser = resolveUserRole(authUser) === 'barber';
  const canSelfEditProfile =
    !isBarberUser ||
    authUser?.barberProfileSettings?.barberSelfEditEnabled !== false;

  const [date, setDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [barberProfile, setBarberProfile] = useState<Barber | null>(
    initialBarber ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasProAccess, setHasProAccess] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
  const [agendaView, setAgendaView] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    AsyncStorage.getItem('BARBER_AGENDA_VIEW').then(v => {
      if (v === 'calendar' || v === 'list') setAgendaView(v);
    });
  }, []);

  const changeAgendaView = (v: 'list' | 'calendar') => {
    setAgendaView(v);
    AsyncStorage.setItem('BARBER_AGENDA_VIEW', v).catch(() => {});
  };

  // Modal de cobro (con pago mixto)
  const [paymentModal, setPaymentModal] = useState<{
    appointmentId: string;
    total: number;
  } | null>(null);
  const [mixedMode, setMixedMode] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [transferInput, setTransferInput] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const dateRef = useRef(date);
  const didInitDateEffect = useRef(false);
  const openedSwipeableIdRef = useRef<string | null>(null);
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const storedUser = await getUserProfile();
      if (mounted) {
        setAuthUser(storedUser);
        setHasProAccess(hasProPlanAccess(storedUser));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribeToUserProfile(user => {
      setAuthUser(user);
      setHasProAccess(hasProPlanAccess(user));
    });
  }, []);

  const handleProFeaturePress = useCallback(() => {
    setShowProModal(true);
  }, []);

  const handleCloseProModal = useCallback(() => {
    setShowProModal(false);
  }, []);

  const handleOpenSubscriptionSettings = useCallback(() => {
    setShowProModal(false);
    navigation.navigate(Platform.OS === 'ios' ? 'Subscription-Settings' : 'Plans');
  }, [navigation]);

  const isToday = useMemo(() => isSameDay(date, new Date()), [date]);

  const formattedHeaderDate = useMemo(() => {
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }, [date]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const offset = index - 3;
      const itemDate = addDays(date, offset);

      return {
        key: `${itemDate.toISOString()}-${index}`,
        date: itemDate,
        isSelected: isSameDay(itemDate, date),
        isToday: isSameDay(itemDate, new Date()),
        dayName: new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(
          itemDate,
        ),
        dayNumber: new Intl.DateTimeFormat('es-AR', { day: '2-digit' }).format(
          itemDate,
        ),
      };
    });
  }, [date]);

  const dateParam = useMemo(() => formatDateParam(date), [date]);

  const loadAppointments = useCallback(async (silent = false) => {
    if (!activeBarberId) {
      setAppointments([]);
      setBarberProfile(initialBarber ?? null);
      setError(`No encontramos el perfil del ${businessCopy.staffSingular}`);
      setLoading(false);
      return;
    }

    try {
      if (!silent) setLoading(true);
      const appointmentsRes = await fetchBarberAppointments(activeBarberId, dateParam);

      setAppointments(
        // Los servicios por orden de llegada (walkIn) no son turnos de la
        // agenda: no se muestran ni ocupan horario en el calendario.
        appointmentsRes.appointments.filter(
          (item: Appointment) => item.status !== 'cancelled' && !item.walkIn,
        ),
      );
      setBarberProfile(
        appointmentsRes.barber ?? initialBarber ?? null,
      );
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos cargar los turnos');
    } finally {
      setLoading(false);
    }
  }, [activeBarberId, dateParam, initialBarber]);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
      getCurrentUser()
        .then(response => {
          if (response?.user) {
            return saveUserProfile(response.user);
          }
        })
        .catch(() => {});
      const intervalId = setInterval(() => loadAppointments(true), 30000);
      return () => clearInterval(intervalId);
    }, [loadAppointments]),
  );

  useEffect(() => {
    if (!didInitDateEffect.current) {
      didInitDateEffect.current = true;
      return;
    }
    loadAppointments();
  }, [date, loadAppointments]);

  const handleShiftDate = (days: number) =>
    setDate(prev => addDays(prev, days));
  const handleSelectDate = (selected: Date) => setDate(selected);
  const handleGoToToday = () => setDate(new Date());

  const handleEditProfile = () => {
    if (!canSelfEditProfile) {
      Alert.alert(
        'Perfil bloqueado',
        `El administrador desactivó la edición del perfil del ${businessCopy.staffSingular}.`,
      );
      return;
    }

    if (barberProfile) {
      navigation.navigate('Register-Employed', {
        barber: barberProfile,
        selfEdit: isBarberUser,
      });
      return;
    }

    if (!activeBarberId) {
      return;
    }

    navigation.navigate('Register-Employed', {
      barber: {
        _id: activeBarberId,
        fullName: resolvedBarberName,
        workDays: [],
      },
      selfEdit: isBarberUser,
    });
  };

  const handleOpenProfileSection = (
    advancedSection: 'buffer' | 'closedDays' | 'timeBlocks',
  ) => {
    if (!canSelfEditProfile) {
      Alert.alert(
        'Perfil bloqueado',
        `El administrador desactivó la edición del perfil del ${businessCopy.staffSingular}.`,
      );
      return;
    }

    if (barberProfile) {
      navigation.navigate('Register-Employed', {
        barber: barberProfile,
        selfEdit: isBarberUser,
        advancedSection,
      });
      return;
    }

    handleEditProfile();
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
      const response = await updateAppointmentStatus(
        appointmentId,
        'completed',
        extras,
      );
      setAppointments(prev =>
        prev.map(app =>
          app._id === appointmentId ? response.appointment : app,
        ),
      );
      setPaymentModal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo actualizar');
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
              await loadAppointments();
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'No se pudo deshacer el cobro.');
            }
          },
        },
      ],
    );
  };

  const handleRelease = (appointmentId: string) => {
    const appointment = appointments.find(item => item._id === appointmentId);
    Alert.alert('Gestionar Turno', 'Elegí una acción:', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar (Solo App)',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAppointment(appointmentId);
            setAppointments(prev =>
              prev.filter(app => app._id !== appointmentId),
            );
          } catch (err: any) {
            Alert.alert('Error', 'No se pudo liberar');
          }
        },
      },
      {
        text: 'Cancelar y Avisar WhatsApp',
        onPress: async () => {
          try {
            if (!appointment?.notes) {
              Alert.alert('Sin contacto', 'No hay WhatsApp registrado.');
              return;
            }
            const phone = sanitizeWhatsappNumber(appointment.notes);
            await deleteAppointment(appointmentId);
            setAppointments(prev =>
              prev.filter(app => app._id !== appointmentId),
            );
            const message = buildCancellationMessage({
              shopName: resolvedBarberName || businessCopy.theBusiness,
              customerName: appointment.customerName,
              service: appointment.service,
              startTime: appointment.startTime,
            });
            await Linking.openURL(
              `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
            );
          } catch (err: any) {
            Alert.alert('Error', 'No se pudo cancelar');
          }
        },
      },
    ]);
  };

  const handleWaitingReminder = async (appointment: Appointment) => {
    try {
      if (!appointment?.notes) {
        Alert.alert('Sin contacto', 'No hay WhatsApp registrado.');
        return;
      }
      const phone = sanitizeWhatsappNumber(appointment.notes);
      const message = buildWaitingReminderMessage({
        shopName: resolvedBarberName || businessCopy.theBusiness,
        customerName: appointment.customerName,
      });
      await Linking.openURL(
        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      );
    } catch (_err) {
      Alert.alert('Error', 'No pudimos abrir WhatsApp.');
    }
  };

  const renderAppointmentCard = (appointment: Appointment, index: number) => {
    const isCompleted = appointment.status === 'completed';
    const paymentSnapshot = getPaymentSnapshot(appointment);

    const card = (
      <View
        style={[styles.appointmentCard, { marginTop: index === 0 ? 0 : 12 }]}
      >
        <View style={[styles.cardHeader, isCompleted && styles.dimContent]}>
          <View style={styles.timeTag}>
            <Clock size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
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

        <View style={[styles.cardBody, isCompleted && styles.dimContent]}>
          <Text style={styles.customerNameText}>
            {appointment.customerName}
          </Text>
          <View style={styles.serviceRow}>
            <Scissors size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
            <Text style={styles.serviceNameText}>{appointment.service}</Text>
            <Text style={styles.dotSeparator}>•</Text>
            <Text style={styles.durationText}>
              {appointment.durationMinutes || 60} min
            </Text>
          </View>
          {appointment.notes ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <User size={12} color={theme.textMuted} style={{ marginRight: 4 }} />
              <Text style={styles.phoneSubText}>{appointment.notes}</Text>
            </View>
          ) : null}
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
              style={[styles.btnAction, styles.btnUndo]}
              onPress={() => handleUndoCharge(appointment._id)}
            >
              <Text style={styles.btnUndoText}>Deshacer cobro</Text>
            </Pressable>
            <Pressable
              style={[styles.btnAction, styles.btnDelete]}
              onPress={() => handleRelease(appointment._id)}
            >
              <Text style={styles.btnDeleteText}>Eliminar</Text>
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

  // Memoizamos las cards: solo se reconstruyen si cambian los turnos o el tema,
  // no en cada render (ej. al tipear el cobro o en el auto-refresh).
  const appointmentCards = useMemo(
    () => appointments.map(renderAppointmentCard),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appointments, theme],
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerTextGroup}>
              <Text style={styles.headerSubtitle}>BARBER DASHBOARD</Text>
              <Text style={styles.headerTitle}>
                {barberProfile?.fullName || resolvedBarberName}
              </Text>
            </View>
            <Image style={styles.logo} source={theme.logo} />
          </View>

          <View style={styles.headerActionsContainer}>
            <Pressable
              onPress={() =>
                navigation.navigate('Reservas', {
                  barberId: isBarberUser ? activeBarberId ?? undefined : undefined,
                  lockBarber: isBarberUser,
                })
              }
              style={({ pressed }) => [
                styles.mainActionBtn,
                pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Plus size={20} color={theme.textOnPrimary} strokeWidth={2} />
              <Text style={styles.mainActionBtnText}>NUEVO TURNO</Text>
            </Pressable>

            <View style={styles.secondaryActionsRow}>
              {canSelfEditProfile ? (
                <Pressable
                  onPress={handleEditProfile}
                  style={({ pressed }) => [
                    styles.secondaryActionBtn,
                    pressed && { backgroundColor: hexToRgba(theme.primary, 0.2) },
                  ]}
                >
                  <Pencil size={14} color={theme.textSecondary} />
                  <Text style={styles.secondaryActionText}>Editar Perfil</Text>
                </Pressable>
              ) : null}

              {(Platform.OS !== 'ios' || hasProAccess) ? (
                <Pressable
                  onPress={() =>
                    hasProAccess
                      ? navigation.navigate('Metrics', {
                          barberId: activeBarberId ?? undefined,
                          barberName:
                            barberProfile?.fullName || resolvedBarberName,
                        })
                      : handleProFeaturePress()
                  }
                  style={({ pressed }) => [
                    styles.secondaryActionBtn,
                    !hasProAccess && styles.secondaryActionBtnLocked,
                    pressed && { backgroundColor: hexToRgba(theme.primary, 0.2) },
                  ]}
                >
                  <BarChart2 size={14} color={theme.textSecondary} />
                  <Text style={styles.secondaryActionText}>Métricas</Text>
                </Pressable>
              ) : null}
            </View>

            {canSelfEditProfile ? (
              <View style={styles.profileQuickActions}>
                <Pressable
                  onPress={() => handleOpenProfileSection('buffer')}
                  style={({ pressed }) => [
                    styles.profileQuickButton,
                    pressed && { backgroundColor: hexToRgba(theme.primary, 0.2) },
                  ]}
                >
                  <Timer size={15} color={theme.textSecondary} />
                  <Text style={styles.profileQuickButtonText}>Buffer</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleOpenProfileSection('closedDays')}
                  style={({ pressed }) => [
                    styles.profileQuickButton,
                    pressed && { backgroundColor: hexToRgba(theme.primary, 0.2) },
                  ]}
                >
                  <CalendarOff size={15} color={theme.textSecondary} />
                  <Text style={styles.profileQuickButtonText}>Días</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleOpenProfileSection('timeBlocks')}
                  style={({ pressed }) => [
                    styles.profileQuickButton,
                    pressed && { backgroundColor: hexToRgba(theme.primary, 0.2) },
                  ]}
                >
                  <Clock size={15} color={theme.textSecondary} />
                  <Text style={styles.profileQuickButtonText}>Bloqueos</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.agendaTopRow}>
            <View />
            <View style={styles.agendaTopRight}>
              {!isToday && (
                <Pressable style={styles.todayButton} onPress={handleGoToToday}>
                  <Text style={styles.todayButtonText}>Volver a hoy</Text>
                </Pressable>
              )}
              <View style={styles.calViewToggle}>
                {(['list', 'calendar'] as const).map(v => {
                  const active = agendaView === v;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => changeAgendaView(v)}
                      style={[
                        styles.calViewBtn,
                        active && styles.calViewBtnActive,
                      ]}
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
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {loading && !appointments.length ? (
              <ActivityIndicator
                color={theme.textSecondary}
                style={{ marginTop: 40 }}
              />
            ) : agendaView === 'calendar' ? (
              <BarberDayCalendar
                barber={barberProfile}
                appointments={appointments}
                theme={theme}
                date={date}
                onPressFree={label =>
                  navigation.navigate('Reservas', {
                    barberId: activeBarberId ?? undefined,
                    lockBarber: isBarberUser,
                    slot: label,
                  })
                }
                onPressAppt={appt =>
                  Alert.alert(
                    appt.customerName,
                    `${appt.service}\n${formatTimeOnly(appt.startTime)} · ${
                      appt.durationMinutes || 30
                    } min`,
                  )
                }
              />
            ) : appointments.length ? (
              appointmentCards
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Sin turnos hoy</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <ProFeatureModal
        visible={showProModal}
        variant="barber-metrics"
        theme={theme}
        onClose={handleCloseProModal}
        onOpenPlan={handleOpenSubscriptionSettings}
      />

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
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: 130 },
    header: {
      marginTop: Platform.OS === 'ios' ? 60 : 30,
      paddingHorizontal: 20,
      marginBottom: 25,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    headerTextGroup: { flex: 1 },
    logo: { width: 46, height: 46, resizeMode: 'contain' },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 3,
      textTransform: 'uppercase',
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 26,
      fontWeight: '900',
      marginTop: 4,
    },
    headerActionsContainer: { width: '100%', marginTop: 20, gap: 10 },
    mainActionBtn: {
      backgroundColor: theme.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 18,
      gap: 8,
    },
    mainActionBtnText: {
      color: theme.textOnPrimary,
      fontWeight: '800',
      fontSize: 12,
      letterSpacing: 1,
    },
    secondaryActionsRow: { flexDirection: 'row', gap: 10 },
    profileQuickActions: {
      flexDirection: 'row',
      gap: 8,
    },
    profileQuickButton: {
      flex: 1,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 14,
      gap: 6,
    },
    profileQuickButtonText: {
      color: theme.textSecondary,
      fontWeight: '800',
      fontSize: 12,
    },
    secondaryActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 12,
      borderRadius: 16,
      gap: 8,
    },
    secondaryActionBtnLocked: {
      borderColor: theme.border,
      opacity: 0.82,
    },
    secondaryActionText: {
      color: theme.textSecondary,
      fontWeight: '700',
      fontSize: 13,
    },
    section: { paddingHorizontal: 20 },
    agendaTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    sectionTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: '700' },
    agendaTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    calViewToggle: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 999,
      padding: 3,
      borderWidth: 1,
      borderColor: theme.border,
    },
    calViewBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
    calViewBtnActive: { backgroundColor: theme.primary },
    calViewBtnText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
    calViewBtnTextActive: { color: theme.textOnPrimary },
    todayButton: {
      backgroundColor: hexToRgba(theme.primary, 0.12),
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    todayButtonText: { color: theme.primary, fontSize: 12, fontWeight: '700' },

    // Date Selection (Mismo que Home)
    dateHeroCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.16),
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
    dateHeroTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: '800' },
    dateHeroSubtitle: { color: theme.textMuted, fontSize: 11, fontWeight: '500' },
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
    weekDayNumber: { color: theme.textPrimary, fontSize: 16, fontWeight: '800' },
    weekDayNumberActive: { color: theme.primary },

    // Appointment Card Redesign
    appointmentCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.14),
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
      backgroundColor: hexToRgba(theme.primary, 0.08),
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.18),
    },
    timeText: { color: theme.textPrimary, fontSize: 14, fontWeight: '800' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusBadgePending: { backgroundColor: hexToRgba(theme.primary, 0.1) },
    statusBadgeDone: { backgroundColor: 'rgba(49, 201, 108, 0.1)' },
    statusText: { fontSize: 10, fontWeight: '900' },
    statusTextPending: { color: theme.primary },
    statusTextDone: { color: '#66DA92' },
    cardBody: { marginBottom: 16 },
    customerNameText: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 6,
    },
    serviceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    serviceNameText: { color: theme.textSecondary, fontSize: 14, fontWeight: '600' },
    dotSeparator: { color: theme.textMuted, marginHorizontal: 8 },
    durationText: { color: theme.textMuted, fontSize: 13 },
    phoneSubText: { color: theme.textMuted, fontSize: 12, fontWeight: '500' },
    paymentInfoBadge: {
      marginTop: 10,
      alignSelf: 'flex-start',
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderWidth: 1,
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
    paymentInfoText: { color: theme.textSecondary, fontSize: 11, fontWeight: '700' },
    cardActions: {
      flexDirection: 'row',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: hexToRgba(theme.primary, 0.14),
      paddingTop: 16,
    },
    btnAction: {
      flex: 1,
      paddingHorizontal: 1,
      paddingVertical: 8,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dimContent: { opacity: 0.5 },
    btnUndo: {
      backgroundColor: hexToRgba(theme.primary, 0.14),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.45),
    },
    btnUndoText: { color: theme.primary, fontSize: 12, fontWeight: '800' },
    btnDelete: {
      backgroundColor: hexToRgba('#ef4444', 0.12),
      borderWidth: 1,
      borderColor: hexToRgba('#ef4444', 0.4),
    },
    btnDeleteText: { color: '#ef4444', fontSize: 12, fontWeight: '800' },
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
      borderColor: hexToRgba(theme.primary, 0.18),
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
    swipeActionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
      backgroundColor: hexToRgba(theme.primary, 0.05),
      borderRadius: 20,
      borderStyle: 'dashed',
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.18),
    },
    emptyTitle: { color: hexToRgba(theme.primary, 0.52), fontSize: 14, fontWeight: '600' },
    errorText: { color: '#ff7b7b', textAlign: 'center', marginBottom: 10 },

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
  });

export default BarberDashboard;
