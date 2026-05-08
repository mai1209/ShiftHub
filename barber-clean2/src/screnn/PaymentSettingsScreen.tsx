import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  disconnectMercadoPago,
  getCurrentUser,
  getMercadoPagoConnectUrl,
  getMercadoPagoStatus,
  updatePaymentSettings,
  type PaymentSettings,
} from '../services/api';
import { saveUserProfile } from '../services/authStorage';
import { useTheme } from '../context/ThemeContext'; // Importamos el hook

type FormState = {
  cashEnabled: boolean;
  advancePaymentEnabled: boolean;
  advanceMode: 'deposit' | 'full';
  advanceType: 'percent' | 'fixed';
  advanceValue: string;
  mercadoPagoConnectionStatus: 'disconnected' | 'pending' | 'connected';
};

const DEFAULT_FORM: FormState = {
  cashEnabled: true,
  advancePaymentEnabled: false,
  advanceMode: 'deposit',
  advanceType: 'percent',
  advanceValue: '30',
  mercadoPagoConnectionStatus: 'disconnected',
};

function normalizeFormFromUser(user: any): FormState {
  const settings = user?.paymentSettings ?? {};
  return {
    cashEnabled: settings.cashEnabled !== false,
    advancePaymentEnabled: Boolean(settings.advancePaymentEnabled),
    advanceMode: settings.advanceMode === 'full' ? 'full' : 'deposit',
    advanceType: settings.advanceType === 'fixed' ? 'fixed' : 'percent',
    advanceValue: String(settings.advanceValue ?? 30),
    mercadoPagoConnectionStatus:
      settings.mercadoPagoConnectionStatus === 'connected'
        ? 'connected'
        : settings.mercadoPagoConnectionStatus === 'pending'
          ? 'pending'
          : 'disconnected',
  };
}

export default function PaymentSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [response, mpStatusResponse] = await Promise.all([
        getCurrentUser(),
        getMercadoPagoStatus().catch(() => null),
      ]);

      const normalized = normalizeFormFromUser(response.user);
      if (mpStatusResponse?.mercadoPago?.connectionStatus) {
        normalized.mercadoPagoConnectionStatus =
          mpStatusResponse.mercadoPago.connectionStatus;
      }

      setForm(normalized);
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos cargar la configuración de cobros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  const advanceHelper = useMemo(() => {
    if (!form.advancePaymentEnabled) return 'El cliente solo ve pago en el local.';
    if (form.mercadoPagoConnectionStatus !== 'connected') return 'Para mostrar el pago online, conectá Mercado Pago.';
    if (form.advanceMode === 'full') return 'El cliente paga el turno completo antes de confirmar.';
    return form.advanceType === 'fixed'
      ? `El cliente paga ${form.advanceValue || '0'} pesos por adelantado.`
      : `El cliente paga ${form.advanceValue || '0'}% por adelantado.`;
  }, [form]);

  const mercadoPagoStatusLabel = useMemo(() => {
    if (form.mercadoPagoConnectionStatus === 'connected') {
      return 'Cuenta conectada y lista para cobrar online.';
    }
    if (form.mercadoPagoConnectionStatus === 'pending') {
      return 'La conexión quedó pendiente. Terminá el proceso desde el navegador.';
    }
    return 'Todavía no vinculaste una cuenta de Mercado Pago.';
  }, [form.mercadoPagoConnectionStatus]);

  const mercadoPagoStatusTone = useMemo(() => {
    if (form.mercadoPagoConnectionStatus === 'connected') return 'connected';
    if (form.mercadoPagoConnectionStatus === 'pending') return 'pending';
    return 'disconnected';
  }, [form.mercadoPagoConnectionStatus]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      const parsedAdvanceValue = Number(form.advanceValue);
      if (!Number.isFinite(parsedAdvanceValue) || parsedAdvanceValue < 0) {
        Alert.alert('Valor inválido', 'Revisá el monto o porcentaje del adelanto.');
        return;
      }

      const payload: PaymentSettings = {
        cashEnabled: form.cashEnabled,
        advancePaymentEnabled: form.advancePaymentEnabled,
        advanceMode: form.advanceMode,
        advanceType: form.advanceType,
        advanceValue: parsedAdvanceValue,
      };

      const response = await updatePaymentSettings(payload);
      await saveUserProfile(response.user);
      setForm(normalizeFormFromUser(response.user));
      Alert.alert('Listo', 'Configuración guardada.');
    } catch (err: any) {
      setError(err?.message ?? 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectMercadoPago = async () => {
    try {
      setConnecting(true);
      const response = await getMercadoPagoConnectUrl();
      await Linking.openURL(response.authUrl);
      setForm(current => ({ ...current, mercadoPagoConnectionStatus: 'pending' }));
    } catch (err: any) {
      Alert.alert(
        'No pudimos abrir Mercado Pago',
        err?.message ?? 'Revisá la configuración del backend y volvé a intentar.',
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectMercadoPago = async () => {
    try {
      setConnecting(true);
      const response = await disconnectMercadoPago();
      await saveUserProfile(response.user);
      setForm(normalizeFormFromUser(response.user));
      Alert.alert('Listo', 'La cuenta de Mercado Pago quedó desconectada.');
    } catch (err: any) {
      Alert.alert('No pudimos desconectar la cuenta', err?.message ?? 'Probá de nuevo.');
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Cobros</Text>
        <Text style={styles.subtitle}>Elegí cómo querés que tus clientes paguen sus turnos.</Text>
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.card}>
        <RowSwitch
          label="Aceptar efectivo"
          description="Pago presencial en el local."
          value={form.cashEnabled}
          onValueChange={(v: boolean) => setForm(c => ({ ...c, cashEnabled: v }))}
          theme={theme}
          styles={styles}
        />
        <View style={styles.separator} />
        <RowSwitch
          label="Aceptar pago online"
          description="Cobro adelantado vía Mercado Pago."
          value={form.advancePaymentEnabled}
          onValueChange={(v: boolean) =>
            setForm(c => ({ ...c, advancePaymentEnabled: v }))
          }
          theme={theme}
          styles={styles}
        />

        {form.advancePaymentEnabled && (
          <View style={styles.nestedBlock}>
            <Text style={styles.blockLabel}>Modo de cobro</Text>
            <View style={styles.segmentRow}>
              <SegmentButton label="Seña" active={form.advanceMode === 'deposit'} onPress={() => setForm(c => ({ ...c, advanceMode: 'deposit' }))} theme={theme} styles={styles} />
              <SegmentButton label="Total" active={form.advanceMode === 'full'} onPress={() => setForm(c => ({ ...c, advanceMode: 'full' }))} theme={theme} styles={styles} />
            </View>

            {form.advanceMode === 'deposit' && (
              <>
                <Text style={styles.blockLabel}>Tipo de seña</Text>
                <View style={styles.segmentRow}>
                  <SegmentButton label="Porcentaje" active={form.advanceType === 'percent'} onPress={() => setForm(c => ({ ...c, advanceType: 'percent' }))} theme={theme} styles={styles} />
                  <SegmentButton label="Fijo" active={form.advanceType === 'fixed'} onPress={() => setForm(c => ({ ...c, advanceType: 'fixed' }))} theme={theme} styles={styles} />
                </View>
                <TextInput
                  style={[styles.input, { borderColor: theme.primary + '44' }]}
                  keyboardType="numeric"
                  value={form.advanceValue}
                  onChangeText={v => setForm(c => ({ ...c, advanceValue: v.replace(/[^0-9.]/g, '') }))}
                  placeholderTextColor={theme.placeholder}
                />
              </>
            )}
            <Text style={styles.helpText}>{advanceHelper}</Text>
          </View>
        )}
      </View>

      {form.advancePaymentEnabled ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Mercado Pago</Text>
          <View
            style={[
              styles.statusNotice,
              mercadoPagoStatusTone === 'connected'
                ? styles.statusNoticeConnected
                : mercadoPagoStatusTone === 'pending'
                  ? styles.statusNoticePending
                  : styles.statusNoticeDisconnected,
            ]}
          >
            <Text
              style={[
                styles.statusNoticeTitle,
                mercadoPagoStatusTone === 'connected'
                  ? styles.statusNoticeTitleConnected
                  : mercadoPagoStatusTone === 'pending'
                    ? styles.statusNoticeTitlePending
                    : styles.statusNoticeTitleDisconnected,
              ]}
            >
              {mercadoPagoStatusTone === 'connected'
                ? 'Mercado Pago activo'
                : mercadoPagoStatusTone === 'pending'
                  ? 'Conexión pendiente'
                  : 'Mercado Pago desconectado'}
            </Text>
            <Text
              style={[
                styles.statusNoticeText,
                mercadoPagoStatusTone === 'connected'
                  ? styles.statusNoticeTextConnected
                  : mercadoPagoStatusTone === 'pending'
                    ? styles.statusNoticeTextPending
                    : styles.statusNoticeTextDisconnected,
              ]}
            >
              {mercadoPagoStatusLabel}
            </Text>
          </View>
          <View style={styles.actionStack}>
            <SegmentButton
              label={connecting ? 'Abriendo...' : 'Conectar'}
              active={false}
              onPress={handleConnectMercadoPago}
              theme={theme}
              styles={styles}
              containerStyle={styles.actionButton}
            />
            <SegmentButton
              label="Actualizar estado"
              active={false}
              onPress={loadSettings}
              theme={theme}
              styles={styles}
              containerStyle={styles.actionButton}
            />
            {form.mercadoPagoConnectionStatus === 'connected' ? (
              <SegmentButton
                label="Desconectar"
                active={false}
                onPress={handleDisconnectMercadoPago}
                theme={theme}
                styles={styles}
                containerStyle={styles.actionButton}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <Pressable
        style={[styles.saveButton, { backgroundColor: theme.primary }, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Guardando...' : 'Guardar cobros'}</Text>
      </Pressable>
    </ScrollView>
  );
}

// Sub-componentes con Theme
function RowSwitch({ label, description, value, onValueChange, theme, styles }: any) {
  return (
    <View style={styles.rowSwitch}>
      <View style={styles.rowSwitchBody}>
        <Text style={styles.rowSwitchLabel}>{label}</Text>
        <Text style={styles.rowSwitchDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#323640', true: theme.primary + '66' }}
        thumbColor={value ? theme.primary : '#F4F4F5'}
      />
    </View>
  );
}

function SegmentButton({ label, active, onPress, theme, containerStyle, styles }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.segmentButton,
        active && { backgroundColor: theme.primary + '22', borderColor: theme.primary },
        containerStyle,
      ]}
    >
      <Text style={[styles.segmentButtonText, active && { color: theme.primary }]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  scrollContent: { paddingTop: Platform.OS === 'ios' ? 72 : 28, paddingHorizontal: 20, paddingBottom: 140 },
  loadingWrap: { flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 18 },
  title: { color: theme.textPrimary, fontSize: 34, fontWeight: '800' },
  subtitle: { color: theme.textSecondary, fontSize: 14, marginTop: 6 },
  errorText: {
    color: theme.mode === 'light' ? '#C53333' : '#FF8D8D',
    fontSize: 13,
    marginBottom: 12,
  },
  card: { backgroundColor: theme.card, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 16, marginBottom: 18 },
  rowSwitch: { flexDirection: 'row', alignItems: 'center' },
  rowSwitchBody: { flex: 1 },
  rowSwitchLabel: { color: theme.textPrimary, fontSize: 16, fontWeight: '700' },
  rowSwitchDescription: { color: theme.textSecondary, fontSize: 12, marginTop: 4 },
  separator: { height: 1, backgroundColor: theme.border, marginVertical: 16 },
  nestedBlock: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.border },
  blockLabel: { color: theme.textSecondary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 10 },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  actionStack: { marginTop: 14, gap: 10 },
  statusNotice: { borderRadius: 14, borderWidth: 1, padding: 14 },
  statusNoticeConnected: { backgroundColor: 'rgba(49, 201, 108, 0.12)', borderColor: 'rgba(49, 201, 108, 0.35)' },
  statusNoticePending: { backgroundColor: 'rgba(255, 184, 0, 0.10)', borderColor: 'rgba(255, 184, 0, 0.28)' },
  statusNoticeDisconnected: {
    backgroundColor: theme.mode === 'light' ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255,255,255,0.03)',
    borderColor: theme.mode === 'light' ? 'rgba(15, 23, 42, 0.10)' : 'rgba(255,255,255,0.08)',
  },
  statusNoticeTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  statusNoticeTitleConnected: { color: theme.mode === 'light' ? '#15803D' : '#66DA92' },
  statusNoticeTitlePending: { color: theme.mode === 'light' ? '#B7791F' : '#F6C453' },
  statusNoticeTitleDisconnected: { color: theme.textPrimary },
  statusNoticeText: { fontSize: 12, lineHeight: 18 },
  statusNoticeTextConnected: { color: theme.mode === 'light' ? '#166534' : '#DFF8E8' },
  statusNoticeTextPending: { color: theme.mode === 'light' ? '#92400E' : '#F6E1A9' },
  statusNoticeTextDisconnected: { color: theme.textSecondary },
  segmentButton: { minHeight: 40, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.input, alignItems: 'center', justifyContent: 'center' },
  actionButton: { width: '100%', minHeight: 48 },
  segmentButtonText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
  input: { height: 48, borderRadius: 12, borderWidth: 1, backgroundColor: theme.input, paddingHorizontal: 14, color: theme.textPrimary, marginBottom: 12 },
  helpText: { color: theme.textSecondary, fontSize: 12 },
  sectionTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 14 },
  saveButton: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '800' },
});
