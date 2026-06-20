import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getCurrentUser, requestAccountDeletion } from '../services/api';
import { saveUserProfile } from '../services/authStorage';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { SUPPORT_EMAIL, buildSupportMailUrl } from '../utils/publicLinks';

type DeletionRequestState = {
  status?: 'pending' | 'processed' | 'cancelled';
  requestedAt?: string | null;
  reason?: string;
} | null;

function formatDateLabel(value?: string | null) {
  if (!value) return 'Sin fecha registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha registrada';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function AccountDeletionRequestScreen({
  navigation,
}: {
  navigation: any;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [existingRequest, setExistingRequest] =
    useState<DeletionRequestState>(null);

  const loadState = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCurrentUser();
      const requestState = response.user?.accountDeletionRequest ?? null;
      setExistingRequest(requestState);
      setReason(requestState?.reason || '');
    } catch (error: any) {
      Alert.alert(
        'No pudimos cargar esta pantalla',
        error?.message ?? 'Probá de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;

    Alert.alert(
      'Solicitar eliminación',
      'Se va a registrar tu pedido y soporte va a revisar la cuenta. ¿Querés continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, solicitar',
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmitting(true);
              const response = await requestAccountDeletion({ reason });
              await saveUserProfile(response.user);
              setExistingRequest(response.user?.accountDeletionRequest ?? null);
              Alert.alert(
                'Solicitud enviada',
                response.message ||
                  'Recibimos tu solicitud. Soporte la va a revisar.',
                [
                  {
                    text: 'Aceptar',
                    onPress: () => navigation.goBack(),
                  },
                ],
              );
            } catch (error: any) {
              Alert.alert(
                'No pudimos registrar el pedido',
                error?.message ?? 'Probá de nuevo.',
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }, [navigation, reason, submitting]);

  const handleOpenSupportMail = useCallback(async () => {
    try {
      await Linking.openURL(
        buildSupportMailUrl('Consulta por eliminación de cuenta ShiftHub'),
      );
    } catch (_error) {
      Alert.alert('No pudimos abrir el mail', SUPPORT_EMAIL);
    }
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CUENTA</Text>
        <Text style={styles.title}>Eliminar cuenta</Text>
        <Text style={styles.subtitle}>
          Desde acá podés iniciar la solicitud de eliminación de tu cuenta y los
          datos asociados. Si existe una obligación legal o fiscal, algunos
          registros pueden conservarse por un tiempo adicional.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color={theme.textSecondary} />
          <Text style={styles.loadingText}>Cargando estado de la solicitud...</Text>
        </View>
      ) : (
        <>
          {existingRequest?.status === 'pending' ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Ya tenés un pedido pendiente</Text>
              <Text style={styles.noticeText}>
                Lo registramos el {formatDateLabel(existingRequest.requestedAt)}.
                Si querés, podés actualizar el motivo y reenviar la solicitud.
              </Text>
            </View>
          ) : null}

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Qué se elimina</Text>
            <Text style={styles.summaryText}>
              Cuenta de acceso, configuración del negocio, barberos, agenda,
              servicios, imágenes y datos operativos asociados a la barbería.
            </Text>
            <Text style={[styles.sectionTitle, styles.sectionTitleSpacing]}>
              Qué puede conservarse temporalmente
            </Text>
            <Text style={styles.summaryText}>
              Comprobantes de pago, logs de seguridad y copias de respaldo por
              los plazos legales o técnicos informados en la política de
              privacidad.
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Vía alternativa</Text>
            <Text style={styles.summaryText}>
              Si preferís dejar el pedido por correo, podés escribir a{' '}
              {SUPPORT_EMAIL}. Esa misma dirección figura en la ruta pública de
              eliminación de cuenta y en el centro de soporte.
            </Text>
            <Pressable style={styles.mailButton} onPress={handleOpenSupportMail}>
              <Text style={styles.mailButtonText}>Escribir a soporte</Text>
            </Pressable>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Motivo opcional</Text>
            <Text style={styles.helperText}>
              Podés dejar un detalle para soporte. No es obligatorio.
            </Text>
            <TextInput
              style={styles.textarea}
              multiline
              numberOfLines={5}
              maxLength={500}
              placeholder="Contanos si querés agregar algún contexto"
              placeholderTextColor={theme.textMuted}
              value={reason}
              onChangeText={setReason}
              textAlignVertical="top"
            />
            <Text style={styles.counterText}>{reason.length}/500</Text>
          </View>

          <Pressable
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.primaryButtonText}>
              {submitting ? 'Enviando solicitud...' : 'Solicitar eliminación'}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: Platform.OS === 'ios' ? 34 : 22,
      paddingBottom: 120,
      gap: 16,
    },
    header: {
      gap: 10,
    },
    eyebrow: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    title: {
      color: theme.textPrimary,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    loadingCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    noticeCard: {
      backgroundColor: `${theme.primary}14`,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: `${theme.primary}55`,
      padding: 16,
      gap: 8,
    },
    noticeTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
    },
    noticeText: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    summaryCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    sectionTitleSpacing: {
      marginTop: 16,
    },
    summaryText: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },
    mailButton: {
      alignSelf: 'flex-start',
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: `${theme.primary}44`,
      backgroundColor: `${theme.primary}12`,
    },
    mailButtonText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    formCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
    },
    helperText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
    },
    textarea: {
      marginTop: 14,
      minHeight: 130,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      color: theme.textPrimary,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 14,
    },
    counterText: {
      color: theme.textMuted,
      fontSize: 12,
      textAlign: 'right',
      marginTop: 8,
    },
    primaryButton: {
      height: 52,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: theme.textOnPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
  });
