import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  Pressable,
  View,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import {
  fetchBarbers,
  Barber,
  createAppointment,
  fetchBarberAppointments,
  fetchServices,
  ServiceOption,
  PaymentMethod,
  getCurrentUser,
  PaymentSettings,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { getUserProfile } from '../services/authStorage';
import { resolveUserRole } from '../services/subscriptionAccess';

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized.length === 3 ? sanitized.repeat(2) : sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatPrice = (value?: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const SHOP_TZ = 'America/Argentina/Cordoba';

function formatTimeInShopTZ(value: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: SHOP_TZ,
  }).formatToParts(new Date(value));
  const hh = parts.find(p => p.type === 'hour')?.value ?? '00';
  const mm = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${hh}:${mm}`;
}

function formatDateInShopTZ(value: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const year = parts.find(p => p.type === 'year')?.value ?? '0000';
  const month = parts.find(p => p.type === 'month')?.value ?? '00';
  const day = parts.find(p => p.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

function getOffsetMinutesInShopTZ(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TZ,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const offsetText = parts.find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = offsetText.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) return 0;

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function getReliableOffsetMinutesInShopTZ(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    getPart('year'),
    getPart('month') - 1,
    getPart('day'),
    getPart('hour'),
    getPart('minute'),
    getPart('second'),
  );

  const offsetMinutes = Math.round((asUtc - date.getTime()) / 60000);
  if (Number.isFinite(offsetMinutes)) return offsetMinutes;

  return getOffsetMinutesInShopTZ(date);
}

function getWeekdayInShopTZ(value: string | number | Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TZ,
    weekday: 'short',
  }).format(new Date(value));

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[weekday] ?? new Date(value).getDay();
}

function buildIsoFromShopDateAndTime(dateValue: Date, slotLabel: string): string {
  const [year, month, day] = formatDateInShopTZ(dateValue).split('-').map(Number);
  const [hour, minute] = slotLabel.split(':').map(Number);
  const startUtcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMinutes = getReliableOffsetMinutesInShopTZ(new Date(startUtcGuess));
  return new Date(startUtcGuess - offsetMinutes * 60_000).toISOString();
}

function labelToMinutes(label: string): number {
  const [hour, minute] = label.split(':').map(Number);
  return hour * 60 + minute;
}

function getCurrentMinutesInShopTZ(now: number): number {
  return labelToMinutes(formatTimeInShopTZ(now));
}

const DAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

type SlotGroup = { label: string; slots: string[] };
type ResolvedBarberSchedule = {
  scheduleRange: string | null;
  scheduleRanges: { label: string; start: string; end: string }[];
};
type OccupiedRange = { start: number; end: number };
type BarberTimeBlock = {
  date: string;
  start: string;
  end: string;
  message?: string | null;
};

type PaymentOption = {
  value: PaymentMethod;
  label: string;
  helper: string;
};

function getPaymentOptions(settings?: PaymentSettings | null): PaymentOption[] {
  const normalized = settings ?? {};
  const options: PaymentOption[] = [];

  if (normalized.cashEnabled !== false) {
    options.push({
      value: 'cash',
      label: 'Cobro en el local',
      helper: 'Las reservas cargadas desde la app se cobran presencialmente en el local.',
    });
  }

  return options;
}

function normalizeScheduleRanges(input?: ResolvedBarberSchedule['scheduleRanges']) {
  if (!Array.isArray(input)) return [];
  return input.filter(
    item => item?.start?.trim() && item?.end?.trim(),
  );
}

function normalizeOverrideValidFrom(value?: string | null) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '1970-01-01';
}

function resolveBarberScheduleForDate(
  barber: Barber | null,
  date: Date,
): ResolvedBarberSchedule {
  if (!barber) {
    return { scheduleRange: null, scheduleRanges: [] };
  }

  const weekday = date.getDay();
  const override =
    barber.dayScheduleOverrides
      ?.filter(item => Number(item.day) === weekday)
      .map(item => ({
        ...item,
        validFrom: normalizeOverrideValidFrom(item.validFrom),
        useBase: Boolean(item.useBase),
      }))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;

  if (override) {
    if (override.useBase) {
      return {
        scheduleRange: barber.scheduleRange ?? null,
        scheduleRanges: normalizeScheduleRanges(barber.scheduleRanges),
      };
    }

    const scheduleRanges = normalizeScheduleRanges(override.scheduleRanges);
    return {
      scheduleRange: scheduleRanges.length ? null : override.scheduleRange ?? null,
      scheduleRanges,
    };
  }

  return {
    scheduleRange: barber.scheduleRange ?? null,
    scheduleRanges: normalizeScheduleRanges(barber.scheduleRanges),
  };
}

function ReservasForm({ navigation, route }: any) {
  const { theme, businessCopy } = useTheme();
  const routeBarberId = route?.params?.barberId ?? null;
  const routeLockBarber = Boolean(route?.params?.lockBarber);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [servicePickerVisible, setServicePickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [occupiedRanges, setOccupiedRanges] = useState<OccupiedRange[]>([]);
  const [barberTimeBlocks, setBarberTimeBlocks] = useState<BarberTimeBlock[]>([]);
  const [selectedBarberSchedule, setSelectedBarberSchedule] =
    useState<ResolvedBarberSchedule | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [closedDayNotice, setClosedDayNotice] = useState('');
  const [isBarberUser, setIsBarberUser] = useState(false);
  const [isBarberSelectionLocked, setIsBarberSelectionLocked] = useState(false);
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowTick(Date.now());
    }, 30_000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const storedUser = await getUserProfile<any>();
        const currentUserRes = await getCurrentUser().catch(() => null);
        const authUser = currentUserRes?.user ?? storedUser ?? null;
        const nextIsBarberUser = resolveUserRole(authUser) === 'barber';
        const ownBarberId = routeBarberId || authUser?.barberId || null;
        const [resS, barberResponse, resB] = await Promise.all([
          fetchServices(),
          nextIsBarberUser && ownBarberId
            ? fetchBarberAppointments(ownBarberId, formatDateInShopTZ(new Date())).catch(() => null)
            : Promise.resolve(null),
          !nextIsBarberUser ? fetchBarbers() : Promise.resolve(null),
        ]);
        const availableBarbers =
          nextIsBarberUser && barberResponse?.barber
            ? [barberResponse.barber]
            : resB?.barbers || [];

        setIsBarberUser(nextIsBarberUser);
        setIsBarberSelectionLocked(nextIsBarberUser || routeLockBarber);
        setBarbers(availableBarbers);
        setServices(resS.services || []);
        if (availableBarbers.length > 0) {
          setSelectedBarber(availableBarbers[0]._id);
        } else if (ownBarberId) {
          setSelectedBarber(ownBarberId);
        }
        if (resS.services?.length > 0) setSelectedService(resS.services[0]);

        const paymentSettings =
          currentUserRes?.user?.paymentSettings ??
          storedUser?.paymentSettings ??
          null;
        const nextOptions = getPaymentOptions(paymentSettings);
        setPaymentOptions(nextOptions);
        setPaymentMethod(nextOptions[0]?.value ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [routeBarberId, routeLockBarber]);

  useEffect(() => {
    if (!selectedBarber) return;
    async function loadBooked() {
      try {
        const dateStr = formatDateInShopTZ(selectedDate);
        const res = await fetchBarberAppointments(selectedBarber!, dateStr);
        const closureMessage = res.shopClosure?.isClosed
          ? res.shopClosure.message ||
            'Este día el local permanecerá cerrado. Elegí otro turno disponible.'
          : res.barberClosure?.isClosed
            ? res.barberClosure.message ||
              'Este barbero no atenderá ese día. Elegí otro profesional o seleccioná otra fecha.'
            : '';
        setClosedDayNotice(closureMessage);
        const busyRanges: OccupiedRange[] = [];
        res.appointments.forEach(a => {
          const label = formatTimeInShopTZ(a.startTime);
          const [h, m] = label.split(':').map(Number);
          const startMin = h * 60 + m;
          const occupiedDuration =
            (a.durationMinutes || 30) + (a.bufferAfterMinutesApplied || 0);
          busyRanges.push({
            start: startMin,
            end: startMin + occupiedDuration,
          });
        });
        setOccupiedRanges(busyRanges);
        setBarberTimeBlocks(res.barberTimeBlocks || []);
        if (res.resolvedSchedule) {
          setSelectedBarberSchedule({
            scheduleRange: res.resolvedSchedule.scheduleRange ?? null,
            scheduleRanges: normalizeScheduleRanges(
              res.resolvedSchedule.scheduleRanges,
            ),
          });
        } else {
          setSelectedBarberSchedule(null);
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadBooked();
  }, [selectedBarber, selectedDate]);

  useEffect(() => {
    if (!selectedBarber) {
      setSelectedBarberSchedule(null);
      setClosedDayNotice('');
      setBarberTimeBlocks([]);
      setOccupiedRanges([]);
    }
  }, [selectedBarber]);

  const selectedBarberData = useMemo(
    () => barbers.find(b => b._id === selectedBarber) || null,
    [barbers, selectedBarber],
  );

  const barbersForSelectedService = useMemo(() => {
    if (!selectedService?._id) return barbers;
    return barbers.filter(barber => {
      const serviceIds = (barber.serviceIds || []).map(String);
      return serviceIds.length === 0 || serviceIds.includes(selectedService._id);
    });
  }, [barbers, selectedService]);

  const visibleBarbers = isBarberSelectionLocked ? barbers : barbersForSelectedService;

  useEffect(() => {
    if (isBarberSelectionLocked) return;
    if (!selectedService) return;

    const selectedStillAvailable =
      selectedBarber &&
      barbersForSelectedService.some(barber => barber._id === selectedBarber);

    if (selectedStillAvailable) return;

    setSelectedBarber(barbersForSelectedService[0]?._id ?? null);
    setSelectedSlot(null);
  }, [
    barbersForSelectedService,
    isBarberSelectionLocked,
    selectedBarber,
    selectedService,
  ]);

  const isWorkDay = useMemo(() => {
    if (!selectedBarberData) return true;
    if (
      !selectedBarberData.workDays ||
      selectedBarberData.workDays.length === 0
    )
      return true;
    const dayOfWeek = getWeekdayInShopTZ(selectedDate);
    return selectedBarberData.workDays.map(Number).includes(dayOfWeek);
  }, [selectedBarberData, selectedDate]);

  const resolvedBarberSchedule = useMemo(
    () =>
      selectedBarberSchedule ||
      resolveBarberScheduleForDate(selectedBarberData, selectedDate),
    [selectedBarberData, selectedDate, selectedBarberSchedule],
  );

  // Genera grupos de slots — soporta horario corrido y turno cortado
  const horarioGroups = useMemo((): SlotGroup[] => {
    if (!isWorkDay || !selectedBarberData) return [];

    const step = selectedService?.durationMinutes ?? 30;

    const buildSlots = (startStr: string, endStr: string): string[] => {
      const parse = (t: string) => {
        const [h, m] = t.trim().split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const start = parse(startStr);
      const end = parse(endStr);
      const slots: string[] = [];
      for (let m = start; m + step <= end; m += step) {
        slots.push(
          `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(
            m % 60,
          ).padStart(2, '0')}`,
        );
      }
      return slots;
    };

    // Turno cortado
    const ranges = resolvedBarberSchedule.scheduleRanges;
    if (ranges && ranges.length > 0) {
      return ranges.map(r => ({
        label: r.label,
        slots: buildSlots(r.start, r.end),
      }));
    }

    // Horario corrido
    const range = resolvedBarberSchedule.scheduleRange || '09:00 - 18:00';
    const parts = range.split('-');
    if (parts.length < 2) return [];
    return [{ label: '', slots: buildSlots(parts[0], parts[1]) }];
  }, [isWorkDay, selectedBarberData, selectedService, resolvedBarberSchedule]);

  // Lista plana para validaciones
  const allSlots = useMemo(
    () => horarioGroups.flatMap(g => g.slots),
    [horarioGroups],
  );

  const isTodayInShop = useMemo(
    () => formatDateInShopTZ(selectedDate) === formatDateInShopTZ(nowTick),
    [selectedDate, nowTick],
  );

  const currentMinutesInShop = useMemo(
    () => getCurrentMinutesInShopTZ(nowTick),
    [nowTick],
  );

  const isSlotUnavailable = useCallback(
    (label: string) => {
      const startMinutes = labelToMinutes(label);
      const endMinutes = startMinutes + (selectedService?.durationMinutes ?? 30);
      const overlapsAppointment = occupiedRanges.some(
        range => range.start < endMinutes && range.end > startMinutes,
      );
      if (overlapsAppointment) return true;

      const overlapsBlockedTime = barberTimeBlocks.some(block => {
        const blockStart = labelToMinutes(block.start);
        const blockEnd = labelToMinutes(block.end);
        return blockStart < endMinutes && blockEnd > startMinutes;
      });
      if (overlapsBlockedTime) return true;

      if (!isTodayInShop) return false;
      return startMinutes <= currentMinutesInShop;
    },
    [
      barberTimeBlocks,
      currentMinutesInShop,
      isTodayInShop,
      occupiedRanges,
      selectedService,
    ],
  );

  useEffect(() => {
    if (!selectedSlot) return;
    if (!allSlots.includes(selectedSlot) || isSlotUnavailable(selectedSlot)) {
      setSelectedSlot(null);
    }
  }, [allSlots, selectedSlot, isSlotUnavailable]);

  useEffect(() => {
    if (!paymentOptions.length) {
      if (paymentMethod !== null) setPaymentMethod(null);
      return;
    }
    const currentOption = paymentOptions.find(option => option.value === paymentMethod);
    if (!currentOption) {
      setPaymentMethod(paymentOptions[0].value);
    }
  }, [paymentMethod, paymentOptions]);

  const handleSubmit = async () => {
    if (!customerName.trim() || !selectedSlot) {
      Alert.alert('Error', 'Por favor ingresa tu nombre y elige un horario.');
      return;
    }
    if (!selectedBarber) {
      Alert.alert('Error', 'Seleccioná un profesional disponible para este servicio.');
      return;
    }
    if (closedDayNotice) {
      Alert.alert('No disponible', closedDayNotice);
      return;
    }
    if (!paymentMethod) {
      Alert.alert(
        'Cobro no disponible',
        'Esta barbería no tiene un medio de pago habilitado para reservas desde la app.',
      );
      return;
    }
    setSaving(true);
    try {
      await createAppointment({
        barberId: selectedBarber!,
        customerName: customerName.trim(),
        service: selectedService?.name || 'Corte',
        startTime: buildIsoFromShopDateAndTime(selectedDate, selectedSlot),
        servicePrice: selectedService?.price ?? 0,
        notes: phone,
        email: customerEmail.trim(),
        durationMinutes: selectedService?.durationMinutes ?? 30,
        paymentMethod,
      });
      Alert.alert('¡Reserva Exitosa!', 'Tu turno ha sido agendado.', [
        { text: 'Cerrar', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      const msg = e?.message || 'No se pudo realizar la reserva. Intenta de nuevo.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const renderSlotGroup = (group: SlotGroup, index: number) => (
    <View key={index} style={index > 0 ? { marginTop: 14 } : undefined}>
      {group.label ? (
        <Text style={styles.shiftGroupLabel}>
          {group.label === 'mañana' ? '☀️ Mañana' : '🌙 Tarde'}
        </Text>
      ) : null}
      <View style={styles.timeGrid}>
        {group.slots.length > 0 ? (
          group.slots.map(label => {
            const isBooked = isSlotUnavailable(label);
            const isSelected = selectedSlot === label;
            return (
              <Pressable
                key={label}
                style={[
                  styles.timeChip,
                  isSelected && styles.timeChipActive,
                  isBooked && styles.timeChipBooked,
                ]}
                onPress={() => !isBooked && setSelectedSlot(label)}
                disabled={isBooked}
              >
                <Text
                  style={[styles.timeText, isBooked && styles.timeTextBooked]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    styles.timeDuration,
                    isBooked && styles.timeTextBooked,
                  ]}
                >
                  {selectedService?.durationMinutes ?? 30}min
                </Text>
              </Pressable>
            );
          })
        ) : (
          <Text
            style={{
              color: '#666',
              textAlign: 'center',
              width: '100%',
              marginTop: 10,
            }}
          >
            No hay turnos en este rango.
          </Text>
        )}
      </View>
    </View>
  );

  if (loading)
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Modal visible={servicePickerVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Seleccionar Servicio</Text>
            <ScrollView>
              {services.map(s => (
                <Pressable
                  key={s._id}
                  style={styles.serviceItem}
                  onPress={() => {
                    setSelectedService(s);
                    setSelectedSlot(null);
                    setServicePickerVisible(false);
                  }}
                >
                  <Text style={styles.serviceItemText}>{s.name}</Text>
                  <Text style={{ color: hexToRgba(theme.primary, 0.52) }}>
                    {s.durationMinutes} min · {formatPrice(s.price)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setServicePickerVisible(false)}
              style={{ marginTop: 10 }}
            >
              <Text
                style={{
                  color: theme.primary,
                  textAlign: 'center',
                  fontWeight: 'bold',
                }}
              >
                CERRAR
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.headerSubtitle}>Reserva tu lugar</Text>
            <Text style={styles.headerTitle}>Nueva Cita</Text>
          </View>

          <View style={styles.mainCard}>
            {/* SERVICIO */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Servicio deseado</Text>
              <Pressable
                style={styles.selector}
                onPress={() => setServicePickerVisible(true)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectorMainText}>
                    {selectedService?.name || 'Seleccionar...'}
                  </Text>
                  {selectedService ? (
                    <Text style={styles.selectorMeta}>
                      {selectedService.durationMinutes} min · {formatPrice(selectedService.price)}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.arrowIcon}>▼</Text>
              </Pressable>
            </View>

            {/* CLIENTE */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Información del cliente</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedField === 'name' && styles.inputFocused,
                ]}
                placeholder="Tu Nombre y Apellido"
                placeholderTextColor="#666"
                value={customerName}
                onChangeText={setCustomerName}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
              />
              <TextInput
                style={[
                  styles.input,
                  focusedField === 'phone' && styles.inputFocused,
                ]}
                placeholder="Tu Teléfono (WhatsApp)"
                placeholderTextColor="#666"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={text =>
                  setPhone(text.replace(/[^0-9+\s\-]/g, ''))
                }
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
              />
              <TextInput
                style={[
                  styles.input,
                  focusedField === 'email' && styles.inputFocused,
                ]}
                placeholder="Tu Email (para el comprobante)"
                placeholderTextColor="#666"
                keyboardType="email-address"
                autoCapitalize="none"
                value={customerEmail}
                onChangeText={setCustomerEmail}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>¿Cómo preferís pagar?</Text>
              {paymentOptions.length > 0 ? (
                <>
                  <View style={styles.paymentRow}>
                    {paymentOptions.map(option => (
                      <Pressable
                        key={option.value}
                        style={[
                          styles.paymentChip,
                          paymentMethod === option.value && styles.paymentChipActive,
                        ]}
                        onPress={() => setPaymentMethod(option.value)}
                      >
                        <Text
                          style={[
                            styles.paymentChipText,
                            paymentMethod === option.value &&
                              styles.paymentChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.paymentHelperText}>
                    {
                      paymentOptions.find(option => option.value === paymentMethod)
                        ?.helper
                    }
                  </Text>
                  <Text style={styles.paymentMiniNote}>
                    {Platform.OS === 'ios'
                      ? 'Elegí el medio disponible para esta reserva.'
                      : 'En la app solo dejamos cobro presencial. El pago online queda para las reservas desde la web.'}
                  </Text>
                </>
              ) : (
                <View style={styles.paymentUnavailableBox}>
                  <Text style={styles.paymentUnavailableTitle}>
                    Reservas sin cobro habilitado
                  </Text>
                  <Text style={styles.paymentUnavailableText}>
                    Este local todavía no configuró un medio de pago disponible
                    para tomar reservas desde la app.
                  </Text>
                </View>
              )}
            </View>

            {/* PROFESIONALES */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {isBarberSelectionLocked
                  ? `${businessCopy.staffSingularCapitalized} asignado`
                  : `Tu ${businessCopy.staffSingular}`}
              </Text>
              {isBarberUser ? (
                <Text style={styles.sectionHelperText}>
                  Los turnos manuales que cargues desde tu cuenta quedan asignados a tu agenda.
                </Text>
              ) : null}
              {!isBarberSelectionLocked && selectedService ? (
                <Text style={styles.sectionHelperText}>
                  Mostramos solo profesionales que realizan {selectedService.name}.
                </Text>
              ) : null}
              {visibleBarbers.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {visibleBarbers.map(b => (
                  <Pressable
                    key={b._id}
                    style={styles.barberCard}
                    disabled={isBarberSelectionLocked}
                    onPress={() => {
                      if (isBarberSelectionLocked) return;
                      setSelectedBarber(b._id);
                      setSelectedSlot(null);
                    }}
                  >
                    <View
                      style={[
                        styles.avatar,
                        selectedBarber === b._id && styles.avatarActive,
                      ]}
                    >
                      {b.photoUrl ? (
                        <Image
                          source={{ uri: b.photoUrl }}
                          style={styles.avatarImage}
                        />
                      ) : (
                        <Text style={styles.avatarText}>
                          {b.fullName.charAt(0)}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.barberName,
                        selectedBarber === b._id && styles.barberNameActive,
                      ]}
                    >
                      {b.fullName.split(' ')[0]}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              ) : (
                <Text style={styles.emptyBarberText}>
                  No hay profesionales asignados a este servicio.
                </Text>
              )}
            </View>

            {/* FECHA Y HORARIOS */}
            <View style={styles.section}>
              <View style={styles.dateHeader}>
                  <Text style={[styles.sectionLabel, styles.scheduleHeaderLabel]}>
                    Horarios{'\n'}Disponibles
                  </Text>
                <View style={styles.dateControls}>
                  <Pressable
                    hitSlop={12}
                    style={styles.navBtnWrap}
                    onPress={() => {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() - 1);
                      setSelectedDate(d);
                      setSelectedSlot(null);
                    }}
                  >
                    <Text style={styles.navBtn}>‹</Text>
                  </Pressable>
                  <Text style={styles.dateText}>
                    {DAY_NAMES[selectedDate.getDay()]} {selectedDate.getDate()}
                  </Text>
                  <Pressable
                    hitSlop={12}
                    style={styles.navBtnWrap}
                    onPress={() => {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() + 1);
                      setSelectedDate(d);
                      setSelectedSlot(null);
                    }}
                  >
                    <Text style={styles.navBtn}>›</Text>
                  </Pressable>
                </View>
              </View>

              {closedDayNotice ? (
                <View style={styles.notWorkingBox}>
                  <Text style={styles.notWorkingIcon}>🔒</Text>
                  <Text style={styles.notWorkingText}>ESTE TURNO NO ESTA DISPONIBLE ESE DIA</Text>
                  <Text
                    style={{
                      color: hexToRgba(theme.primary, 0.56),
                      fontSize: 12,
                      marginTop: 5,
                      textAlign: 'center',
                    }}
                  >
                    {closedDayNotice}
                  </Text>
                </View>
              ) : !isWorkDay ? (
                <View style={styles.notWorkingBox}>
                  <Text style={styles.notWorkingIcon}>🚫</Text>
                  <Text style={styles.notWorkingText}>
                    ESTE BARBERO NO ESTA DISPONIBLE ESTE DIA
                  </Text>
                  <Text
                    style={{
                      color: hexToRgba(theme.primary, 0.56),
                      fontSize: 12,
                      marginTop: 5,
                      textAlign: 'center',
                    }}
                  >
                    Intenta seleccionar otra fecha u otro barbero.
                  </Text>
                </View>
              ) : allSlots.length > 0 ? (
                horarioGroups.map((group, i) => renderSlotGroup(group, i))
              ) : (
                <Text
                  style={{
                    color: hexToRgba(theme.primary, 0.56),
                    textAlign: 'center',
                    width: '100%',
                    marginTop: 10,
                  }}
                >
                  No hay turnos configurados para este rango.
                </Text>
              )}
            </View>

            <Pressable
              style={[
                styles.submitBtn,
                (!paymentMethod ||
                  saving ||
                  Boolean(closedDayNotice) ||
                  !selectedBarber) &&
                  styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={saving || !paymentMethod || Boolean(closedDayNotice) || !selectedBarber}
            >
              {saving ? (
                <ActivityIndicator color={theme.textOnPrimary} />
              ) : (
                <Text style={styles.submitBtnText}>Confirmar Reserva</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: 150 },
    header: {
      marginTop: Platform.OS === 'ios' ? 60 : 20,
      paddingHorizontal: 25,
      marginBottom: 20,
    },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    headerTitle: { color: theme.textPrimary, fontSize: 32, fontWeight: '800' },
    mainCard: {
      marginHorizontal: 15,
      backgroundColor: theme.card,
      borderRadius: 32,
      padding: 20,
      gap: 20,
    },
    section: { gap: 10 },
    sectionLabel: {
      color: hexToRgba(theme.primary, 0.78),
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    sectionHelperText: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: -2,
      marginBottom: 2,
    },
    selector: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.input,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    selectorMainText: { color: theme.textPrimary, fontWeight: '600', fontSize: 16 },
    selectorMeta: { color: hexToRgba(theme.primary, 0.54), fontSize: 12, marginTop: 2 },
    arrowIcon: { color: theme.primary, fontSize: 14 },
    input: {
      backgroundColor: theme.input,
      borderRadius: 16,
      padding: 16,
      color: theme.textPrimary,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 5,
    },
    inputFocused: { borderColor: theme.primary },
    paymentRow: {
      flexDirection: 'row',
      gap: 10,
    },
    paymentChip: {
      flex: 1,
      backgroundColor: theme.input,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    paymentChipActive: {
      backgroundColor: hexToRgba(theme.primary, 0.16),
      borderColor: theme.primary,
    },
    paymentChipText: {
      color: hexToRgba(theme.primary, 0.6),
      fontSize: 14,
      fontWeight: '700',
    },
    paymentChipTextActive: {
      color: theme.primary,
    },
    paymentHelperText: {
      color: hexToRgba(theme.primary, 0.6),
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
    },
    paymentMiniNote: {
      color: hexToRgba(theme.primary, 0.42),
      fontSize: 11,
      lineHeight: 16,
      marginTop: 6,
    },
    paymentUnavailableBox: {
      backgroundColor: theme.input,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 6,
    },
    paymentUnavailableTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    paymentUnavailableText: {
      color: hexToRgba(theme.primary, 0.58),
      fontSize: 12,
      lineHeight: 18,
    },
    barberCard: { alignItems: 'center', marginRight: 10, width: 85 },
    avatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: theme.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
      overflow: 'hidden',
    },
    avatarActive: { borderColor: theme.primary, backgroundColor: theme.primary },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: { color: theme.textOnPrimary, fontSize: 19, fontWeight: 'bold' },
    barberName: { color: hexToRgba(theme.primary, 0.52), marginTop: 6, fontSize: 14, fontWeight: '600' },
    barberNameActive: { color: theme.textPrimary },
    barberSchedule: { color: hexToRgba(theme.primary, 0.35), fontSize: 10, marginTop: 2 },
    emptyBarberText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
    },
    dateHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 5,
      gap: 10,
    },
    scheduleHeaderLabel: {
      width: 96,
      lineHeight: 14,
    },
    dateControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.input,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 16,
      flexShrink: 1,
      flex: 1,
    },
    navBtnWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
    },
    navBtn: { color: theme.primary, fontSize: 34, fontWeight: 'bold', lineHeight: 36 },
    dateText: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      textTransform: 'capitalize',
      minWidth: 0,
      flex: 1,
      flexShrink: 1,
      textAlign: 'center',
    },
    timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    timeChip: {
      width: '22%',
      paddingVertical: 14,
      backgroundColor: theme.input,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    timeChipActive: { backgroundColor: '#00000081', borderColor: theme.primary },
    timeChipBooked: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      opacity: 0.5,
    },
    timeText: { color: theme.textPrimary, fontWeight: '700' },
    timeTextBooked: { color: theme.textMuted, textDecorationLine: 'line-through' },
    timeDuration: { color: hexToRgba(theme.primary, 0.5), fontSize: 9, marginTop: 2, fontWeight: '600' },
    shiftGroupLabel: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
    },
    notWorkingBox: {
      padding: 30,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 10,
      alignItems: 'center',
    },
    notWorkingIcon: { fontSize: 24, marginBottom: 10 },
    notWorkingText: {
      color: theme.primary,
      textAlign: 'center',
      fontWeight: '800',
      fontSize: 15,
      lineHeight: 22,
    },
    submitBtn: {
      backgroundColor: theme.primary,
      padding: 12,
      borderRadius: 15,
      alignItems: 'center',
      marginTop: 10,
      shadowColor: theme.primary,
      shadowOpacity: 0.3,
      shadowRadius: 10,
    },
    submitBtnDisabled: {
      opacity: 0.5,
    },
    submitBtnText: {
      color: theme.textOnPrimary,
      fontWeight: '600',
      fontSize: 17,
      textTransform: 'uppercase',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.9)',
      justifyContent: 'center',
      padding: 25,
    },
    modalCard: {
      backgroundColor: theme.card,
      borderRadius: 30,
      padding: 25,
      maxHeight: '70%',
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 20,
      textAlign: 'center',
    },
    serviceItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    serviceItemText: { color: theme.textPrimary, fontSize: 16, fontWeight: '600' },
  });

export default ReservasForm;
