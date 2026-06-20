import React, { useEffect, useMemo, useState } from 'react';
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
import {
  getCurrentUser,
  PublicProfile,
  updatePublicProfile,
} from '../services/api';
import { saveUserProfile } from '../services/authStorage';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { hasBasicPlanAccess } from '../services/planAccess';
import LockedFeatureScreen from '../components/LockedFeatureScreen';

type FormState = {
  subtitle: string;
  address: string;
  phone: string;
  googleMapsUrl: string;
  googleReviewsUrl: string;
  googlePlaceId: string;
  instagramUrl: string;
  linktreeUrl: string;
};

const EMPTY_FORM: FormState = {
  subtitle: '',
  address: '',
  phone: '',
  googleMapsUrl: '',
  googleReviewsUrl: '',
  googlePlaceId: '',
  instagramUrl: '',
  linktreeUrl: '',
};

const FIELDS: Array<{
  key: keyof FormState;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'numeric' | 'url' | 'phone-pad';
  multiline?: boolean;
}> = [
  {
    key: 'subtitle',
    label: 'Texto corto del negocio',
    placeholder: 'Ej: Turnos simples para tu equipo',
    multiline: true,
  },
  {
    key: 'address',
    label: 'Dirección',
    placeholder: 'Calle, número, ciudad',
    multiline: true,
  },
  {
    key: 'phone',
    label: 'Teléfono',
    placeholder: 'Ej: 351 555 1234',
    keyboardType: 'phone-pad',
  },
  {
    key: 'googleMapsUrl',
    label: 'Link de Google Maps',
    placeholder: 'https://maps.google.com/...',
    keyboardType: 'url',
  },


  {
    key: 'instagramUrl',
    label: 'Instagram',
    placeholder: 'https://instagram.com/tu_negocio',
    keyboardType: 'url',
  },
  {
    key: 'linktreeUrl',
    label: 'Linktree',
    placeholder: 'https://linktr.ee/tu_negocio',
    keyboardType: 'url',
  },
];

function toFormState(profile: PublicProfile | undefined | null): FormState {
  return {
    subtitle: String(profile?.subtitle ?? ''),
    address: String(profile?.address ?? ''),
    phone: String(profile?.phone ?? ''),
    googleMapsUrl: String(profile?.googleMapsUrl ?? ''),
    googleReviewsUrl: String(profile?.googleReviewsUrl ?? ''),
    googlePlaceId: String(profile?.googlePlaceId ?? ''),
    instagramUrl: String(profile?.instagramUrl ?? ''),
    linktreeUrl: String(profile?.linktreeUrl ?? ''),
  };
}

function toPayload(form: FormState): PublicProfile {
  return {
    subtitle: form.subtitle.trim() || null,
    address: form.address.trim() || null,
    phone: form.phone.trim() || null,
    googleMapsUrl: form.googleMapsUrl.trim() || null,
    googleReviewsUrl: form.googleReviewsUrl.trim() || null,
    googlePlaceId: form.googlePlaceId.trim() || null,
    instagramUrl: form.instagramUrl.trim() || null,
    linktreeUrl: form.linktreeUrl.trim() || null,
  };
}

export default function PublicProfileSettingsScreen({ navigation }: { navigation: any }) {
  const { theme, applyUserTheme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await getCurrentUser();
        if (!active) return;
        setHasAccess(hasBasicPlanAccess(res?.user));
        setForm(toFormState(res?.user?.publicProfile));
      } catch (err: any) {
        if (active) {
          Alert.alert(
            'Error',
            err?.message || 'No se pudo cargar el perfil público del negocio.',
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

  const handleChange = (key: keyof FormState, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await updatePublicProfile(toPayload(form));
      await saveUserProfile(response.user);
      applyUserTheme(response.user);
      Alert.alert(
        'Guardado',
        'El perfil público del negocio quedó actualizado.',
      );
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.message || 'No se pudo guardar el perfil público.',
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
        title="Perfil público bloqueado"
        body="El perfil público del negocio está disponible desde el plan Básico."
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Perfil público del negocio</Text>
        <Text style={styles.subtitle}>
          Estos datos se usan en la web de turnos para mostrar dirección, links
          de mapa y reseñas.
        </Text>
      </View>

      <View style={styles.card}>
        {FIELDS.map(field => (
          <View key={field.key} style={styles.fieldGroup}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              style={[
                styles.input,
                field.multiline ? styles.inputMultiline : null,
              ]}
              placeholder={field.placeholder}
              placeholderTextColor={theme.textMuted}
              value={form[field.key]}
              onChangeText={value => handleChange(field.key, value)}
              multiline={field.multiline}
              textAlignVertical={field.multiline ? 'top' : 'center'}
              keyboardType={field.keyboardType}
              autoCapitalize="none"
            />
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          pressed && !saving ? styles.saveButtonPressed : null,
          saving ? styles.saveButtonDisabled : null,
        ]}
        disabled={saving}
        onPress={handleSave}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Guardando...' : 'Guardar perfil público'}
        </Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      paddingTop: Platform.OS === 'ios' ? 72 : 28,
      paddingHorizontal: 20,
      paddingBottom: 120,
      gap: 16,
    },
    header: {
      gap: 8,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 28,
      fontWeight: '800',
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 24,
      padding: 18,
      gap: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    fieldGroup: {
      gap: 8,
    },
    label: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 13,
      backgroundColor: theme.input,
      color: theme.textPrimary,
      fontSize: 15,
    },
    inputMultiline: {
      minHeight: 96,
      paddingTop: 14,
    },
    tipCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 20,
      padding: 16,
      gap: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tipTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    tipText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    saveButton: {
      backgroundColor: theme.primary,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.primary,
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    saveButtonPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.995 }],
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
