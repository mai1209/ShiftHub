import React, { useMemo, useState, useCallback } from 'react';
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
import { updatePassword } from '../services/api';
import { Eye, EyeOff, Lock, ShieldCheck, ArrowLeft } from 'lucide-react-native';

type Props = {
  navigation: any;
};

export default function ChangePasswordScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fieldStyles = useMemo(() => createFieldStyles(theme), [theme]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (saving) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Completá todos los campos.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const response = await updatePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert(
        '¡Éxito!',
        'Tu contraseña ha sido actualizada correctamente.',
      );
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo cambiar la contraseña.');
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
          <Text style={styles.headerTitle}>Actualizar Contraseña</Text>
          <Text style={styles.headerText}>
            Asegúrate de usar una combinación fuerte para mantener tu cuenta
            protegida.
          </Text>
        </View>

        <View style={styles.card}>
          <PasswordField
            label="Contraseña actual"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            theme={theme}
            styles={fieldStyles}
          />
          <PasswordField
            label="Nueva contraseña"
            value={newPassword}
            onChangeText={setNewPassword}
            theme={theme}
            styles={fieldStyles}
          />
          <PasswordField
            label="Repetir nueva contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            theme={theme}
            styles={fieldStyles}
          />

          {!!error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (saving || pressed) && styles.disabledBtn,
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryBtnText}>Guardar cambios</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Componente de campo de contraseña con toggle de visibilidad
 */
function PasswordField({
  label,
  value,
  onChangeText,
  theme,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  theme: Theme;
  styles: any;
}) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Lock size={16} color={theme.textMuted} style={styles.iconLeft} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!isPasswordVisible}
          placeholder="••••••••"
          placeholderTextColor={theme.placeholder}
          style={styles.input}
        />
        <Pressable
          onPress={() => setIsPasswordVisible(!isPasswordVisible)}
          style={styles.eyeBtn}
          hitSlop={10}
        >
          {isPasswordVisible ? (
            <EyeOff size={20} color={theme.primary} />
          ) : (
            <Eye size={20} color={theme.textMuted} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function createFieldStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      marginBottom: 18,
    },
    label: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      paddingHorizontal: 14,
    },
    iconLeft: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      color: theme.textPrimary,
      paddingVertical: 14,
      fontSize: 15,
      fontWeight: '600',
    },
    eyeBtn: {
      padding: 4,
    },
  });
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      marginTop: Platform.OS === 'ios' ? 90 : 20,
    },

    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 60,
    },
    header: {
      marginBottom: 30,
    },
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
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 28,
      fontWeight: '900',
    },
    headerText: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 10,
      fontWeight: '500',
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 30,
      padding: 22,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 5,
    },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 20,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    primaryBtnText: {
      color: theme.textOnPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
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
    disabledBtn: {
      opacity: 0.6,
    },
  });
}
