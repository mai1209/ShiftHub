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
  BarberProfileSettings,
  getCurrentUser,
  updateBarberProfileSettings,
} from '../services/api';
import { saveUserProfile } from '../services/authStorage';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { hasBasicPlanAccess } from '../services/planAccess';
import LockedFeatureScreen from '../components/LockedFeatureScreen';

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

export default function BarberProfileSettingsScreen({ navigation }: { navigation: any }) {
  const { theme, businessCopy } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [form, setForm] = useState<BarberProfileSettings>({
    barberSelfEditEnabled: true,
  });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await getCurrentUser();
        if (!active) return;
        setHasAccess(hasBasicPlanAccess(res?.user));
        const settings = res?.user?.barberProfileSettings ?? {};
        setForm({
          barberSelfEditEnabled: settings.barberSelfEditEnabled !== false,
        });
      } catch (err: any) {
        if (active) {
          Alert.alert(
            'Error',
            err?.message || 'No se pudo cargar la configuración del perfil.',
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
      const response = await updateBarberProfileSettings(form);
      if (response?.user) {
        await saveUserProfile(response.user);
      }
      Alert.alert(
        'Guardado',
        form.barberSelfEditEnabled
          ? `Los ${businessCopy.staffPlural} pueden editar su propio perfil.`
          : `Los ${businessCopy.staffPlural} ya no pueden editar su propio perfil.`,
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
        <ActivityIndicator color={theme.textSecondary} size="large" />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <LockedFeatureScreen
        theme={theme}
        navigation={navigation}
        title={`Edición del ${businessCopy.staffSingular} bloqueada`}
        body={`Permitir que el ${businessCopy.staffSingular} edite su propio perfil está disponible desde el plan Básico.`}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{`Perfil del ${businessCopy.staffSingular}`}</Text>
        <Text style={styles.subtitle}>
          {`Definí si cada ${businessCopy.staffSingular} puede entrar a editar su foto, horarios y datos`}
          de atención desde su propio panel.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Editar perfil propio</Text>
        <Text style={styles.sectionHint}>
          {`Si lo desactivás, el ${businessCopy.staffSingular} sigue viendo su agenda y turnos, pero solo`}
          el administrador puede cambiar sus datos y horarios.
        </Text>

        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.toggleChip,
              form.barberSelfEditEnabled && styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                barberSelfEditEnabled: true,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.barberSelfEditEnabled && styles.toggleChipTextActive,
              ]}
            >
              Activado
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.toggleChip,
              form.barberSelfEditEnabled === false && styles.toggleChipActive,
            ]}
            onPress={() =>
              setForm(current => ({
                ...current,
                barberSelfEditEnabled: false,
              }))
            }
          >
            <Text
              style={[
                styles.toggleChipText,
                form.barberSelfEditEnabled === false &&
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
      paddingTop: 70,
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
