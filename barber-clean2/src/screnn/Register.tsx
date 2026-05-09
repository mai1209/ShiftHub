import React, { useMemo, useState } from 'react';
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
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';

import { registerUser } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { saveToken, saveUserProfile } from '../services/authStorage';
import OjoAbierto from '../assets/ojo_abierto.png';
import OjoCerrado from '../assets/ojo_cerrado.png';
import {
  BUSINESS_TYPE_OPTIONS,
  SHIFT_APP_BRAND_NAME,
  type BusinessType,
} from '../utils/businessCopy';

const AUTH_THEME = {
  primary: '#39E01F',
  card: '#FFFFFF',
  background: '#F8FAFC',
  logo: require('../assets/LOGO REDONDEADO BORDEADO.png'),
} as const;

function Register({ navigation }: any) {
  const { applyUserTheme } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('beauty_center');
  const [businessTypePickerVisible, setBusinessTypePickerVisible] = useState(false);

  // Estados para visibilidad de contraseñas
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(AUTH_THEME), []);
  const selectedBusinessType = BUSINESS_TYPE_OPTIONS.find(
    option => option.value === businessType,
  );

  const handleRegister = async () => {
    if (loading) return;

    if (!fullName || !email || !password || !confirmPassword) {
      setError('Completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await registerUser({ fullName, email, password, businessType });
      if (response?.token) {
        await saveToken(response.token);
      }
      if (response?.user) {
        await saveUserProfile(response.user);
        applyUserTheme(response.user);
      }
      navigation.replace('Subscription-Settings');
    } catch (err: any) {
      setError(err.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <Image style={styles.logo} source={AUTH_THEME.logo} />
            <Text style={styles.headerSubtitle}>ÚNETE A</Text>
            <Text style={styles.headerTitle}>{SHIFT_APP_BRAND_NAME}</Text>
          </View>
          <View style={styles.registerCard}>
            <Text style={styles.instructionText}>
              Creá tu cuenta para gestionar turnos en tu rubro
            </Text>

            <View style={styles.categoryBlock}>
              <Text style={styles.categoryLabel}>Rubro principal</Text>
              <Pressable
                style={styles.categorySelect}
                onPress={() => setBusinessTypePickerVisible(true)}
              >
                <Text style={styles.categorySelectText}>
                  {selectedBusinessType?.label ?? 'Elegí un rubro'}
                </Text>
                <Text style={styles.categorySelectChevron}>▾</Text>
              </Pressable>
              <Text style={styles.categoryHint}>
                {selectedBusinessType?.description}
              </Text>
            </View>

            {/* Nombre */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Nombre de tu negocio</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedField === 'name' && styles.inputFocused,
                ]}
                placeholder="Nombre de tu negocio"
                placeholderTextColor="#555"
                value={fullName}
                onChangeText={setFullName}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {/* Email */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedField === 'email' && styles.inputFocused,
                ]}
                placeholder="ejemplo@correo.com"
                placeholderTextColor="#555"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
            {/* Password */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Contraseña</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    focusedField === 'pass' && styles.inputFocused,
                  ]}
                  placeholder="••••••••"
                  placeholderTextColor="#555"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('pass')}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable
                  onPress={() => setShowPass(!showPass)}
                  style={styles.eyeBtn}
                >
                  {/* CAMBIO AQUÍ: Usamos Image en lugar de Text */}
                  <Image
                    source={showPass ? OjoAbierto : OjoCerrado}
                    style={styles.eyeIconImage}
                  />
                </Pressable>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Repetir Contraseña</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    focusedField === 'confirm' && styles.inputFocused,
                  ]}
                  placeholder="••••••••"
                  placeholderTextColor="#555"
                  secureTextEntry={!showConfirmPass}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable
                  onPress={() => setShowConfirmPass(!showConfirmPass)}
                  style={styles.eyeBtn}
                >
                  {/* CAMBIO AQUÍ TAMBIÉN */}
                  <Image
                    source={showConfirmPass ? OjoAbierto : OjoCerrado}
                    style={styles.eyeIconImage}
                  />
                </Pressable>
              </View>
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[styles.registerBtn, loading && { opacity: 0.7 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.registerBtnText}>Crear Cuenta</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('Login')}
              style={styles.loginLink}
            >
              <Text style={styles.loginLinkText}>
                ¿Ya tienes cuenta?{' '}
                <Text style={styles.loginLinkBold}>Inicia sesión</Text>
              </Text>
            </Pressable>
          </View>
          <Text style={styles.codexText}>{SHIFT_APP_BRAND_NAME} by CODEX®</Text>
        </ScrollView>
      </TouchableWithoutFeedback>

      <Modal
        visible={businessTypePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBusinessTypePickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setBusinessTypePickerVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Elegí un rubro</Text>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {BUSINESS_TYPE_OPTIONS.map(option => {
                const active = option.value === businessType;
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.modalOption,
                      active && styles.modalOptionActive,
                    ]}
                    onPress={() => {
                      setBusinessType(option.value);
                      setBusinessTypePickerVisible(false);
                    }}
                  >
                    <View style={styles.modalOptionContent}>
                      <Text
                        style={[
                          styles.modalOptionLabel,
                          active && styles.modalOptionLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text style={styles.modalOptionDescription}>
                        {option.description}
                      </Text>
                    </View>
                    {active ? (
                      <Text style={styles.modalOptionCheck}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme | typeof AUTH_THEME) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: 50 },

    header: { marginTop: 60, alignItems: 'center', marginBottom: 30 },
    logo: { width: 70, height: 70, marginBottom: 15, resizeMode: 'contain' },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 3,
    },
    headerTitle: { color: '#0F172A', fontSize: 32, fontWeight: '800' },

    registerCard: {
      marginHorizontal: 20,
      backgroundColor: theme.card,
      borderRadius: 30,
      padding: 22,
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    instructionText: {
      color: '#64748B',
      textAlign: 'center',
      marginBottom: 20,
      fontSize: 14,
    },
    categoryBlock: { marginBottom: 18 },
    categoryLabel: {
      color: '#0F172A',
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 10,
    },
    categorySelect: {
      borderWidth: 1,
      borderColor: '#CBD5E1',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    categorySelectText: {
      color: '#0F172A',
      fontSize: 15,
      fontWeight: '600',
    },
    categorySelectChevron: {
      color: '#64748B',
      fontSize: 18,
      lineHeight: 18,
    },
    categoryHint: {
      color: '#64748B',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 10,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    modalCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      maxHeight: '82%',
    },
    modalTitle: {
      color: '#0F172A',
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 12,
    },
    modalScroll: {
      maxHeight: '100%',
    },
    modalScrollContent: {
      gap: 10,
      paddingBottom: 4,
    },
    modalOption: {
      borderWidth: 1,
      borderColor: '#E2E8F0',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalOptionActive: {
      borderColor: theme.primary,
      backgroundColor: 'rgba(57, 224, 31, 0.08)',
    },
    modalOptionContent: {
      flex: 1,
      gap: 4,
    },
    modalOptionLabel: {
      color: '#0F172A',
      fontSize: 14,
      fontWeight: '700',
    },
    modalOptionLabelActive: {
      color: '#0B7A17',
    },
    modalOptionDescription: {
      color: '#64748B',
      fontSize: 12,
      lineHeight: 16,
    },
    modalOptionCheck: {
      color: '#0B7A17',
      fontSize: 18,
      fontWeight: '800',
    },

    inputContainer: { marginBottom: 12 },
    inputLabel: {
      color: '#64748B',
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 6,
      marginLeft: 4,
    },
    input: {
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      color: '#0F172A',
      fontSize: 16,
      borderWidth: 1,
      borderColor: '#CBD5E1',
    },
    inputFocused: { borderColor: theme.primary },

    passwordWrapper: { position: 'relative' },
    passwordInput: { paddingRight: 50 },
    eyeBtn: {
      position: 'absolute',
      right: 15,
      top: 12,
      height: 30,
      justifyContent: 'center',
    },
    eyeIcon: { fontSize: 18 },

    registerBtn: {
      backgroundColor: theme.primary,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 15,
    },
    registerBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

    loginLink: { marginTop: 20, alignItems: 'center' },
    loginLinkText: { color: '#64748B', fontSize: 13 },
    loginLinkBold: { color: theme.primary, fontWeight: '700' },

    errorText: {
      color: '#ff6b6b',
      textAlign: 'center',
      marginBottom: 10,
      fontWeight: '600',
    },
    codexText: {
      color: '#64748B',
      textAlign: 'center',
      marginTop: 25,
      fontSize: 11,
      fontWeight: '700',
    },

    eyeIconImage: {
      width: 22,
      height: 22,
      resizeMode: 'contain',
      tintColor: '#64748B',
    },
  });

export default Register;
