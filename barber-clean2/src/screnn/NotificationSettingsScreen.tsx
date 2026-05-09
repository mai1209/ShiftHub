import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getCurrentUser,
  NotificationSettings,
  updateNotificationSettings,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';

const REMINDER_OPTIONS: Array<{
  value: 15 | 30 | 60 | 120 | 180 | 1440;
  label: string;
}> = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 180, label: '3 horas' },
  { value: 1440, label: '1 día' },
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

export default function NotificationSettingsScreen() {
  const { theme, businessCopy } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<NotificationSettings>({
    adminInstantBookingEnabled: true,
    barberInstantBookingEnabled: true,
    barberReminderEnabled: true,
    barberReminderMinutesBefore: 60,
    customerSameDayEmailEnabled: true,
  });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await getCurrentUser();
        if (!active) return;
        const settings = res?.user?.notificationSettings ?? {};
        setForm({
          adminInstantBookingEnabled:
            settings.adminInstantBookingEnabled !== false,
          barberInstantBookingEnabled:
            settings.barberInstantBookingEnabled !== false,
          barberReminderEnabled: settings.barberReminderEnabled !== false,
          barberReminderMinutesBefore: settings.barberReminderMinutesBefore ?? 60,
          customerSameDayEmailEnabled:
            settings.customerSameDayEmailEnabled !== false,
        });
      } catch (err: any) {
        if (active) {
          Alert.alert(
            'Error',
            err?.message || 'No se pudo cargar la configuración de notificaciones.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateNotificationSettings(form);
      Alert.alert(
        'Guardado',
        'La configuración de recordatorios ya quedó actualizada.',
      );
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.message || 'No se pudo guardar la configuración.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Notificaciones</Text>
        <Text style={styles.subtitle}>
          Elegí quién recibe el aviso del nuevo turno y qué recordatorios querés mantener activos.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Nuevo turno al admin</Text>
        <Text style={styles.sectionHint}>
          Cuando entra una reserva nueva, este teléfono puede recibir el aviso aunque el turno sea para otro {businessCopy.staffSingular}.
        </Text>

        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.toggleChip,
              form.adminInstantBookingEnabled && styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                adminInstantBookingEnabled: true,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.adminInstantBookingEnabled && styles.toggleChipTextActive,
              ]}
            >
              Activado
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.toggleChip,
              form.adminInstantBookingEnabled === false &&
                styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                adminInstantBookingEnabled: false,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.adminInstantBookingEnabled === false &&
                  styles.toggleChipTextActive,
              ]}
            >
              Desactivado
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>{`Nuevo turno al ${businessCopy.staffSingular}`}</Text>
        <Text style={styles.sectionHint}>
          Si el turno queda asignado a un {businessCopy.staffSingular}, también podés decidir si le mandamos el push a esa persona.
        </Text>

        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.toggleChip,
              form.barberInstantBookingEnabled && styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                barberInstantBookingEnabled: true,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.barberInstantBookingEnabled && styles.toggleChipTextActive,
              ]}
            >
              Activado
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.toggleChip,
              form.barberInstantBookingEnabled === false &&
                styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                barberInstantBookingEnabled: false,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.barberInstantBookingEnabled === false &&
                  styles.toggleChipTextActive,
              ]}
            >
              Desactivado
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>
          {`Recordatorio al ${businessCopy.staffSingular}`}
        </Text>
        <Text style={styles.sectionHint}>
          Te avisamos por push antes del turno para que no se te pase.
        </Text>

        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.toggleChip,
              form.barberReminderEnabled && styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                barberReminderEnabled: true,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.barberReminderEnabled && styles.toggleChipTextActive,
              ]}
            >
              Activado
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.toggleChip,
              form.barberReminderEnabled === false && styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                barberReminderEnabled: false,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.barberReminderEnabled === false &&
                  styles.toggleChipTextActive,
              ]}
            >
              Desactivado
            </Text>
          </Pressable>
        </View>

        {form.barberReminderEnabled ? (
          <>
            <Text style={styles.sectionLabel}>¿Cuánto antes?</Text>
            <View style={styles.optionsWrap}>
              {REMINDER_OPTIONS.map(option => {
                const active = form.barberReminderMinutesBefore === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.optionChip, active && styles.optionChipActive]}
                    onPress={() =>
                      setForm(current => ({
                        ...current,
                        barberReminderMinutesBefore: option.value,
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        active && styles.optionChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Recordatorio al cliente</Text>
        <Text style={styles.sectionHint}>
          Mandamos un mail automático el mismo día del turno para recordarle que hoy tiene reserva.
        </Text>

        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.toggleChip,
              form.customerSameDayEmailEnabled && styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                customerSameDayEmailEnabled: true,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.customerSameDayEmailEnabled &&
                  styles.toggleChipTextActive,
              ]}
            >
              Activado
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.toggleChip,
              form.customerSameDayEmailEnabled === false &&
                styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                customerSameDayEmailEnabled: false,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.customerSameDayEmailEnabled === false &&
                  styles.toggleChipTextActive,
              ]}
            >
              Desactivado
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        disabled={saving}
        onPress={handleSave}
      >
        {saving ? (
          <ActivityIndicator color={theme.textOnPrimary} />
        ) : (
          <Text style={styles.saveButtonText}>Guardar configuración</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      paddingTop: 36,
      paddingHorizontal: 20,
      paddingBottom: 140,
      gap: 16,
    },
    header: {
      gap: 8,
      marginBottom: 8,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 32,
      fontWeight: '800',
    },
    subtitle: {
      color: hexToRgba(theme.primary, 0.56),
      fontSize: 14,
      lineHeight: 20,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.16),
      gap: 14,
    },
    sectionLabel: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    sectionHint: {
      color: hexToRgba(theme.primary, 0.54),
      fontSize: 13,
      lineHeight: 20,
    },
    toggleRow: {
      flexDirection: 'row',
      gap: 10,
    },
    toggleChip: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 12,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    toggleChipActive: {
      backgroundColor: hexToRgba(theme.primary, 0.16),
      borderColor: theme.primary,
    },
    toggleChipText: {
      color: hexToRgba(theme.primary, 0.58),
      fontSize: 14,
      fontWeight: '700',
    },
    toggleChipTextActive: {
      color: theme.primary,
    },
    optionsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    optionChip: {
      borderRadius: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    optionChipActive: {
      backgroundColor: hexToRgba(theme.primary, 0.16),
      borderColor: theme.primary,
    },
    optionChipText: {
      color: hexToRgba(theme.primary, 0.62),
      fontSize: 13,
      fontWeight: '700',
    },
    optionChipTextActive: {
      color: theme.primary,
    },
    saveButton: {
      marginTop: 10,
      backgroundColor: theme.primary,
      borderRadius: 18,
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.7,
    },
    saveButtonText: {
      color: theme.textOnPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
  });
}
