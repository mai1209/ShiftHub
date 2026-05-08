import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CalendarDays, LockKeyhole, Trash2 } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import DateSelectModal from '../components/DateSelectModal';
import {
  getCurrentUser,
  type ShopClosedDay,
  updateShopClosedDays,
} from '../services/api';
import { saveUserProfile } from '../services/authStorage';

const DEFAULT_MESSAGE =
  'Este día el local permanecerá cerrado. Elegí otro turno disponible.';
const SHOP_TZ = 'America/Argentina/Cordoba';

function normalizeDate(value: string) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeMessage(value: string) {
  return String(value ?? '').trim().slice(0, 220);
}

function formatDateLabel(value: string) {
  if (!normalizeDate(value)) return value;
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: SHOP_TZ,
  }).format(date);
}

function sortClosedDays(list: ShopClosedDay[]) {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

function buildQuickDate(offsetDays: number) {
  const base = new Date();
  base.setDate(base.getDate() + offsetDays);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base);
  const year = parts.find(part => part.type === 'year')?.value ?? '0000';
  const month = parts.find(part => part.type === 'month')?.value ?? '00';
  const day = parts.find(part => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized.length === 3 ? sanitized.repeat(2) : sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function ShopClosureSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [closedDays, setClosedDays] = useState<ShopClosedDay[]>([]);
  const [selectedDate, setSelectedDate] = useState(buildQuickDate(0));
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getCurrentUser();
      const list = Array.isArray(res?.user?.shopClosedDays)
        ? sortClosedDays(
            res.user.shopClosedDays
              .map((item: any) => ({
                date: normalizeDate(item?.date),
                message: normalizeMessage(item?.message || DEFAULT_MESSAGE),
              }))
              .filter((item: ShopClosedDay) => item.date),
          )
        : [];
      setClosedDays(list);
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos cargar los cierres del local.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const persistClosedDays = useCallback(
    async (nextClosedDays: ShopClosedDay[], successMessage?: string) => {
      try {
        setSaving(true);
        const response = await updateShopClosedDays({
          shopClosedDays: sortClosedDays(nextClosedDays),
        });
        await saveUserProfile(response.user);
        setClosedDays(sortClosedDays(response.user?.shopClosedDays ?? nextClosedDays));
        setError('');
        if (successMessage) {
          Alert.alert('Listo', successMessage);
        }
      } catch (err: any) {
        setError(err?.message ?? 'No pudimos guardar el cierre.');
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleAddClosedDay = async () => {
    const normalizedDate = normalizeDate(selectedDate);
    const normalizedReason = normalizeMessage(message) || DEFAULT_MESSAGE;

    if (!normalizedDate) {
      setError('La fecha debe tener formato AAAA-MM-DD.');
      return;
    }

    const nextClosedDays = closedDays.filter(item => item.date !== normalizedDate);
    nextClosedDays.push({
      date: normalizedDate,
      message: normalizedReason,
    });

    await persistClosedDays(nextClosedDays, 'El cierre ya quedó guardado.');
  };

  const handleRemoveClosedDay = (date: string) => {
    Alert.alert(
      'Eliminar cierre',
      'Ese día volverá a quedar disponible para reservar desde la web.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const nextClosedDays = closedDays.filter(item => item.date !== date);
            await persistClosedDays(nextClosedDays);
          },
        },
      ],
    );
  };

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
          <View style={styles.headerIcon}>
            <LockKeyhole size={18} color={theme.primary} />
          </View>
          <Text style={styles.title}>Cerrar barbería por día</Text>
          <Text style={styles.subtitle}>
            Bloqueá fechas puntuales para que nadie pueda sacar turnos desde la web.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Nuevo cierre</Text>
          <Text style={styles.sectionDescription}>
            Elegí la fecha y, si querés, dejá un motivo visible para el cliente.
          </Text>
          <Text style={styles.helperNote}>
            Si querés bloquear solo a un barbero y no cerrar toda la barbería,
            andá al perfil del barbero y editá sus días no disponibles.
          </Text>

          <Text style={styles.label}>Fecha</Text>
          <Pressable
            style={styles.dateInput}
            onPress={() => setIsDateModalVisible(true)}
          >
            <View style={styles.dateInputIcon}>
              <CalendarDays size={16} color={theme.primary} />
            </View>
            <View style={styles.dateInputBody}>
              <Text style={styles.dateInputValue}>{formatDateLabel(selectedDate)}</Text>
              <Text style={styles.dateInputMeta}>{selectedDate}</Text>
            </View>
          </Pressable>

          <View style={styles.quickActionsRow}>
            <Pressable
              style={styles.quickAction}
              onPress={() => setSelectedDate(buildQuickDate(0))}
            >
              <Text style={styles.quickActionText}>Hoy</Text>
            </Pressable>
            <Pressable
              style={styles.quickAction}
              onPress={() => setSelectedDate(buildQuickDate(1))}
            >
              <Text style={styles.quickActionText}>Mañana</Text>
            </Pressable>
            <Pressable
              style={styles.quickAction}
              onPress={() => setSelectedDate(buildQuickDate(7))}
            >
              <Text style={styles.quickActionText}>+7 días</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Mensaje para el cliente</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={DEFAULT_MESSAGE}
            placeholderTextColor="#6E7585"
            style={[styles.input, styles.textArea]}
            multiline
            textAlignVertical="top"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && !saving ? styles.saveButtonPressed : null,
              saving ? styles.saveButtonDisabled : null,
            ]}
            onPress={handleAddClosedDay}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={theme.textOnPrimary} />
            ) : (
              <Text style={styles.saveButtonText}>Guardar cierre</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Días cerrados</Text>
          <Text style={styles.sectionDescription}>
            Estos días aparecen bloqueados en la reserva web.
          </Text>

          {loading ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />
          ) : closedDays.length ? (
            closedDays.map(item => (
              <View key={item.date} style={styles.closedDayRow}>
                <View style={styles.closedDayIcon}>
                  <CalendarDays size={16} color={theme.primary} />
                </View>
                <View style={styles.closedDayBody}>
                  <Text style={styles.closedDayTitle}>{formatDateLabel(item.date)}</Text>
                  <Text style={styles.closedDayDate}>{item.date}</Text>
                  <Text style={styles.closedDayMessage}>
                    {item.message || DEFAULT_MESSAGE}
                  </Text>
                </View>
                <Pressable
                  style={styles.removeButton}
                  onPress={() => handleRemoveClosedDay(item.date)}
                >
                  <Trash2 size={16} color="#ff7272" />
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              No hay cierres cargados. Si agregás uno, ese día queda bloqueado en la web.
            </Text>
          )}
        </View>
      </ScrollView>

      <DateSelectModal
        visible={isDateModalVisible}
        value={selectedDate}
        title="Elegir fecha de cierre"
        theme={theme}
        onClose={() => setIsDateModalVisible(false)}
        onConfirm={(date) => {
          setSelectedDate(date);
          setIsDateModalVisible(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingTop: Platform.OS === 'ios' ? 72 : 28,
      paddingHorizontal: 20,
      paddingBottom: 130,
      gap: 18,
    },
    header: {
      gap: 10,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.26),
    },
    title: {
      color: theme.textPrimary,
      fontSize: 30,
      fontWeight: '800',
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.14),
      padding: 18,
      gap: 12,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '700',
    },
    sectionDescription: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    helperNote: {
      marginTop: 10,
      padding: 12,
      borderRadius: 14,
      backgroundColor: hexToRgba(theme.primary, 0.08),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.16),
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
    label: {
      color: hexToRgba(theme.primary, 0.92),
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
      marginTop: 4,
    },
    input: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      color: theme.textPrimary,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
    },
    dateInput: {
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
    dateInputIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(theme.primary, 0.12),
    },
    dateInputBody: {
      flex: 1,
      gap: 2,
    },
    dateInputValue: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    dateInputMeta: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    textArea: {
      minHeight: 96,
    },
    quickActionsRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
      marginBottom: 4,
    },
    quickAction: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: hexToRgba(theme.primary, 0.1),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.2),
    },
    quickActionText: {
      color: theme.primary,
      fontWeight: '700',
      fontSize: 12,
    },
    errorText: {
      color: '#ff7272',
      fontSize: 13,
      lineHeight: 18,
    },
    saveButton: {
      marginTop: 6,
      borderRadius: 18,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
    },
    saveButtonPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.99 }],
    },
    saveButtonDisabled: {
      opacity: 0.65,
    },
    saveButtonText: {
      color: theme.textOnPrimary,
      fontWeight: '800',
      fontSize: 15,
    },
    closedDayRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    closedDayIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(theme.primary, 0.1),
    },
    closedDayBody: {
      flex: 1,
      gap: 3,
    },
    closedDayTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    closedDayDate: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    closedDayMessage: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    removeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 114, 114, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255, 114, 114, 0.18)',
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
  });
