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
  Linking,
} from 'react-native';

import { loginUser, savePushTokenApi } from '../services/api'; // Importado savePushTokenApi
import { saveToken, saveUserProfile } from '../services/authStorage';
import { resolvePostAuthRoute } from '../services/subscriptionAccess';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Importado
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import OjoAbierto from '../assets/ojo_abierto.png';
import OjoCerrado from '../assets/ojo_cerrado.png';
import { SHIFT_APP_BRAND_NAME } from '../utils/businessCopy';
import { REGISTER_ACCOUNT_URL } from '../utils/publicLinks';

const AUTH_THEME = {
  primary: '#39E01F',
  card: '#FFFFFF',
  background: '#F8FAFC',
  logo: require('../assets/logoBarber.png'),
} as const;
function Login({ navigation }: any) {
  const { applyUserTheme } = useTheme();
  const isIOS = Platform.OS === 'ios';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);


  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleOpenWebRegistration = async () => {
    try {
      await Linking.openURL(REGISTER_ACCOUNT_URL);
    } catch (_error) {
      setError('No pudimos abrir el registro web');
    }
  };

  const handleLogin = async () => {
    if (loading) return;
    if (!email || !password) {
      setError('Completa email y contraseña');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // 1. Iniciar sesión y guardar datos básicos
      const res = await loginUser({ email, password });
      await saveToken(res.token);
      await saveUserProfile(res.user);
      applyUserTheme(res.user);

      // 2. Intentar guardar el Push Token en el Backend (incluye refresh recientes)
      try {
        const pToken = await AsyncStorage.getItem('@push_token');
        if (pToken) {
          await savePushTokenApi(pToken);
          console.log('✅ Push Token guardado en el servidor');
        }
      } catch (pushErr) {
        console.log('❌ Error guardando push token en server:', pushErr);
      }

      // 3. Ir al Home
      navigation.reset({
        index: 0,
        routes: [{ name: resolvePostAuthRoute(res.user) }],
      });
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => createStyles(AUTH_THEME), []);

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
          <View style={styles.header}>
            <Image style={styles.logo} source={AUTH_THEME.logo} />
            <Text style={styles.headerSubtitle}>BIENVENIDO A</Text>
            <Text style={styles.headerTitle}>{SHIFT_APP_BRAND_NAME}</Text>
          </View>

          <View style={styles.loginCard}>
            <Text style={styles.instructionText}>
              Iniciá sesión con tu cuenta existente para continuar
            </Text>

            <View style={styles.iosInfoCard}>
              <Text style={styles.iosInfoTitle}>
                Las cuentas se administran fuera de la app.
              </Text>
              <Text style={styles.iosInfoText}>
                {isIOS
                  ? 'Si ya tenés cuenta, iniciá sesión para continuar.'
                  : 'El alta y la activación se resuelven por web.'}
              </Text>
              {!isIOS ? (
                <Pressable
                  style={styles.iosInfoAction}
                  onPress={handleOpenWebRegistration}
                >
                  <Text style={styles.iosInfoActionText}>
                    Crear cuenta por web
                  </Text>
                </Pressable>
              ) : null}
            </View>

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

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Contraseña</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    focusedField === 'password' && styles.inputFocused,
                  ]}
                  placeholder="••••••••"
                  placeholderTextColor="#555"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
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

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[styles.loginBtn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Entrar</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('Recover-Password')}
              style={styles.recoverBtn}
            >
              <Text style={styles.recoverText}>
                ¿Olvidaste tu contraseña?{' '}
                <Text style={styles.recoverTextBold}>Recuperarla</Text>
              </Text>
            </Pressable>

            {!isIOS ? (
              <Pressable
                onPress={handleOpenWebRegistration}
                style={styles.registerBtn}
              >
                <Text style={styles.registerText}>
                  ¿No tenés cuenta?{' '}
                  <Text style={styles.registerTextBold}>Creala por web</Text>
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.codexText}>{SHIFT_APP_BRAND_NAME} by CODEX®</Text>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme | typeof AUTH_THEME) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: 40 },
    header: { marginTop: 80, alignItems: 'center', marginBottom: 40 },
    logo: { width: 90, height: 90, marginBottom: 15, resizeMode: 'contain' },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 3,
    },
    headerTitle: { color: '#0F172A', fontSize: 36, fontWeight: '800' },
    loginCard: {
      marginHorizontal: 20,
      backgroundColor: theme.card,
      borderRadius: 32,
      padding: 25,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      elevation: 10,
    },
    instructionText: {
      color: '#64748B',
      textAlign: 'center',
      marginBottom: 25,
      fontSize: 14,
    },
    iosInfoCard: {
      marginBottom: 18,
      borderRadius: 16,
      padding: 14,
      backgroundColor: '#F8FAFC',
      borderWidth: 1,
      borderColor: '#DBE5F0',
      gap: 6,
    },
    iosInfoTitle: {
      color: '#0F172A',
      fontSize: 13,
      fontWeight: '800',
    },
    iosInfoText: {
      color: '#475569',
      fontSize: 12,
      lineHeight: 18,
    },
    iosInfoAction: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: 'rgba(57, 224, 31, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(57, 224, 31, 0.22)',
    },
    iosInfoActionText: {
      color: '#1F9D36',
      fontSize: 12,
      fontWeight: '800',
    },
    inputContainer: { marginBottom: 15 },
    inputLabel: {
      color: '#64748B',
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 8,
      marginLeft: 5,
    },
    input: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      padding: 16,
      color: '#0F172A',
      fontSize: 16,
      borderWidth: 1,
      borderColor: '#CBD5E1',
    },
    inputFocused: { borderColor: theme.primary },
    passwordWrapper: { position: 'relative' },
    passwordInput: { paddingRight: 55 },
    eyeBtn: {
      position: 'absolute',
      right: 15,
      top: 15,
      height: 30,
      justifyContent: 'center',
    },
    eyeIcon: { fontSize: 20 },
    loginBtn: {
      backgroundColor: theme.primary,
      borderRadius: 20,
      paddingVertical: 18,
      alignItems: 'center',
      marginTop: 10,
    },
    loginBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
    recoverBtn: { marginTop: 16, alignItems: 'center' },
    recoverText: { color: '#64748B', fontSize: 14 },
    recoverTextBold: { color: theme.primary, fontWeight: '700' },
    registerBtn: { marginTop: 25, alignItems: 'center' },
    registerText: { color: '#64748B', fontSize: 14 },
    registerTextBold: { color: theme.primary, fontWeight: '700' },
    errorText: {
      color: '#ff6b6b',
      textAlign: 'center',
      marginBottom: 15,
      fontWeight: '600',
    },
    codexText: {
      color: '#64748B',
      textAlign: 'center',
      marginTop: 30,
      fontSize: 12,
      fontWeight: 'bold',
      letterSpacing: 1,
    },
      eyeIconImage: {
      width: 22,
      height: 22,
      resizeMode: 'contain',
      tintColor: '#64748B',
    },
  });

export default Login;
