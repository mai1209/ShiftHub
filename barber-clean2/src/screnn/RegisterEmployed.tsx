import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  Barber,
  createBarber,
  updateBarber,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import DateSelectModal from '../components/DateSelectModal';

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized.length === 3 ? sanitized.repeat(2) : sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type Props = {
  navigation: any;
  route?: {
    params?: {
      barber?: Barber;
      selfEdit?: boolean;
    };
  };
};

const DAYS_OF_WEEK = [
  { id: 0, label: 'D' },
  { id: 1, label: 'L' },
  { id: 2, label: 'M' },
  { id: 3, label: 'X' },
  { id: 4, label: 'J' },
  { id: 5, label: 'V' },
  { id: 6, label: 'S' },
];

const DAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const SHOP_TZ = 'America/Argentina/Cordoba';

const getTodayDateLabel = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find(part => part.type === 'year')?.value ?? '0000';
  const month = parts.find(part => part.type === 'month')?.value ?? '00';
  const day = parts.find(part => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
};

const normalizeOverrideValidFrom = (value?: string | null) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '1970-01-01';
};

type DayScheduleOverride = {
  day: number;
  validFrom?: string | null;
  useBase?: boolean;
  scheduleRange?: string | null;
  scheduleRanges?: { label: string; start: string; end: string }[];
};

type BarberClosedDay = {
  date: string;
  message?: string | null;
};

type BarberTimeBlock = {
  date: string;
  start: string;
  end: string;
  message?: string | null;
};

type ActivePicker =
  | 'start'
  | 'end'
  | 'morningStart'
  | 'morningEnd'
  | 'afternoonStart'
  | 'afternoonEnd'
  | 'overrideStart'
  | 'overrideEnd'
  | 'overrideMorningStart'
  | 'overrideMorningEnd'
  | 'overrideAfternoonStart'
  | 'overrideAfternoonEnd'
  | 'blockStart'
  | 'blockEnd'
  | null;

function resolveActiveDayOverride(
  overrides: DayScheduleOverride[],
  day: number | null,
  targetDate: string,
) {
  if (day == null) return null;
  return (
    overrides
      .filter(item => Number(item.day) === day)
      .map(item => ({
        ...item,
        validFrom: normalizeOverrideValidFrom(item.validFrom),
        useBase: Boolean(item.useBase),
      }))
      .sort((a, b) => b.validFrom!.localeCompare(a.validFrom!))[0] || null
  );
}

const normalizeClosedDayDate = (value?: string | null) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

const normalizeClosedDayMessage = (value?: string | null) => {
  const text = String(value ?? '').trim();
  return text.slice(0, 220);
};

const normalizeTimeBlockTime = (value?: string | null) => {
  const text = String(value ?? '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : '';
};

const normalizeTimeBlockMessage = (value?: string | null) => {
  const text = String(value ?? '').trim();
  return text.slice(0, 220);
};

const formatLastAccessLabel = (value?: string | null) => {
  if (!value) return 'Nunca ingresó';

  try {
    return new Date(value).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_error) {
    return 'Sin dato';
  }
};

const resolveAccessStateLabel = (loginAccess?: Barber['loginAccess']) => {
  if (!loginAccess?.enabled) return 'Sin acceso';
  if (loginAccess?.lastLoginAt) return 'Activo';
  return 'Nunca ingresó';
};

function formatClosedDayLabel(value: string) {
  const normalized = normalizeClosedDayDate(value);
  if (!normalized) return value;
  const date = new Date(`${normalized}T12:00:00`);
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: SHOP_TZ,
  }).format(date);
}

function RegisterEmployed({ navigation, route }: Props) {
  const { theme, businessCopy } = useTheme();
  const routeBarber = route?.params?.barber ?? null;
  const selfEdit = Boolean(route?.params?.selfEdit);
  const [barberToEdit, setBarberToEdit] = useState<Barber | null>(routeBarber);
  const isEditing = Boolean(barberToEdit?._id);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  // Horario corrido
  const [startMinutes, setStartMinutes] = useState(9 * 60);
  const [endMinutes, setEndMinutes] = useState(17 * 60);

  // Turno cortado
  const [splitShift, setSplitShift] = useState(false);
  const [morningStart, setMorningStart] = useState(8 * 60);
  const [morningEnd, setMorningEnd] = useState(12 * 60);
  const [afternoonStart, setAfternoonStart] = useState(16 * 60);
  const [afternoonEnd, setAfternoonEnd] = useState(22 * 60);

  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [dayScheduleOverrides, setDayScheduleOverrides] = useState<DayScheduleOverride[]>([]);
  const [barberClosedDays, setBarberClosedDays] = useState<BarberClosedDay[]>([]);
  const [bookingBufferMinutesInput, setBookingBufferMinutesInput] = useState('0');
  const [barberTimeBlocks, setBarberTimeBlocks] = useState<BarberTimeBlock[]>([]);
  const [closedDateInput, setClosedDateInput] = useState('');
  const [closedMessageInput, setClosedMessageInput] = useState('');
  const [isClosedDateModalVisible, setIsClosedDateModalVisible] = useState(false);
  const [blockDateInput, setBlockDateInput] = useState('');
  const [blockStartMinutes, setBlockStartMinutes] = useState(9 * 60);
  const [blockEndMinutes, setBlockEndMinutes] = useState(10 * 60);
  const [blockMessageInput, setBlockMessageInput] = useState('');
  const [isBlockDateModalVisible, setIsBlockDateModalVisible] = useState(false);
  const [selectedOverrideDay, setSelectedOverrideDay] = useState<number | null>(null);
  const [multiEditMode, setMultiEditMode] = useState(false);
  const [multiEditDays, setMultiEditDays] = useState<number[]>([]);
  const todayDateLabel = useMemo(() => getTodayDateLabel(), []);
  const selectedDaysRef = useRef<number[]>([]);
  const dayScheduleOverridesRef = useRef<DayScheduleOverride[]>([]);
  const barberClosedDaysRef = useRef<BarberClosedDay[]>([]);
  const barberTimeBlocksRef = useRef<BarberTimeBlock[]>([]);
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!barberToEdit) return;

    setFullName(barberToEdit.fullName ?? '');
    setEmail(barberToEdit.email ?? '');
    setPhone(barberToEdit.phone ?? '');
    setPhotoUrl(barberToEdit.photoUrl ?? '');
    setSelectedDays((barberToEdit.workDays || []).map(Number));
    selectedDaysRef.current = (barberToEdit.workDays || []).map(Number);
    setDayScheduleOverrides(barberToEdit.dayScheduleOverrides || []);
    dayScheduleOverridesRef.current = barberToEdit.dayScheduleOverrides || [];
    const nextClosedDays = (barberToEdit.barberClosedDays || [])
      .map(item => ({
        date: normalizeClosedDayDate(item.date),
        message: normalizeClosedDayMessage(item.message),
      }))
      .filter(item => item.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    setBarberClosedDays(nextClosedDays);
    barberClosedDaysRef.current = nextClosedDays;
    setBookingBufferMinutesInput(
      String(Math.max(0, Number(barberToEdit.bookingBufferMinutes || 0))),
    );
    const nextTimeBlocks = (barberToEdit.barberTimeBlocks || [])
      .map(item => ({
        date: normalizeClosedDayDate(item.date),
        start: normalizeTimeBlockTime(item.start),
        end: normalizeTimeBlockTime(item.end),
        message: normalizeTimeBlockMessage(item.message),
      }))
      .filter(item => item.date && item.start && item.end)
      .sort((a, b) =>
        a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
      );
    setBarberTimeBlocks(nextTimeBlocks);
    barberTimeBlocksRef.current = nextTimeBlocks;

    const hasSplitShift =
      Array.isArray(barberToEdit.scheduleRanges) && barberToEdit.scheduleRanges.length > 0;

    setSplitShift(hasSplitShift);

    if (hasSplitShift) {
      const morningRange = barberToEdit.scheduleRanges?.[0];
      const afternoonRange = barberToEdit.scheduleRanges?.[1];
      setMorningStart(parseTimeToMinutes(morningRange?.start, 8 * 60));
      setMorningEnd(parseTimeToMinutes(morningRange?.end, 12 * 60));
      setAfternoonStart(parseTimeToMinutes(afternoonRange?.start, 16 * 60));
      setAfternoonEnd(parseTimeToMinutes(afternoonRange?.end, 22 * 60));
    } else {
      const [rangeStart, rangeEnd] = parseScheduleRange(
        barberToEdit.scheduleRange,
        9 * 60,
        17 * 60,
      );
      setStartMinutes(rangeStart);
      setEndMinutes(rangeEnd);
    }
  }, [barberToEdit]);

  useEffect(() => {
    setBarberToEdit(routeBarber);
  }, [routeBarber]);

  useEffect(() => {
    selectedDaysRef.current = selectedDays;
    setDayScheduleOverrides(prev => {
      const next = prev.filter(item => selectedDays.includes(Number(item.day)));
      dayScheduleOverridesRef.current = next;
      return next;
    });

    if (!selectedDays.length) {
      setSelectedOverrideDay(null);
      return;
    }

    setSelectedOverrideDay(prev =>
      prev != null && selectedDays.includes(prev) ? prev : selectedDays[0],
    );
  }, [selectedDays]);

  const upsertClosedDay = useCallback((date: string, message: string) => {
    const normalizedDate = normalizeClosedDayDate(date);
    if (!normalizedDate) {
      Alert.alert('Fecha inválida', 'Usá el formato YYYY-MM-DD.');
      return;
    }

    const normalizedMessage = normalizeClosedDayMessage(message);
    const nextState = [...barberClosedDaysRef.current]
      .filter(item => item.date !== normalizedDate)
      .concat({
        date: normalizedDate,
        message:
          normalizedMessage ||
          `Este ${businessCopy.staffSingular} no atenderá ese día. Elegí otro profesional o seleccioná otra fecha.`,
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    barberClosedDaysRef.current = nextState;
    setBarberClosedDays(nextState);
    setClosedDateInput('');
    setClosedMessageInput('');
  }, [businessCopy.staffSingular]);

  const removeClosedDay = useCallback((date: string) => {
    const nextState = barberClosedDaysRef.current.filter(item => item.date !== date);
    barberClosedDaysRef.current = nextState;
    setBarberClosedDays(nextState);
  }, []);

  const upsertTimeBlock = useCallback(
    (
      date: string,
      startMinutesValue: number,
      endMinutesValue: number,
      message: string,
    ) => {
      const normalizedDate = normalizeClosedDayDate(date);
      if (!normalizedDate) {
        Alert.alert('Fecha inválida', 'Elegí una fecha válida para el bloqueo.');
        return;
      }

      if (!Number.isFinite(startMinutesValue) || !Number.isFinite(endMinutesValue)) {
        Alert.alert('Horario inválido', 'Elegí una hora de inicio y fin válida.');
        return;
      }

      if (endMinutesValue <= startMinutesValue) {
        Alert.alert(
          'Rango inválido',
          'La hora de fin tiene que ser posterior a la hora de inicio.',
        );
        return;
      }

      const normalizedMessage =
        normalizeTimeBlockMessage(message) ||
        'Este horario no está disponible para reservas.';
      const nextItem = {
        date: normalizedDate,
        start: formatMinutes(startMinutesValue),
        end: formatMinutes(endMinutesValue),
        message: normalizedMessage,
      };
      const nextState = [...barberTimeBlocksRef.current]
        .filter(
          item =>
            !(
              item.date === nextItem.date &&
              item.start === nextItem.start &&
              item.end === nextItem.end
            ),
        )
        .concat(nextItem)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
        );

      barberTimeBlocksRef.current = nextState;
      setBarberTimeBlocks(nextState);
      setBlockDateInput('');
      setBlockStartMinutes(9 * 60);
      setBlockEndMinutes(10 * 60);
      setBlockMessageInput('');
    },
    [],
  );

  const removeTimeBlock = useCallback((block: BarberTimeBlock) => {
    const nextState = barberTimeBlocksRef.current.filter(
      item =>
        !(
          item.date === block.date &&
          item.start === block.start &&
          item.end === block.end
        ),
    );
    barberTimeBlocksRef.current = nextState;
    setBarberTimeBlocks(nextState);
  }, []);

  useEffect(() => {
    setMultiEditDays(prev => prev.filter(day => selectedDays.includes(day)));
  }, [selectedDays]);

  const toggleDay = (id: number) => {
    setSelectedDays(prev =>
      {
        const next = prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id];
        selectedDaysRef.current = next;
        return next;
      },
    );
  };

  const formattedRange = useMemo(
    () => `${formatMinutes(startMinutes)} - ${formatMinutes(endMinutes)}`,
    [startMinutes, endMinutes],
  );

  const previewOverrideDay = useMemo(() => {
    if (multiEditMode && multiEditDays.length > 0) return multiEditDays[0];
    return selectedOverrideDay;
  }, [multiEditDays, multiEditMode, selectedOverrideDay]);

  const editingOverrideDays = useMemo(() => {
    if (multiEditMode) return multiEditDays;
    return selectedOverrideDay != null ? [selectedOverrideDay] : [];
  }, [multiEditDays, multiEditMode, selectedOverrideDay]);

  const editingOverrideDaysLabel = useMemo(() => {
    if (!editingOverrideDays.length) return '';
    return editingOverrideDays.map(day => DAY_NAMES[day]).join(', ');
  }, [editingOverrideDays]);

  const baseDayOverride = useMemo<DayScheduleOverride>(
    () =>
      splitShift
        ? {
            day: previewOverrideDay ?? 0,
            scheduleRange: null,
            scheduleRanges: [
              {
                label: 'mañana',
                start: formatMinutes(morningStart),
                end: formatMinutes(morningEnd),
              },
              {
                label: 'tarde',
                start: formatMinutes(afternoonStart),
                end: formatMinutes(afternoonEnd),
              },
            ],
          }
        : {
            day: previewOverrideDay ?? 0,
            scheduleRange: formattedRange,
            scheduleRanges: [],
          },
    [
      previewOverrideDay,
      splitShift,
      formattedRange,
      morningStart,
      morningEnd,
      afternoonStart,
      afternoonEnd,
    ],
  );

  const selectedOverrideConfig = useMemo(() => {
    return resolveActiveDayOverride(
      dayScheduleOverrides,
      previewOverrideDay,
      todayDateLabel,
    );
  }, [dayScheduleOverrides, previewOverrideDay, todayDateLabel]);

  const selectedOverrideIsSplit = useMemo(
    () =>
      Boolean(
        !selectedOverrideConfig?.useBase &&
          selectedOverrideConfig?.scheduleRanges?.length,
      ),
    [selectedOverrideConfig],
  );

  const selectedOverrideHasCustomSchedule = Boolean(
    selectedOverrideConfig && !selectedOverrideConfig.useBase,
  );

  const overrideSingleRange = useMemo(() => {
    const fallback = parseScheduleRange(baseDayOverride.scheduleRange, startMinutes, endMinutes);
    if (!selectedOverrideConfig?.scheduleRange) return fallback;
    return parseScheduleRange(selectedOverrideConfig.scheduleRange, fallback[0], fallback[1]);
  }, [selectedOverrideConfig, baseDayOverride, startMinutes, endMinutes]);

  const overrideMorningRange = useMemo(() => {
    const fallbackStart = morningStart;
    const fallbackEnd = morningEnd;
    const range = selectedOverrideConfig?.scheduleRanges?.[0];
    return [
      parseTimeToMinutes(range?.start, fallbackStart),
      parseTimeToMinutes(range?.end, fallbackEnd),
    ] as const;
  }, [selectedOverrideConfig, morningStart, morningEnd]);

  const overrideAfternoonRange = useMemo(() => {
    const fallbackStart = afternoonStart;
    const fallbackEnd = afternoonEnd;
    const range = selectedOverrideConfig?.scheduleRanges?.[1];
    return [
      parseTimeToMinutes(range?.start, fallbackStart),
      parseTimeToMinutes(range?.end, fallbackEnd),
    ] as const;
  }, [selectedOverrideConfig, afternoonStart, afternoonEnd]);

  // Título dinámico del picker
  const pickerTitle = useMemo(() => {
    switch (activePicker) {
      case 'start':
        return 'Horario de inicio';
      case 'end':
        return 'Horario de fin';
      case 'morningStart':
        return 'Mañana — Inicio';
      case 'morningEnd':
        return 'Mañana — Fin';
      case 'afternoonStart':
        return 'Tarde — Inicio';
      case 'afternoonEnd':
        return 'Tarde — Fin';
      case 'overrideStart':
        return 'Día especial — Inicio';
      case 'overrideEnd':
        return 'Día especial — Fin';
      case 'overrideMorningStart':
        return 'Día especial — Mañana inicio';
      case 'overrideMorningEnd':
        return 'Día especial — Mañana fin';
      case 'overrideAfternoonStart':
        return 'Día especial — Tarde inicio';
      case 'overrideAfternoonEnd':
        return 'Día especial — Tarde fin';
      case 'blockStart':
        return 'Bloqueo — Inicio';
      case 'blockEnd':
        return 'Bloqueo — Fin';
      default:
        return '';
    }
  }, [activePicker]);

  // Valor inicial del picker
  const pickerInitialValue = useMemo(() => {
    switch (activePicker) {
      case 'start':
        return startMinutes;
      case 'end':
        return endMinutes;
      case 'morningStart':
        return morningStart;
      case 'morningEnd':
        return morningEnd;
      case 'afternoonStart':
        return afternoonStart;
      case 'afternoonEnd':
        return afternoonEnd;
      case 'overrideStart':
        return overrideSingleRange[0];
      case 'overrideEnd':
        return overrideSingleRange[1];
      case 'overrideMorningStart':
        return overrideMorningRange[0];
      case 'overrideMorningEnd':
        return overrideMorningRange[1];
      case 'overrideAfternoonStart':
        return overrideAfternoonRange[0];
      case 'overrideAfternoonEnd':
        return overrideAfternoonRange[1];
      case 'blockStart':
        return blockStartMinutes;
      case 'blockEnd':
        return blockEndMinutes;
      default:
        return 0;
    }
  }, [
    activePicker,
    startMinutes,
    endMinutes,
    morningStart,
    morningEnd,
    afternoonStart,
    afternoonEnd,
    overrideSingleRange,
    overrideMorningRange,
    overrideAfternoonRange,
    blockStartMinutes,
    blockEndMinutes,
  ]);

  const buildDayOverrideEntry = (
    day: number,
    next: Omit<DayScheduleOverride, 'day'>,
  ): DayScheduleOverride => {
    const validFrom = todayDateLabel;
    return {
      day,
      validFrom,
      useBase: Boolean(next.useBase),
      scheduleRange: next.useBase
        ? null
        : next.scheduleRanges?.length
          ? null
          : next.scheduleRange ?? null,
      scheduleRanges: next.useBase ? [] : next.scheduleRanges ?? [],
    };
  };

  const upsertDayOverride = (
    day: number,
    next: Omit<DayScheduleOverride, 'day'>,
  ) => {
    setDayScheduleOverrides(prev => {
      const normalized = buildDayOverrideEntry(day, next);

      const index = prev.findIndex(item => Number(item.day) === day);
      if (index === -1) {
        const nextState = [...prev, normalized].sort(
          (a, b) =>
            a.day - b.day ||
            normalizeOverrideValidFrom(a.validFrom).localeCompare(
              normalizeOverrideValidFrom(b.validFrom),
            ),
        );
        dayScheduleOverridesRef.current = nextState;
        return nextState;
      }

      const updated = [...prev];
      updated[index] = normalized;
      dayScheduleOverridesRef.current = updated;
      return updated;
    });
  };

  const upsertMultipleDayOverrides = (
    days: number[],
    next: Omit<DayScheduleOverride, 'day'>,
  ) => {
    const uniqueDays = Array.from(new Set(days.map(Number))).filter(day =>
      selectedDaysRef.current.includes(day),
    );
    if (!uniqueDays.length) return;

    setDayScheduleOverrides(prev => {
      let nextState = [...prev];

      uniqueDays.forEach(day => {
        const normalized = buildDayOverrideEntry(day, next);
        const index = nextState.findIndex(item => Number(item.day) === day);

        if (index === -1) {
          nextState.push(normalized);
        } else {
          nextState[index] = normalized;
        }
      });

      nextState = nextState.sort(
        (a, b) =>
          a.day - b.day ||
          normalizeOverrideValidFrom(a.validFrom).localeCompare(
            normalizeOverrideValidFrom(b.validFrom),
          ),
      );

      dayScheduleOverridesRef.current = nextState;
      return nextState;
    });
  };

  const removeDayOverride = (day: number) => {
    setDayScheduleOverrides(prev => {
      const nextState = prev.filter(item => Number(item.day) !== day);
      dayScheduleOverridesRef.current = nextState;
      return nextState;
    });
  };

  const toggleMultiEditDay = (day: number) => {
    setMultiEditDays(prev =>
      prev.includes(day) ? prev.filter(item => item !== day) : [...prev, day],
    );
  };

  const applyOverrideToEditingDays = (
    next: Omit<DayScheduleOverride, 'day'>,
  ) => {
    if (!editingOverrideDays.length) return;
    if (editingOverrideDays.length === 1) {
      upsertDayOverride(editingOverrideDays[0], next);
      return;
    }
    upsertMultipleDayOverrides(editingOverrideDays, next);
  };

  const removeOverridesFromEditingDays = () => {
    if (!editingOverrideDays.length) return;
    setDayScheduleOverrides(prev => {
      const nextState = prev.filter(
        item => !editingOverrideDays.includes(Number(item.day)),
      );
      dayScheduleOverridesRef.current = nextState;
      return nextState;
    });
  };

  const enableSelectedDayOverride = () => {
    if (!editingOverrideDays.length) return;
    applyOverrideToEditingDays({
      scheduleRange: baseDayOverride.scheduleRange ?? null,
      scheduleRanges: baseDayOverride.scheduleRanges ?? [],
    });
  };

  const toggleSelectedDayOverrideMode = () => {
    if (!editingOverrideDays.length) return;
    if (!selectedOverrideHasCustomSchedule) {
      enableSelectedDayOverride();
      return;
    }

    if (selectedOverrideIsSplit) {
      applyOverrideToEditingDays({
        scheduleRange: `${formatMinutes(overrideMorningRange[0])} - ${formatMinutes(
          overrideAfternoonRange[1],
        )}`,
        scheduleRanges: [],
      });
      return;
    }

    applyOverrideToEditingDays({
      scheduleRange: null,
      scheduleRanges: [
        {
          label: 'mañana',
          start: formatMinutes(morningStart),
          end: formatMinutes(morningEnd),
        },
        {
          label: 'tarde',
          start: formatMinutes(afternoonStart),
          end: formatMinutes(afternoonEnd),
        },
      ],
    });
  };

  const handlePickerConfirm = (minutes: number) => {
    switch (activePicker) {
      case 'start':
        setStartMinutes(minutes);
        break;
      case 'end':
        setEndMinutes(minutes);
        break;
      case 'morningStart':
        setMorningStart(minutes);
        break;
      case 'morningEnd':
        setMorningEnd(minutes);
        break;
      case 'afternoonStart':
        setAfternoonStart(minutes);
        break;
      case 'afternoonEnd':
        setAfternoonEnd(minutes);
        break;
      case 'overrideStart':
        if (editingOverrideDays.length) {
          applyOverrideToEditingDays({
            scheduleRange: `${formatMinutes(minutes)} - ${formatMinutes(
              overrideSingleRange[1],
            )}`,
            scheduleRanges: [],
          });
        }
        break;
      case 'overrideEnd':
        if (editingOverrideDays.length) {
          applyOverrideToEditingDays({
            scheduleRange: `${formatMinutes(overrideSingleRange[0])} - ${formatMinutes(
              minutes,
            )}`,
            scheduleRanges: [],
          });
        }
        break;
      case 'overrideMorningStart':
        if (editingOverrideDays.length) {
          applyOverrideToEditingDays({
            scheduleRange: null,
            scheduleRanges: [
              {
                label: 'mañana',
                start: formatMinutes(minutes),
                end: formatMinutes(overrideMorningRange[1]),
              },
              {
                label: 'tarde',
                start: formatMinutes(overrideAfternoonRange[0]),
                end: formatMinutes(overrideAfternoonRange[1]),
              },
            ],
          });
        }
        break;
      case 'overrideMorningEnd':
        if (editingOverrideDays.length) {
          applyOverrideToEditingDays({
            scheduleRange: null,
            scheduleRanges: [
              {
                label: 'mañana',
                start: formatMinutes(overrideMorningRange[0]),
                end: formatMinutes(minutes),
              },
              {
                label: 'tarde',
                start: formatMinutes(overrideAfternoonRange[0]),
                end: formatMinutes(overrideAfternoonRange[1]),
              },
            ],
          });
        }
        break;
      case 'overrideAfternoonStart':
        if (editingOverrideDays.length) {
          applyOverrideToEditingDays({
            scheduleRange: null,
            scheduleRanges: [
              {
                label: 'mañana',
                start: formatMinutes(overrideMorningRange[0]),
                end: formatMinutes(overrideMorningRange[1]),
              },
              {
                label: 'tarde',
                start: formatMinutes(minutes),
                end: formatMinutes(overrideAfternoonRange[1]),
              },
            ],
          });
        }
        break;
      case 'overrideAfternoonEnd':
        if (editingOverrideDays.length) {
          applyOverrideToEditingDays({
            scheduleRange: null,
            scheduleRanges: [
              {
                label: 'mañana',
                start: formatMinutes(overrideMorningRange[0]),
                end: formatMinutes(overrideMorningRange[1]),
              },
              {
                label: 'tarde',
                start: formatMinutes(overrideAfternoonRange[0]),
                end: formatMinutes(minutes),
              },
            ],
          });
        }
        break;
      case 'blockStart':
        setBlockStartMinutes(minutes);
        if (minutes >= blockEndMinutes) {
          setBlockEndMinutes(Math.min(minutes + 15, 23 * 60 + 45));
        }
        break;
      case 'blockEnd':
        setBlockEndMinutes(minutes);
        break;
    }
    setActivePicker(null);
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert(
        'Dato requerido',
        `Por favor ingresa el nombre del ${businessCopy.staffSingular}.`,
      );
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert('Dato requerido', 'Selecciona al menos un día de trabajo.');
      return;
    }

    try {
      setLoading(true);
      const parsedBookingBufferMinutes = Number(bookingBufferMinutesInput || '0');
      if (
        !Number.isFinite(parsedBookingBufferMinutes) ||
        parsedBookingBufferMinutes < 0 ||
        parsedBookingBufferMinutes > 120
      ) {
        Alert.alert(
          'Buffer inválido',
          `El buffer general del ${businessCopy.staffSingular} tiene que estar entre 0 y 120 minutos.`,
        );
        return;
      }
      const cleanDays = Array.from(new Set(selectedDaysRef.current)).sort((a, b) => a - b);
      const cleanOverrides = dayScheduleOverridesRef.current
        .filter(item => cleanDays.includes(Number(item.day)))
        .map(item => ({
          day: Number(item.day),
          validFrom: item.validFrom ?? todayDateLabel,
          useBase: Boolean(item.useBase),
          scheduleRange: item.scheduleRange ?? null,
          scheduleRanges: item.scheduleRanges ?? [],
        }))
        .sort(
          (a, b) =>
            a.day - b.day ||
            normalizeOverrideValidFrom(a.validFrom).localeCompare(
              normalizeOverrideValidFrom(b.validFrom),
            ),
        );
      const cleanClosedDays = barberClosedDaysRef.current
        .map(item => ({
          date: normalizeClosedDayDate(item.date),
          message:
            normalizeClosedDayMessage(item.message) ||
            `Este ${businessCopy.staffSingular} no atenderá ese día. Elegí otro profesional o seleccioná otra fecha.`,
        }))
        .filter(item => item.date)
        .sort((a, b) => a.date.localeCompare(b.date));
      const cleanTimeBlocks = barberTimeBlocksRef.current
        .map(item => ({
          date: normalizeClosedDayDate(item.date),
          start: normalizeTimeBlockTime(item.start),
          end: normalizeTimeBlockTime(item.end),
          message:
            normalizeTimeBlockMessage(item.message) ||
            'Este horario no está disponible para reservas.',
        }))
        .filter(item => item.date && item.start && item.end && item.end > item.start)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

      const payload = {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
        scheduleRange: !splitShift ? formattedRange : undefined,
        scheduleRanges: splitShift
          ? [
              {
                label: 'mañana',
                start: formatMinutes(morningStart),
                end: formatMinutes(morningEnd),
              },
              {
                label: 'tarde',
                start: formatMinutes(afternoonStart),
                end: formatMinutes(afternoonEnd),
              },
            ]
          : [],
        bookingBufferMinutes: parsedBookingBufferMinutes,
        barberTimeBlocks: cleanTimeBlocks,
        barberClosedDays: cleanClosedDays,
        dayScheduleOverrides: cleanOverrides,
        workDays: cleanDays,
        isActive: true,
      };

      let savedBarber: Barber;

      if (isEditing && barberToEdit?._id) {
        const response = await updateBarber(barberToEdit._id, payload);
        savedBarber = response.barber;
      } else {
        const response = await createBarber(payload);
        savedBarber = response.barber;
      }

      const successMessage = isEditing
        ? `Los cambios del ${businessCopy.staffSingular} ya quedaron guardados.`
        : `${businessCopy.staffSingularCapitalized} registrado correctamente.`;

      Alert.alert('¡Éxito!', successMessage, [
        {
          text: isEditing ? 'Volver' : 'Ver lista',
          onPress: () => {
            if (isEditing) {
              navigation.replace('Barber-Home', {
                barberId: savedBarber._id,
                barberName: savedBarber.fullName,
                barber: savedBarber,
              });
              return;
            }

            navigation.navigate('List-Barber');
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo guardar el registro.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickPhoto = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth: 320,
        maxHeight: 320,
        quality: 0.5,
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'No se pudo abrir la galería.');
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('Error', 'No se pudo leer la imagen seleccionada.');
        return;
      }

      const mimeType = asset.type || 'image/jpeg';
      setPhotoUrl(`data:${mimeType};base64,${asset.base64}`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo seleccionar la imagen.');
    }
  };

  return (
    <>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.headerSubtitle}>ADMINISTRACIÓN</Text>
              <Text style={styles.headerTitle}>
                {isEditing
                  ? 'Editar perfil'
                  : `Nuevo ${businessCopy.staffSingularCapitalized}`}
              </Text>
            </View>

            <View style={styles.mainCard}>
              {/* INFO PERSONAL */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Información Personal</Text>
                <View style={styles.photoPreviewWrap}>
                  <Pressable
                    style={styles.photoPreviewCircle}
                    onPress={handlePickPhoto}
                  >
                    {photoUrl.trim() ? (
                      <Image
                        source={{ uri: photoUrl.trim() }}
                        style={styles.photoPreviewImage}
                      />
                    ) : (
                      <Text style={styles.photoPreviewInitial}>
                        {fullName.trim().charAt(0).toUpperCase() ||
                          businessCopy.staffSingularCapitalized.charAt(0)}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable onPress={handlePickPhoto}>
                    <Text style={styles.photoPreviewHint}>
                      {photoUrl.trim() ? 'Cambiar foto' : 'Tocar para elegir foto'}
                    </Text>
                  </Pressable>
                  {photoUrl.trim() ? (
                    <Pressable onPress={() => setPhotoUrl('')}>
                      <Text style={styles.photoRemoveText}>Quitar foto</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'name' && styles.inputFocused,
                  ]}
                  placeholder="Nombre y Apellido"
                  placeholderTextColor={theme.placeholder}
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                />
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'email' && styles.inputFocused,
                  ]}
                  placeholder="Email"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'phone' && styles.inputFocused,
                  ]}
                  placeholder="Tu Teléfono (WhatsApp)"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={text =>
                    setPhone(text.replace(/[^0-9+\s\-]/g, ''))
                  }
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {!selfEdit ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {`Acceso del ${businessCopy.staffSingular} a la app`}
                </Text>
              
                {isEditing ? (
                  <>
                    <View style={styles.accessSummaryCard}>
                      <Text style={styles.sectionHelperMuted}>
                        Estado: {resolveAccessStateLabel(barberToEdit?.loginAccess)}
                      </Text>
                      <Text style={styles.sectionHelperMuted}>
                        Último acceso:{' '}
                        {formatLastAccessLabel(barberToEdit?.loginAccess?.lastLoginAt)}
                      </Text>
                      <Text style={styles.sectionHelperMuted}>
                        Email:{' '}
                        {barberToEdit?.loginAccess?.email?.trim() || 'Sin acceso creado'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        if (!barberToEdit) return;
                        navigation.navigate('Barber-Access', { barber: barberToEdit });
                      }}
                      style={({ pressed }) => [
                        styles.accessManageButton,
                        pressed && styles.accessManageButtonPressed,
                      ]}
                    >
                      <Text style={styles.accessManageButtonText}>
                        {`Gestionar acceso del ${businessCopy.staffSingular}`}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.sectionHelperMuted}>
                    {`Guardá primero el ${businessCopy.staffSingular}. Después podés crearle el acceso desde la pantalla de gestión.`}
                  </Text>
                )}
              </View>
              ) : null}

              {/* DÍAS */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Días de atención</Text>
                <View style={styles.daysRow}>
                  {DAYS_OF_WEEK.map(day => {
                    const active = selectedDays.includes(day.id);
                    return (
                      <Pressable
                        key={day.id}
                        onPress={() => toggleDay(day.id)}
                        style={[
                          styles.dayCircle,
                          active && styles.dayCircleActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            active && styles.dayTextActive,
                          ]}
                        >
                          {day.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* RANGO HORARIO */}
              <View style={styles.section}>
                {/* Header con toggle */}
                <View style={styles.shiftHeader}>
                  <Text style={styles.sectionLabel}>Rango horario</Text>
                  <Pressable
                    style={[
                      styles.splitToggle,
                      splitShift && styles.splitToggleActive,
                    ]}
                    onPress={() => setSplitShift(prev => !prev)}
                  >
                    <Text
                      style={[
                        styles.splitToggleText,
                        splitShift && styles.splitToggleTextActive,
                      ]}
                    >
                       Doble Jornada
                    </Text>
                  </Pressable>
                </View>

                {!splitShift ? (
                  // HORARIO CORRIDO
                  <View style={styles.timeRow}>
                    <Pressable
                      style={styles.timeCard}
                      onPress={() => setActivePicker('start')}
                    >
                      <Text style={styles.timeLabel}>Inicio</Text>
                      <Text style={styles.timeValue}>
                        {formatMinutesAmPm(startMinutes)}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.timeCard}
                      onPress={() => setActivePicker('end')}
                    >
                      <Text style={styles.timeLabel}>Fin</Text>
                      <Text style={styles.timeValue}>
                        {formatMinutesAmPm(endMinutes)}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  // TURNO CORTADO
                  <>
                    <View style={styles.shiftBlock}>
                      <Text style={styles.shiftLabel}>☀️ Mañana</Text>
                      <View style={styles.timeRow}>
                        <Pressable
                          style={styles.timeCard}
                          onPress={() => setActivePicker('morningStart')}
                        >
                          <Text style={styles.timeLabel}>Inicio</Text>
                          <Text style={styles.timeValue}>
                            {formatMinutesAmPm(morningStart)}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.timeCard}
                          onPress={() => setActivePicker('morningEnd')}
                        >
                          <Text style={styles.timeLabel}>Fin</Text>
                          <Text style={styles.timeValue}>
                            {formatMinutesAmPm(morningEnd)}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.shiftDivider} />

                    <View style={styles.shiftBlock}>
                      <Text style={styles.shiftLabel}>🌙 Tarde</Text>
                      <View style={styles.timeRow}>
                        <Pressable
                          style={styles.timeCard}
                          onPress={() => setActivePicker('afternoonStart')}
                        >
                          <Text style={styles.timeLabel}>Inicio</Text>
                          <Text style={styles.timeValue}>
                            {formatMinutesAmPm(afternoonStart)}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.timeCard}
                          onPress={() => setActivePicker('afternoonEnd')}
                        >
                          <Text style={styles.timeLabel}>Fin</Text>
                          <Text style={styles.timeValue}>
                            {formatMinutesAmPm(afternoonEnd)}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.section}>
                <View style={styles.overrideHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionLabel}>Horario especial por día</Text>
                    <Text style={styles.overrideHeaderText}>
                      Si un día trabaja distinto, podés personalizarlo sin tocar el horario base.
                    </Text>
                    <Text style={styles.overrideHeaderSubtext}>
                      Los cambios nuevos se aplican desde hoy y no modifican fechas anteriores.
                    </Text>
                  </View>
                </View>

                {selectedDays.length ? (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.overrideDaysRow}
                    >
                      {selectedDays.map(day => {
                        const active = multiEditMode
                          ? multiEditDays.includes(day)
                          : selectedOverrideDay === day;
                        const activeOverride = resolveActiveDayOverride(
                          dayScheduleOverrides,
                          day,
                          todayDateLabel,
                        );
                        const hasCustom = Boolean(
                          activeOverride && !activeOverride.useBase,
                        );
                        return (
                          <Pressable
                            key={day}
                            onPress={() =>
                              multiEditMode
                                ? toggleMultiEditDay(day)
                                : setSelectedOverrideDay(day)
                            }
                            style={[
                              styles.overrideDayChip,
                              active && styles.overrideDayChipActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.overrideDayChipText,
                                active && styles.overrideDayChipTextActive,
                              ]}
                            >
                              {DAY_NAMES[day]}
                            </Text>
                            {hasCustom ? (
                              <Text style={styles.overrideDayChipMeta}>Personalizado</Text>
                            ) : (
                              <Text style={styles.overrideDayChipMeta}>Base</Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    <View style={styles.bulkApplyCard}>
                      <View style={styles.bulkApplyHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bulkApplyTitle}>
                            {multiEditMode ? 'Editando varios días' : 'Editar un solo día'}
                          </Text>
                          <Text style={styles.bulkApplyHint}>
                            {multiEditMode
                              ? 'Marcá los días y cualquier cambio se aplica a todos juntos.'
                              : 'Tocá un día para editarlo solo, o activá edición múltiple.'}
                          </Text>
                        </View>
                        <Pressable
                          style={[
                            styles.bulkApplyToggle,
                            multiEditMode && styles.bulkApplyToggleActive,
                          ]}
                          onPress={() => {
                            setMultiEditMode(prev => {
                              const next = !prev;
                              if (next) {
                                setMultiEditDays(
                                  selectedOverrideDay != null ? [selectedOverrideDay] : [],
                                );
                              } else {
                                setMultiEditDays([]);
                              }
                              return next;
                            });
                          }}
                        >
                          <Text
                            style={[
                              styles.bulkApplyToggleText,
                              multiEditMode && styles.bulkApplyToggleTextActive,
                            ]}
                          >
                            {multiEditMode ? 'Editar uno' : 'Editar varios'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    {previewOverrideDay != null ? (
                      <View style={styles.overrideCard}>
                        <View style={styles.overrideSelectionSummary}>
                          <Text style={styles.overrideSelectionSummaryLabel}>
                            {multiEditMode ? 'Días editando' : 'Día editando'}
                          </Text>
                          <Text style={styles.overrideSelectionSummaryValue}>
                            {editingOverrideDaysLabel}
                          </Text>
                        </View>
                        <View style={styles.overrideCardTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.overrideCardTitle}>
                              {multiEditMode
                                ? `${multiEditDays.length} día(s) seleccionados`
                                : DAY_NAMES[previewOverrideDay]}
                            </Text>
                            <Text style={styles.overrideCardHint}>
                              {multiEditMode
                                ? 'Los cambios que hagas acá se aplican a todos los días marcados.'
                                : selectedOverrideHasCustomSchedule
                                  ? 'Este día usa un horario distinto al base.'
                                  : 'Este día usa el horario base actual.'}
                            </Text>
                          </View>
                          <Pressable
                            style={[
                              styles.overrideToggle,
                              selectedOverrideHasCustomSchedule &&
                                styles.overrideToggleActive,
                            ]}
                            onPress={() =>
                              selectedOverrideHasCustomSchedule
                                ? removeOverridesFromEditingDays()
                                : enableSelectedDayOverride()
                            }
                          >
                            <Text
                              style={[
                                styles.overrideToggleText,
                                selectedOverrideHasCustomSchedule &&
                                  styles.overrideToggleTextActive,
                              ]}
                            >
                              {selectedOverrideHasCustomSchedule
                                ? 'Usando horario especial'
                                : 'Usar horario especial'}
                            </Text>
                          </Pressable>
                        </View>

                        {selectedOverrideHasCustomSchedule ? (
                          <>
                            <Pressable
                              style={[
                                styles.splitToggle,
                                selectedOverrideIsSplit && styles.splitToggleActive,
                              ]}
                              onPress={toggleSelectedDayOverrideMode}
                            >
                              <Text
                                style={[
                                  styles.splitToggleText,
                                  selectedOverrideIsSplit &&
                                    styles.splitToggleTextActive,
                                ]}
                              >
                                {selectedOverrideIsSplit
                                  ? 'Usando horario cortado'
                                  : 'Usar horario cortado'}
                              </Text>
                            </Pressable>

                            {!selectedOverrideIsSplit ? (
                              <View style={[styles.timeRow, { marginTop: 12 }]}>
                                <Pressable
                                  style={styles.timeCard}
                                  onPress={() => setActivePicker('overrideStart')}
                                >
                                  <Text style={styles.timeLabel}>Inicio</Text>
                                  <Text style={styles.timeValue}>
                                    {formatMinutesAmPm(overrideSingleRange[0])}
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={styles.timeCard}
                                  onPress={() => setActivePicker('overrideEnd')}
                                >
                                  <Text style={styles.timeLabel}>Fin</Text>
                                  <Text style={styles.timeValue}>
                                    {formatMinutesAmPm(overrideSingleRange[1])}
                                  </Text>
                                </Pressable>
                              </View>
                            ) : (
                              <>
                                <View style={[styles.shiftBlock, { marginTop: 12 }]}>
                                  <Text style={styles.shiftLabel}>☀️ Mañana</Text>
                                  <View style={styles.timeRow}>
                                    <Pressable
                                      style={styles.timeCard}
                                      onPress={() =>
                                        setActivePicker('overrideMorningStart')
                                      }
                                    >
                                      <Text style={styles.timeLabel}>Inicio</Text>
                                      <Text style={styles.timeValue}>
                                        {formatMinutesAmPm(overrideMorningRange[0])}
                                      </Text>
                                    </Pressable>
                                    <Pressable
                                      style={styles.timeCard}
                                      onPress={() =>
                                        setActivePicker('overrideMorningEnd')
                                      }
                                    >
                                      <Text style={styles.timeLabel}>Fin</Text>
                                      <Text style={styles.timeValue}>
                                        {formatMinutesAmPm(overrideMorningRange[1])}
                                      </Text>
                                    </Pressable>
                                  </View>
                                </View>

                                <View style={styles.shiftDivider} />

                                <View style={styles.shiftBlock}>
                                  <Text style={styles.shiftLabel}>🌙 Tarde</Text>
                                  <View style={styles.timeRow}>
                                    <Pressable
                                      style={styles.timeCard}
                                      onPress={() =>
                                        setActivePicker('overrideAfternoonStart')
                                      }
                                    >
                                      <Text style={styles.timeLabel}>Inicio</Text>
                                      <Text style={styles.timeValue}>
                                        {formatMinutesAmPm(overrideAfternoonRange[0])}
                                      </Text>
                                    </Pressable>
                                    <Pressable
                                      style={styles.timeCard}
                                      onPress={() =>
                                        setActivePicker('overrideAfternoonEnd')
                                      }
                                    >
                                      <Text style={styles.timeLabel}>Fin</Text>
                                      <Text style={styles.timeValue}>
                                        {formatMinutesAmPm(overrideAfternoonRange[1])}
                                      </Text>
                                    </Pressable>
                                  </View>
                                </View>
                              </>
                            )}
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.overrideEmptyText}>
                    Primero elegí al menos un día de atención para habilitar horarios especiales.
                  </Text>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {`Buffer general del ${businessCopy.staffSingular}`}
                </Text>
                <Text style={styles.closedDaysHint}>
                  {`Si este ${businessCopy.staffSingular} necesita tiempo fijo para limpiar o descansar entre turnos, cargalo acá como minutos extra.`}
                </Text>
                <TextInput
                  style={[styles.input, { marginTop: 12 }]}
                  placeholder="0"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="numeric"
                  value={bookingBufferMinutesInput}
                  onChangeText={setBookingBufferMinutesInput}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {`Días no disponibles del ${businessCopy.staffSingular}`}
                </Text>
                <Text style={styles.closedDaysHint}>
                  {`Si ${businessCopy.theBusiness} abre pero este ${businessCopy.staffSingular} falta, cargá la fecha acá para bloquear nuevos turnos y el motivo de falta.`}
                </Text>

                <View style={styles.closedDaysQuickRow}>
                  <Pressable
                    style={styles.closedDaysQuickChip}
                    onPress={() => setClosedDateInput(todayDateLabel)}
                  >
                    <Text style={styles.closedDaysQuickChipText}>Hoy</Text>
                  </Pressable>
                  <Pressable
                    style={styles.closedDaysQuickChip}
                    onPress={() => {
                      const nextDate = new Date(`${todayDateLabel}T12:00:00`);
                      nextDate.setDate(nextDate.getDate() + 1);
                      const yyyy = nextDate.getFullYear();
                      const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
                      const dd = String(nextDate.getDate()).padStart(2, '0');
                      setClosedDateInput(`${yyyy}-${mm}-${dd}`);
                    }}
                  >
                    <Text style={styles.closedDaysQuickChipText}>Mañana</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.closedDateInput}
                  onPress={() => setIsClosedDateModalVisible(true)}
                >
                  <View style={styles.closedDateInputIcon}>
                    <CalendarDays size={16} color={theme.primary} />
                  </View>
                  <View style={styles.closedDateInputBody}>
                    <Text style={styles.closedDateInputValue}>
                      {closedDateInput
                        ? formatClosedDayLabel(closedDateInput)
                        : 'Elegir fecha'}
                    </Text>
                    <Text style={styles.closedDateInputMeta}>
                      {closedDateInput || 'Tocá para abrir el calendario'}
                    </Text>
                  </View>
                </Pressable>
                <TextInput
                  style={[styles.input, styles.closedDaysMessageInput]}
                  placeholder="Motivo o mensaje para mostrar en la reserva"
                  placeholderTextColor={theme.placeholder}
                  value={closedMessageInput}
                  onChangeText={setClosedMessageInput}
                  multiline
                />

                <Pressable
                  style={styles.closedDaysSaveButton}
                  onPress={() => upsertClosedDay(closedDateInput, closedMessageInput)}
                >
                  <Text style={styles.closedDaysSaveButtonText}>Agregar día no disponible</Text>
                </Pressable>

                {barberClosedDays.length ? (
                  <View style={styles.closedDaysList}>
                    {barberClosedDays.map(item => (
                      <View key={item.date} style={styles.closedDayItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.closedDayItemTitle}>
                            {formatClosedDayLabel(item.date)}
                          </Text>
                          <Text style={styles.closedDayItemDate}>{item.date}</Text>
                          <Text style={styles.closedDayItemMessage}>
                            {item.message ||
                              `Este ${businessCopy.staffSingular} no atenderá ese día. Elegí otro profesional o seleccioná otra fecha.`}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.closedDayDeleteButton}
                          onPress={() => removeClosedDay(item.date)}
                        >
                          <Text style={styles.closedDayDeleteButtonText}>Quitar</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.closedDaysEmptyText}>
                    {`No hay fechas bloqueadas para este ${businessCopy.staffSingular}.`}
                  </Text>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Bloqueos por horario</Text>
                <Text style={styles.closedDaysHint}>
                  Usalo para cortar solo un tramo del día. Ejemplo: descanso, enfermedad o salida anticipada.
                </Text>

                <View style={styles.closedDaysQuickRow}>
                  <Pressable
                    style={styles.closedDaysQuickChip}
                    onPress={() => setBlockDateInput(todayDateLabel)}
                  >
                    <Text style={styles.closedDaysQuickChipText}>Hoy</Text>
                  </Pressable>
                  <Pressable
                    style={styles.closedDaysQuickChip}
                    onPress={() => setIsBlockDateModalVisible(true)}
                  >
                    <Text style={styles.closedDaysQuickChipText}>Elegir fecha</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.closedDateInput}
                  onPress={() => setIsBlockDateModalVisible(true)}
                >
                  <View style={styles.closedDateInputIcon}>
                    <CalendarDays size={16} color={theme.primary} />
                  </View>
                  <View style={styles.closedDateInputBody}>
                    <Text style={styles.closedDateInputValue}>
                      {blockDateInput ? formatClosedDayLabel(blockDateInput) : 'Elegir fecha'}
                    </Text>
                    <Text style={styles.closedDateInputMeta}>
                      {blockDateInput || 'Tocá para abrir el calendario'}
                    </Text>
                  </View>
                </Pressable>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={styles.sectionLabel}>Desde</Text>
                    <Pressable
                      style={styles.input}
                      onPress={() => setActivePicker('blockStart')}
                    >
                      <Text style={styles.closedDateInputValue}>
                        {formatMinutes(blockStartMinutes)}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={styles.sectionLabel}>Hasta</Text>
                    <Pressable
                      style={styles.input}
                      onPress={() => setActivePicker('blockEnd')}
                    >
                      <Text style={styles.closedDateInputValue}>
                        {formatMinutes(blockEndMinutes)}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <TextInput
                  style={[styles.input, styles.closedDaysMessageInput]}
                  placeholder="Motivo o mensaje para mostrar en la reserva"
                  placeholderTextColor={theme.placeholder}
                  value={blockMessageInput}
                  onChangeText={setBlockMessageInput}
                  multiline
                />

                <Pressable
                  style={styles.closedDaysSaveButton}
                  onPress={() =>
                    upsertTimeBlock(
                      blockDateInput,
                      blockStartMinutes,
                      blockEndMinutes,
                      blockMessageInput,
                    )
                  }
                >
                  <Text style={styles.closedDaysSaveButtonText}>Agregar bloqueo horario</Text>
                </Pressable>

                {barberTimeBlocks.length ? (
                  <View style={styles.closedDaysList}>
                    {barberTimeBlocks.map(item => (
                      <View
                        key={`${item.date}-${item.start}-${item.end}`}
                        style={styles.closedDayItem}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.closedDayItemTitle}>
                            {formatClosedDayLabel(item.date)}
                          </Text>
                          <Text style={styles.closedDayItemDate}>
                            {item.date} · {item.start} - {item.end}
                          </Text>
                          <Text style={styles.closedDayItemMessage}>
                            {item.message || 'Este horario no está disponible para reservas.'}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.closedDayDeleteButton}
                          onPress={() => removeTimeBlock(item)}
                        >
                          <Text style={styles.closedDayDeleteButtonText}>Quitar</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.closedDaysEmptyText}>
                    {`No hay bloqueos parciales cargados para este ${businessCopy.staffSingular}.`}
                  </Text>
                )}
              </View>

              {/* SUBMIT */}
              <View style={{ marginTop: 10 }}>
                <Pressable
                  onPress={handleSubmit}
                  style={styles.submitBtn}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.textOnPrimary} />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      {isEditing
                        ? 'Guardar cambios'
                        : `Registrar ${businessCopy.staffSingularCapitalized}`}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <TimeSelectModal
        visible={!!activePicker}
        title={pickerTitle}
        initialValueMinutes={pickerInitialValue}
        onClose={() => setActivePicker(null)}
        onConfirm={handlePickerConfirm}
        theme={theme}
        styles={styles}
      />
      <DateSelectModal
        visible={isClosedDateModalVisible}
        value={closedDateInput || todayDateLabel}
        title="Elegir fecha no disponible"
        theme={theme}
        onClose={() => setIsClosedDateModalVisible(false)}
        onConfirm={(date) => {
          setClosedDateInput(date);
          setIsClosedDateModalVisible(false);
        }}
      />
      <DateSelectModal
        visible={isBlockDateModalVisible}
        value={blockDateInput || todayDateLabel}
        title="Elegir fecha del bloqueo"
        theme={theme}
        onClose={() => setIsBlockDateModalVisible(false)}
        onConfirm={(date) => {
          setBlockDateInput(date);
          setIsBlockDateModalVisible(false);
        }}
      />
    </>
  );
}

function TimeSelectModal({
  visible,
  title,
  initialValueMinutes,
  onConfirm,
  onClose,
  theme,
  styles,
}: any) {
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const MINUTES = useMemo(() => [0, 15, 30, 45], []);

  useEffect(() => {
    if (!visible) return;
    const parts = minutesToPickerParts(initialValueMinutes);
    setPeriod(parts.period);
    setHour(parts.hour);
    setMinute(parts.minute);
  }, [visible, initialValueMinutes]);

  return (
    <Modal transparent visible={visible} animationType="slide">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={{ color: theme.primary, fontWeight: 'bold' }}>
                CERRAR
              </Text>
            </Pressable>
          </View>
          <View style={styles.timePickerSummary}>
            <Text style={styles.timePickerSummaryLabel}>Horario elegido</Text>
            <Text style={styles.timePickerSummaryValue}>
              {formatMinutesAmPm(
                pickerPartsToMinutes({ period, hour, minute }),
              )}
            </Text>
          </View>

          <View style={styles.timePickerSection}>
            <Text style={styles.timePickerSectionTitle}>Periodo</Text>
            <View style={styles.periodRow}>
              {(['AM', 'PM'] as const).map(item => (
                <Pressable
                  key={item}
                  onPress={() => setPeriod(item)}
                  style={[
                    styles.periodChip,
                    period === item && styles.periodChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.periodChipText,
                      period === item && styles.periodChipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.timePickerSection}>
            <Text style={styles.timePickerSectionTitle}>Hora</Text>
            <View style={styles.pickerGrid}>
              {HOURS.map(item => (
                <Pressable
                  key={item}
                  onPress={() => setHour(item)}
                  style={[
                    styles.pickerChip,
                    hour === item && styles.pickerChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.pickerChipText,
                      hour === item && styles.pickerChipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.timePickerSection}>
            <Text style={styles.timePickerSectionTitle}>Minutos</Text>
            <View style={styles.pickerGrid}>
              {MINUTES.map(item => (
                <Pressable
                  key={item}
                  onPress={() => setMinute(item)}
                  style={[
                    styles.pickerChip,
                    minute === item && styles.pickerChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.pickerChipText,
                      minute === item && styles.pickerChipTextActive,
                    ]}
                  >
                    {String(item).padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalBtn}
              onPress={() =>
                onConfirm(pickerPartsToMinutes({ period, hour, minute }))
              }
            >
              <Text style={styles.modalBtnText}>Confirmar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0',
  )}`;
}

function formatMinutesAmPm(totalMinutes: number) {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function minutesToPickerParts(totalMinutes: number): {
  period: 'AM' | 'PM';
  hour: number;
  minute: number;
} {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return {
    period: hours24 >= 12 ? 'PM' : 'AM',
    hour: hours24 % 12 || 12,
    minute: minutes,
  };
}

function pickerPartsToMinutes({
  period,
  hour,
  minute,
}: {
  period: 'AM' | 'PM';
  hour: number;
  minute: number;
}) {
  const normalizedHour = hour % 12;
  const hours24 = period === 'PM' ? normalizedHour + 12 : normalizedHour;
  return hours24 * 60 + minute;
}

function parseTimeToMinutes(value: string | undefined | null, fallback: number) {
  if (!value) return fallback;
  const [hour, minute] = String(value)
    .trim()
    .split(':')
    .map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return fallback;
  }

  return hour * 60 + minute;
}

function parseScheduleRange(value: string | undefined | null, fallbackStart: number, fallbackEnd: number) {
  if (!value) return [fallbackStart, fallbackEnd] as const;
  const parts = String(value).split('-');
  if (parts.length < 2) return [fallbackStart, fallbackEnd] as const;

  return [
    parseTimeToMinutes(parts[0], fallbackStart),
    parseTimeToMinutes(parts[1], fallbackEnd),
  ] as const;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scrollContent: {
      paddingBottom: 130,
      paddingTop: Platform.OS === 'ios' ? 20 : 0,
    },
    header: {
      marginTop: 50,
      paddingHorizontal: 25,
      alignItems: 'center',
      marginBottom: 20,
    },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 2,
    },
    headerTitle: { color: theme.textPrimary, fontSize: 32, fontWeight: '800', marginTop: 5 },
    mainCard: {
      marginHorizontal: 15,
      backgroundColor: theme.card,
      borderRadius: 32,
      padding: 24,
      gap: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    section: { gap: 12 },
    sectionLabel: {
      color: '#1C1C1C1',
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginLeft: 4,
      textDecorationLine: 'underline',
      textDecorationColor: '#1C1C1C1',
    },
 
    sectionHelperMuted: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginHorizontal: 4,
    },
    accessSummaryCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      padding: 14,
      gap: 6,
    },
    accessManageButton: {
      marginTop: 4,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.28),
      backgroundColor: hexToRgba(theme.primary, 0.1),
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accessManageButtonPressed: {
      opacity: 0.82,
    },
    accessManageButtonText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '800',
    },
    input: {
      backgroundColor: theme.input,
      borderRadius: 16,
      padding: 16,
      color: theme.textPrimary,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    inputFocused: { borderColor: theme.primary },
    photoPreviewWrap: {
      alignItems: 'center',
      marginBottom: 6,
      gap: 8,
    },
    photoPreviewCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoPreviewImage: {
      width: '100%',
      height: '100%',
    },
    photoPreviewInitial: {
      color: theme.primary,
      fontSize: 24,
      fontWeight: '900',
    },
    photoPreviewHint: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    photoRemoveText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
    dayCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.input,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    dayCircleActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    dayText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
    dayTextActive: { color: theme.textOnPrimary },
    timeRow: { flexDirection: 'row', gap: 12 },
    timeCard: {
      flex: 1,
      backgroundColor: theme.input,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    timeLabel: { color: theme.textMuted, fontSize: 11, textTransform: 'uppercase' },
    timeValue: { color: theme.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 4 },

    // TURNO CORTADO
    shiftHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    splitToggle: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    splitToggleActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    splitToggleText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'center',
    },
    splitToggleTextActive: { color: theme.textOnPrimary },
    shiftBlock: { gap: 8 },
    shiftLabel: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    shiftDivider: { height: 1, backgroundColor: theme.border, marginVertical: 4 },
    overrideHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    overrideHeaderText: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
      marginLeft: 4,
    },
    overrideHeaderSubtext: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 6,
      marginLeft: 4,
    },
    overrideDaysRow: {
      gap: 10,
      paddingRight: 6,
    },
    overrideDayChip: {
      minWidth: 110,
      borderRadius: 18,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 4,
    },
    overrideDayChipActive: {
      backgroundColor: hexToRgba(theme.primary, 0.16),
      borderColor: theme.primary,
    },
    overrideDayChipText: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    overrideDayChipTextActive: {
      color: theme.primary,
    },
    overrideDayChipMeta: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    overrideCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 12,
    },
    overrideSelectionSummary: {
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.24),
      gap: 2,
    },
    overrideSelectionSummaryLabel: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    overrideSelectionSummaryValue: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    bulkApplyCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 12,
    },
    bulkApplyHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    bulkApplyTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    bulkApplyHint: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },
    bulkApplyToggle: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
    },
    bulkApplyToggleActive: {
      backgroundColor: hexToRgba(theme.primary, 0.16),
      borderColor: theme.primary,
    },
    bulkApplyToggleText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
    bulkApplyToggleTextActive: {
      color: theme.primary,
    },
    bulkApplyDaysRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    bulkApplyDayChip: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
    },
    bulkApplyDayChipActive: {
      backgroundColor: hexToRgba(theme.primary, 0.16),
      borderColor: theme.primary,
    },
    bulkApplyDayChipText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
    bulkApplyDayChipTextActive: {
      color: theme.primary,
    },
    bulkApplyAction: {
      borderRadius: 16,
      backgroundColor: theme.primary,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bulkApplyActionDisabled: {
      opacity: 0.45,
    },
    bulkApplyActionText: {
      color: theme.textOnPrimary,
      fontSize: 13,
      fontWeight: '900',
    },
    overrideCardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    overrideCardTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
    },
    overrideCardHint: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight:17,
      marginTop: 4,
    },
    overrideToggle: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      alignSelf: 'flex-start',
    },
    overrideToggleActive: {
      backgroundColor: hexToRgba(theme.primary, 0.18),
      borderColor: theme.primary,
    },
    overrideToggleText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    overrideToggleTextActive: {
      color: theme.primary,
    },
    overrideEmptyText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      marginLeft: 4,
    },
    closedDaysHint: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
    },
    closedDaysQuickRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
      marginBottom: 2,
    },
    closedDaysQuickChip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
    },
    closedDaysQuickChipText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '800',
    },
    closedDaysMessageInput: {
      minHeight: 88,
      textAlignVertical: 'top',
      paddingTop: 16,
    },
    closedDateInput: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    closedDateInputIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(theme.primary, 0.12),
    },
    closedDateInputBody: {
      flex: 1,
      gap: 2,
    },
    closedDateInputValue: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
      textTransform: 'capitalize',
    },
    closedDateInputMeta: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    closedDaysSaveButton: {
      backgroundColor: hexToRgba(theme.primary, 0.16),
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.primary,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closedDaysSaveButtonText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    closedDaysList: {
      gap: 12,
    },
    closedDayItem: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
    },
    closedDayItemTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
      textTransform: 'capitalize',
    },
    closedDayItemDate: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 4,
    },
    closedDayItemMessage: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
    },
    closedDayDeleteButton: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: 'rgba(255, 77, 77, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255, 77, 77, 0.28)',
    },
    closedDayDeleteButtonText: {
      color: theme.mode === 'light' ? '#C53333' : '#FF8A8A',
      fontSize: 12,
      fontWeight: '800',
    },
    closedDaysEmptyText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },

    submitBtn: {
      backgroundColor: theme.primary,
      borderRadius: 20,
      paddingVertical: 18,
      alignItems: 'center',
    },
    submitBtnText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '800' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      padding: 24,
      minHeight: 450,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    modalTitle: { color: theme.textPrimary, fontSize: 20, fontWeight: '800' },
    timePickerSummary: {
      backgroundColor: theme.input,
      borderRadius: 20,
      paddingVertical: 16,
      paddingHorizontal: 18,
      alignItems: 'center',
      marginBottom: 16,
    },
    timePickerSummaryLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    timePickerSummaryValue: {
      color: theme.textPrimary,
      fontSize: 28,
      fontWeight: '900',
      marginTop: 6,
    },
    timePickerSection: {
      marginTop: 10,
    },
    timePickerSectionTitle: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 10,
    },
    periodRow: {
      flexDirection: 'row',
      gap: 10,
    },
    periodChip: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: '#333',
      alignItems: 'center',
    },
    periodChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    periodChipText: {
      color: theme.textSecondary,
      fontSize: 18,
      fontWeight: '800',
    },
    periodChipTextActive: {
      color: theme.textOnPrimary,
    },
    pickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    pickerChip: {
      width: '22%',
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: '#333',
      alignItems: 'center',
    },
    pickerChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    pickerChipText: {
      color: theme.textSecondary,
      fontSize: 18,
      fontWeight: '800',
    },
    pickerChipTextActive: {
      color: theme.textOnPrimary,
    },
    modalActions: { marginTop: 25 },
    modalBtn: {
      paddingVertical: 16,
      backgroundColor: theme.primary,
      borderRadius: 16,
      alignItems: 'center',
    },
    modalBtnText: { color: theme.textOnPrimary, fontWeight: '800', fontSize: 16 },
  });

export default RegisterEmployed;
