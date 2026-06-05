import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Info, X } from 'lucide-react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/StackNavigation';
import {
  disableBarberAccess,
  fetchBarbers,
  upsertBarberAccess,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Barber-Access'>;

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

const buildTemporaryPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let value = '';
  for (let index = 0; index < 10; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
};

const sanitizeWhatsappNumber = (value?: string | null) =>
  String(value ?? '').replace(/[^\d]/g, '');

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

const resolveAccessStateLabel = (loginAccess?: {
  enabled?: boolean;
  lastLoginAt?: string | null;
}) => {
  if (!loginAccess?.enabled) return 'Sin acceso';
  if (loginAccess?.lastLoginAt) return 'Activo';
  return 'Nunca ingresó';
};

export default function BarberAccessScreen({ navigation, route }: Props) {
  const { theme, businessCopy } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [barber, setBarber] = useState(route.params?.barber ?? null);
  const [accessEmail, setAccessEmail] = useState(
    route.params?.barber?.loginAccess?.email ?? '',
  );
  const [accessPassword, setAccessPassword] = useState('');
  const [generatedAccessPassword, setGeneratedAccessPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const backLabel = route.params?.returnLabel || 'Volver';

  const hasAccessUser = Boolean(barber?.loginAccess?.enabled);

  const syncLatestBarber = useCallback(async () => {
    const barberId = route.params?.barber?._id;
    if (!barberId) return;

    try {
      const response = await fetchBarbers();
      const latest = response.barbers.find(item => item._id === barberId) ?? null;
      if (latest) {
        setBarber(latest);
        setAccessEmail(latest.loginAccess?.email ?? '');
      }
    } catch (_error) {}
  }, [route.params?.barber?._id]);

  useEffect(() => {
    setBarber(route.params?.barber ?? null);
    setAccessEmail(route.params?.barber?.loginAccess?.email ?? '');
    setAccessPassword('');
    setGeneratedAccessPassword('');
  }, [route.params?.barber]);

  useFocusEffect(
    useCallback(() => {
      syncLatestBarber();
    }, [syncLatestBarber]),
  );

  const handleSaveAccess = async () => {
    if (!barber?._id) return;

    const normalizedEmail = accessEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert(
        'Falta email',
        `Cargá el email del acceso del ${businessCopy.staffSingular}.`,
      );
      return;
    }

    if (!hasAccessUser && accessPassword.trim().length < 8) {
      Alert.alert(
        'Falta contraseña',
        'La contraseña inicial debe tener al menos 8 caracteres.',
      );
      return;
    }

    try {
      setLoading(true);
      await upsertBarberAccess({
        barberId: barber._id,
        email: normalizedEmail,
        password: accessPassword.trim() || undefined,
      });

      if (accessPassword.trim()) {
        Clipboard.setString(accessPassword.trim());
        setGeneratedAccessPassword(accessPassword.trim());
      }

      await syncLatestBarber();
      setAccessPassword('');
      Alert.alert(
        'Acceso guardado',
        hasAccessUser
          ? `El acceso del ${businessCopy.staffSingular} quedó actualizado.`
          : `El acceso del ${businessCopy.staffSingular} quedó creado.`,
      );
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.message || `No se pudo guardar el acceso del ${businessCopy.staffSingular}.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetAccessPassword = async () => {
    if (!barber?._id) return;

    const normalizedEmail = (
      accessEmail.trim() ||
      barber.loginAccess?.email ||
      ''
    ).toLowerCase();

    if (!normalizedEmail) {
      Alert.alert(
        'Falta email',
        'Antes de resetear la clave, cargá o confirmá el email del acceso.',
      );
      return;
    }

    Alert.alert(
      'Resetear clave',
      'Se va a generar una nueva clave temporal y la anterior dejará de servir. ¿Querés continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, resetear',
          style: 'destructive',
          onPress: async () => {
            const nextPassword = buildTemporaryPassword();

            try {
              setLoading(true);
              await upsertBarberAccess({
                barberId: barber._id,
                email: normalizedEmail,
                password: nextPassword,
              });
              Clipboard.setString(nextPassword);
              setAccessEmail(normalizedEmail);
              setAccessPassword('');
              setGeneratedAccessPassword(nextPassword);
              await syncLatestBarber();
              Alert.alert(
                'Clave reseteada',
                `La nueva clave temporal es:\n\n${nextPassword}\n\nYa quedó copiada para compartirla.`,
              );
            } catch (err: any) {
              Alert.alert(
                'Error',
                err?.message || `No se pudo resetear la contraseña del ${businessCopy.staffSingular}.`,
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleDisableAccess = async () => {
    if (!barber?._id) return;

    Alert.alert(
      'Desactivar acceso',
      `Este ${businessCopy.staffSingular} dejará de poder entrar con sus credenciales actuales.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await disableBarberAccess(barber._id);
              setAccessPassword('');
              setGeneratedAccessPassword('');
              await syncLatestBarber();
              Alert.alert(
                'Acceso desactivado',
                `El ${businessCopy.staffSingular} ya no puede entrar hasta que vuelvas a crear o reactivar sus credenciales.`,
              );
            } catch (err: any) {
              Alert.alert(
                'Error',
                err?.message || `No se pudo desactivar el acceso del ${businessCopy.staffSingular}.`,
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleShareAccessByWhatsapp = async () => {
    const normalizedPhone = sanitizeWhatsappNumber(barber?.phone);
    const normalizedEmail = (
      accessEmail.trim() ||
      barber?.loginAccess?.email ||
      ''
    ).toLowerCase();

    if (!normalizedPhone) {
      Alert.alert(
        'Falta WhatsApp',
        `Cargá primero el teléfono del ${businessCopy.staffSingular} en su perfil.`,
      );
      return;
    }

    if (!normalizedEmail || !generatedAccessPassword) {
      Alert.alert(
        'Faltan datos',
        'Primero generá o reseteá una clave para poder enviar el acceso completo.',
      );
      return;
    }

    const barberNameLabel = barber?.fullName || businessCopy.staffSingular;
    const message =
      `Hola ${barberNameLabel}. Ya quedó listo tu acceso a ${businessCopy.brandName}.\n\n` +
      `Email: ${normalizedEmail}\n` +
      `Clave temporal: ${generatedAccessPassword}\n\n` +
      `Entrá a la app con esos datos y después cambiá la clave desde tu cuenta.`;

    try {
      await Linking.openURL(
        `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`,
      );
    } catch (_error) {
      Alert.alert(
        'No se pudo abrir WhatsApp',
        'Revisá el teléfono cargado o si WhatsApp está instalado.',
      );
    }
  };

  if (!barber) {
    return (
      <View style={styles.screenFallback}>
        <Text style={styles.fallbackTitle}>
          {`No encontramos el ${businessCopy.staffSingular}`}
        </Text>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable
        style={styles.infoButton}
        onPress={() => setInfoVisible(true)}
        hitSlop={10}
        accessibilityLabel="Cómo funciona la gestión de acceso"
      >
        <Info size={18} color={theme.primary} />
      </Pressable>

      <Modal
        visible={infoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoVisible(false)}
      >
        <Pressable
          style={styles.infoOverlay}
          onPress={() => setInfoVisible(false)}
        >
          <Pressable style={styles.infoCard} onPress={() => {}}>
            <View style={styles.infoCardHeader}>
              <Text style={styles.infoCardTitle}>¿Cómo funciona el acceso?</Text>
              <Pressable
                onPress={() => setInfoVisible(false)}
                hitSlop={10}
                style={styles.infoCloseBtn}
              >
                <X size={18} color={theme.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.infoIntro}>
              {`Desde acá le das un usuario y contraseña propios al ${businessCopy.staffSingular} para que entre a la app y vea solo su agenda.`}
            </Text>

            <ScrollView
              style={styles.infoStepsScroll}
              showsVerticalScrollIndicator={false}
            >
              {[
                {
                  t: 'Cargá el email',
                  d: `Ingresá el email que va a usar el ${businessCopy.staffSingular} para iniciar sesión. Es su usuario.`,
                },
                {
                  t: 'Generá la contraseña',
                  d: 'Tocá "Generar contraseña" para crear una temporal, o escribí una vos mismo.',
                },
                {
                  t: 'Guardá el acceso',
                  d: 'Guardá los cambios. El acceso queda activo al instante.',
                },
                {
                  t: 'Compartí los datos',
                  d: `Pasale el email y la contraseña al ${businessCopy.staffSingular} (podés enviárselos por WhatsApp con el botón).`,
                },
                {
                  t: `Cómo entra el ${businessCopy.staffSingular}`,
                  d: 'Abre la app, va a "Iniciar sesión" y entra con ese email y contraseña. Solo ve su propia agenda y sus turnos, no el resto del negocio.',
                },
                {
                  t: 'Resetear o desactivar',
                  d: `Si se olvida la clave, generás una nueva. Si ya no trabaja con vos, desactivás el acceso y deja de poder entrar.`,
                },
              ].map((step, index) => (
                <View key={step.t} style={styles.infoStepRow}>
                  <View style={styles.infoStepNumber}>
                    <Text style={styles.infoStepNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.infoStepBody}>
                    <Text style={styles.infoStepTitle}>{step.t}</Text>
                    <Text style={styles.infoStepText}>{step.d}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <Pressable
              style={styles.infoGotItBtn}
              onPress={() => setInfoVisible(false)}
            >
              <Text style={styles.infoGotItText}>Entendido</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>GESTIÓN DE ACCESO</Text>
          <Text style={styles.headerTitle}>{barber.fullName}</Text>
          <Text style={styles.headerText}>
            {`Acá manejás el login del ${businessCopy.staffSingular} sin mezclarlo con el resto del perfil.`}
          </Text>
        </View>

        <View style={styles.mainCard}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Estado</Text>
            <Text style={styles.summaryValue}>
              {resolveAccessStateLabel(barber.loginAccess)}
            </Text>
            <Text style={styles.summaryMeta}>
              Último acceso: {formatLastAccessLabel(barber.loginAccess?.lastLoginAt)}
            </Text>
            <Text style={styles.summaryMeta}>
              WhatsApp: {barber.phone?.trim() || 'No cargado'}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Credenciales</Text>
            <TextInput
              style={styles.input}
              placeholder={`Email para login del ${businessCopy.staffSingular}`}
              placeholderTextColor={theme.placeholder}
              autoCapitalize="none"
              keyboardType="email-address"
              value={accessEmail}
              onChangeText={setAccessEmail}
            />
            <TextInput
              style={styles.input}
              placeholder={
                hasAccessUser
                  ? 'Nueva contraseña (opcional)'
                  : `Contraseña inicial del ${businessCopy.staffSingular}`
              }
              placeholderTextColor={theme.placeholder}
              secureTextEntry
              value={accessPassword}
              onChangeText={setAccessPassword}
            />

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                loading && styles.buttonDisabled,
              ]}
              disabled={loading}
              onPress={handleSaveAccess}
            >
              <Text style={styles.primaryButtonText}>
                {hasAccessUser ? 'Guardar cambios del acceso' : 'Crear acceso'}
              </Text>
            </Pressable>
          </View>

          {generatedAccessPassword ? (
            <View style={styles.generatedPasswordCard}>
              <Text style={styles.generatedPasswordLabel}>
                Última clave temporal generada
              </Text>
              <Text style={styles.generatedPasswordValue}>
                {generatedAccessPassword}
              </Text>
              <View style={styles.inlineActionsRow}>
                <Pressable
                  onPress={() => {
                    Clipboard.setString(generatedAccessPassword);
                    Alert.alert('Copiada', 'La clave temporal quedó copiada.');
                  }}
                  style={({ pressed }) => [
                    styles.copyPasswordButton,
                    pressed && styles.copyPasswordButtonPressed,
                  ]}
                >
                  <Text style={styles.copyPasswordButtonText}>Copiar clave</Text>
                </Pressable>
                <Pressable
                  onPress={handleShareAccessByWhatsapp}
                  style={({ pressed }) => [
                    styles.whatsappShareButton,
                    pressed && styles.whatsappShareButtonPressed,
                  ]}
                >
                  <Text style={styles.whatsappShareButtonText}>
                    Enviar por WhatsApp
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {hasAccessUser ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Acciones rápidas</Text>
              <Pressable
                onPress={handleResetAccessPassword}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                  loading && styles.buttonDisabled,
                ]}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>Resetear clave</Text>
              </Pressable>
              <Pressable
                onPress={handleDisableAccess}
                style={({ pressed }) => [
                  styles.dangerButton,
                  pressed && styles.dangerButtonPressed,
                  loading && styles.buttonDisabled,
                ]}
                disabled={loading}
              >
                <Text style={styles.dangerButtonText}>
                  {`Desactivar acceso del ${businessCopy.staffSingular}`}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </Pressable>
        </View>
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
    infoButton: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 54 : 18,
      right: 18,
      zIndex: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    infoOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
    },
    infoCard: {
      width: '100%',
      maxWidth: 440,
      maxHeight: '82%',
      borderRadius: 24,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
    },
    infoCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    infoCardTitle: {
      flex: 1,
      color: theme.textPrimary,
      fontSize: 19,
      fontWeight: '900',
    },
    infoCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.input,
    },
    infoIntro: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 14,
    },
    infoStepsScroll: {
      flexGrow: 0,
    },
    infoStepRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    infoStepNumber: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: hexToRgba(theme.primary, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    infoStepNumberText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    infoStepBody: {
      flex: 1,
    },
    infoStepTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
      marginBottom: 2,
    },
    infoStepText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    infoGotItBtn: {
      marginTop: 8,
      borderRadius: 16,
      backgroundColor: theme.primary,
      paddingVertical: 14,
      alignItems: 'center',
    },
    infoGotItText: {
      color: theme.textOnPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
    screenFallback: {
      flex: 1,
      backgroundColor: theme.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
    },
    fallbackTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      textAlign: 'center',
    },
    scrollContent: {
      paddingBottom: 100,
      paddingTop: Platform.OS === 'ios' ? 56 : 20,
    },
    header: {
      paddingHorizontal: 24,
      alignItems: 'center',
      marginBottom: 20,
      gap: 6,
    },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 2,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 28,
      fontWeight: '800',
      textAlign: 'center',
    },
    headerText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 4,
    },
    mainCard: {
      marginHorizontal: 16,
      backgroundColor: theme.card,
      borderRadius: 28,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 18,
    },
    summaryCard: {
      borderRadius: 18,
      padding: 16,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 6,
    },
    summaryLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    summaryValue: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '800',
    },
    summaryMeta: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    section: {
      gap: 12,
    },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginLeft: 4,
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
    primaryButton: {
      borderRadius: 16,
      backgroundColor: theme.primary,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonPressed: {
      opacity: 0.84,
    },
    primaryButtonText: {
      color: theme.textOnPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    secondaryButton: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.28),
      backgroundColor: hexToRgba(theme.primary, 0.1),
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonPressed: {
      opacity: 0.84,
    },
    secondaryButtonText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '800',
    },
    dangerButton: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255, 64, 64, 0.42)',
      backgroundColor: 'rgba(255, 64, 64, 0.12)',
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dangerButtonPressed: {
      opacity: 0.84,
    },
    dangerButtonText: {
      color: '#FF6B6B',
      fontSize: 13,
      fontWeight: '800',
    },
    generatedPasswordCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.2),
      backgroundColor: hexToRgba(theme.primary, 0.08),
      padding: 14,
      gap: 8,
    },
    generatedPasswordLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    generatedPasswordValue: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    inlineActionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    copyPasswordButton: {
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.primary,
    },
    copyPasswordButtonPressed: {
      opacity: 0.82,
    },
    copyPasswordButtonText: {
      color: theme.textOnPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    whatsappShareButton: {
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: '#25D366',
    },
    whatsappShareButtonPressed: {
      opacity: 0.82,
    },
    whatsappShareButtonText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    backButton: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonPressed: {
      opacity: 0.84,
    },
    backButtonText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  });
