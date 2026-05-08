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
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { getUserProfile } from '../services/authStorage';
import {
  confirmPasswordRecovery,
  requestPasswordRecovery,
} from '../services/api';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
  Send,
} from 'lucide-react-native';

export default function RecoverPasswordScreen({
  navigation,
}: {
  navigation: any;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fieldStyles = useMemo(() => createFieldStyles(theme), [theme]);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasRequestedCode, setHasRequestedCode] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const user = await getUserProfile<any>();
      if (isMounted && user?.email) {
        setEmail(String(user.email));
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRequestCode = async () => {
    if (sending) return;
    if (!email.trim()) {
      setError('Escribí el mail donde querés recibir el código.');
      return;
    }
    try {
      setSending(true);
      setError('');
      const response = await requestPasswordRecovery({ email: email.trim() });
      setHasRequestedCode(true);
      Alert.alert('Revisá tu mail', 'Te enviamos un código de 6 dígitos.');
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos mandar el código.');
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async () => {
    if (saving) return;
    if (!email.trim() || !code.trim() || !newPassword || !confirmPassword) {
      setError('Completá todos los campos.');
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError('El código debe ser de 6 números.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const response = await confirmPasswordRecovery({
        email: email.trim(),
        code: code.trim(),
        newPassword,
      });
      Alert.alert('Listo', 'Contraseña actualizada correctamente.', [
        { text: 'Ir al inicio', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos guardar la nueva contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View style={styles.badge}>
            <ShieldCheck size={12} color={theme.primary} strokeWidth={3} />
            <Text style={styles.headerSubtitle}>SEGURIDAD</Text>
          </View>
          <Text style={styles.headerTitle}>Recuperar Cuenta</Text>
          <Text style={styles.headerText}>
            Ingresá tu mail para recibir un código de verificación y crear tu
            nueva clave.
          </Text>
        </View>

        <View style={styles.card}>
          <BaseField
            label="Mail de la cuenta"
            styles={fieldStyles}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="ejemplo@correo.com"
            icon={Mail}
          />

          <Pressable
            style={[styles.secondaryBtn, sending && styles.disabledBtn]}
            onPress={handleRequestCode}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color={theme.textPrimary} />
            ) : (
              <>
                <Send size={16} color={theme.textPrimary} style={{ marginRight: 8 }} />
                <Text style={styles.secondaryBtnText}>
                  {hasRequestedCode
                    ? 'Reenviar código'
                    : 'Enviar código al mail'}
                </Text>
              </>
            )}
          </Pressable>

          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>PASO 2</Text>
            <View style={styles.separatorLine} />
          </View>

          <BaseField
            label="Código de verificación"
            styles={fieldStyles}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            placeholder="000000"
            icon={KeyRound}
          />

          <PasswordField
            label="Nueva contraseña"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="••••••••"
            theme={theme}
            styles={fieldStyles}
          />

          <PasswordField
            label="Repetir nueva contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            theme={theme}
            styles={fieldStyles}
          />

          {!!error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.primaryBtn, saving && styles.disabledBtn]}
            onPress={handleConfirm}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryBtnText}>Restablecer contraseña</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- COMPONENTES INTERNOS ---

function BaseField({ label, icon: Icon, styles, ...props }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Icon size={16} color={styles.iconColor} style={styles.iconLeft} />
        <TextInput
          {...props}
          placeholderTextColor={styles.placeholderColor}
          style={styles.input}
        />
      </View>
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  theme,
  styles,
}: any) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Lock size={16} color={styles.iconColor} style={styles.iconLeft} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          placeholder={placeholder}
          placeholderTextColor={styles.placeholderColor}
          style={styles.input}
        />
        <Pressable onPress={() => setVisible(!visible)} hitSlop={10}>
          {visible ? (
            <EyeOff size={20} color={theme.primary} />
          ) : (
            <Eye size={20} color={styles.iconColor} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function createFieldStyles(theme: Theme) {
  return {
    container: { marginBottom: 16 },
    label: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800' as const,
      marginBottom: 8,
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
    },
    inputWrapper: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      paddingHorizontal: 14,
    },
    iconLeft: { marginRight: 10 },
    input: {
      flex: 1,
      color: theme.textPrimary,
      paddingVertical: 14,
      fontSize: 15,
      fontWeight: '600' as const,
    },
    iconColor: theme.textMuted,
    placeholderColor: theme.placeholder,
  };
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      marginTop: Platform.OS === 'ios' ? 80 : 20,
    },

    scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
    header: { marginBottom: 25 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 2,
    },
    headerTitle: { color: theme.textPrimary, fontSize: 28, fontWeight: '900' },
    headerText: { color: theme.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 8 },
    card: {
      backgroundColor: theme.card,
      borderRadius: 30,
      padding: 22,
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryBtn: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryBtnText: { color: theme.textPrimary, fontSize: 13, fontWeight: '700' },
    separator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 20,
      gap: 10,
    },
    separatorLine: { flex: 1, height: 1, backgroundColor: theme.border },
    separatorText: { color: theme.textMuted, fontSize: 10, fontWeight: '900' },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    primaryBtnText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '600' },
    errorContainer: {
      backgroundColor: 'rgba(255, 141, 141, 0.1)',
      padding: 12,
      borderRadius: 12,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: 'rgba(255, 141, 141, 0.2)',
    },
    errorText: {
      color: '#FF8D8D',
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    disabledBtn: { opacity: 0.5 },
  });
}
