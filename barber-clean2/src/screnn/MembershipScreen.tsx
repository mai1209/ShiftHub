import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowLeft,
  Check,
  Plus,
  Users,
  X,
} from 'lucide-react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  fetchMembershipPlans,
  upsertMembershipPlan,
  deleteMembershipPlan,
  createMember,
  type MembershipPlan,
} from '../services/api';

const MAX_PLANS = 4;
const COLORS = ['#FF7A00', '#111827', '#16A34A', '#2563EB', '#DB2777', '#7C3AED'];

const fmtArs = (n: number) => `$ ${Number(n || 0).toLocaleString('es-AR')}`;

// Helpers para armar el gradiente "metálico" a partir del color base.
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hexToRgb = (hex: string) => {
  const s = String(hex || '').replace('#', '');
  const full = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  const num = parseInt(full || '000000', 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};
const toHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  '#' + [r, g, b].map(x => clampByte(x).toString(16).padStart(2, '0')).join('');
const lighten = (hex: string, amt: number) => {
  const { r, g, b } = hexToRgb(hex);
  return toHex({ r: r + (255 - r) * amt, g: g + (255 - g) * amt, b: b + (255 - b) * amt });
};
const darken = (hex: string, amt: number) => {
  const { r, g, b } = hexToRgb(hex);
  return toHex({ r: r * (1 - amt), g: g * (1 - amt), b: b * (1 - amt) });
};

type EditState = {
  planId?: string;
  name: string;
  color: string;
  freeTurns: string;
  durationDays: string;
  priceArs: string;
  giftText: string;
};

const emptyEdit = (): EditState => ({
  name: '',
  color: COLORS[0],
  freeTurns: '',
  durationDays: '',
  priceArs: '',
  giftText: '',
});

function MembershipScreen({ navigation }: any) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [enroll, setEnroll] = useState<{ name: string; email: string; planId: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const p = await fetchMembershipPlans();
      setPlans(p.plans || []);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No pudimos cargar las membresías.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openNew = () => {
    if (plans.length >= MAX_PLANS) {
      Alert.alert('Límite', `Solo podés tener ${MAX_PLANS} membresías.`);
      return;
    }
    setEdit(emptyEdit());
  };

  const openEdit = (p: MembershipPlan) =>
    setEdit({
      planId: p._id,
      name: p.name,
      color: p.color || COLORS[0],
      freeTurns: String(p.freeTurns ?? ''),
      durationDays: String(p.durationDays ?? ''),
      priceArs: String(p.priceArs ?? ''),
      giftText: p.giftText || '',
    });

  const savePlan = async () => {
    if (!edit) return;
    if (!edit.name.trim()) {
      Alert.alert('Falta el nombre', 'Poné un nombre para la membresía.');
      return;
    }
    try {
      setSaving(true);
      await upsertMembershipPlan({
        id: edit.planId,
        name: edit.name.trim(),
        color: edit.color,
        freeTurns: Math.max(0, Math.trunc(Number(edit.freeTurns) || 0)),
        durationDays: Math.max(0, Math.trunc(Number(edit.durationDays) || 0)),
        priceArs: Math.max(0, Number(edit.priceArs.replace(',', '.')) || 0),
        giftText: edit.giftText.trim(),
      });
      setEdit(null);
      await load();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const removePlan = () => {
    if (!edit?.planId) return;
    Alert.alert('Eliminar membresía', '¿Seguro? No afecta a los miembros ya cargados.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            await deleteMembershipPlan(edit.planId!);
            setEdit(null);
            await load();
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'No se pudo eliminar.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const saveEnroll = async () => {
    if (!enroll) return;
    if (!enroll.planId) {
      Alert.alert('Elegí la membresía', 'Tocá la membresía que querés cargar.');
      return;
    }
    if (!enroll.name.trim() || !enroll.email.includes('@')) {
      Alert.alert('Datos del cliente', 'Necesitamos el nombre y un email válido.');
      return;
    }
    try {
      setSaving(true);
      await createMember({
        planId: enroll.planId,
        customerName: enroll.name.trim(),
        customerEmail: enroll.email.trim().toLowerCase(),
      });
      setEnroll(null);
      await load();
      Alert.alert('¡Listo!', 'Miembro cargado. El valor se sumó a la caja.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo cargar el miembro.');
    } finally {
      setSaving(false);
    }
  };

  const emptySlots = Math.max(0, MAX_PLANS - plans.length);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Membresías</Text>
        <Pressable
          style={styles.membersIconBtn}
          onPress={() => navigation.navigate('Members-List')}
        >
          <Users size={20} color={theme.textPrimary} />
          <Text style={styles.membersIconLabel}>Miembros</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.textSecondary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>
            Armá hasta {MAX_PLANS} membresías. Tocá una tarjeta para configurarla.
          </Text>

          {plans.map(p => (
            <Pressable
              key={p._id}
              style={[styles.card, { backgroundColor: p.color }]}
              onPress={() => openEdit(p)}
            >
              {/* Gradiente metálico/platinado basado en el color elegido */}
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgLinearGradient id={`grad-${p._id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={lighten(p.color, 0.38)} />
                    <Stop offset="30%" stopColor={p.color} />
                    <Stop offset="52%" stopColor={lighten(p.color, 0.5)} />
                    <Stop offset="74%" stopColor={darken(p.color, 0.16)} />
                    <Stop offset="100%" stopColor={darken(p.color, 0.42)} />
                  </SvgLinearGradient>
                </Defs>
                <Rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="20"
                  ry="20"
                  fill={`url(#grad-${p._id})`}
                />
              </Svg>

              <View style={styles.cardTopRow}>
                <Text style={styles.cardName}>{p.name}</Text>
                <Text style={styles.cardPrice}>{fmtArs(p.priceArs)}</Text>
              </View>

              <Text style={styles.cardEdit}>Tocá para editar</Text>

              <View style={styles.cardBottom}>
                <Text style={styles.cardPerk}>
                  {p.freeTurns} turno{p.freeTurns === 1 ? '' : 's'} gratis
                  {p.durationDays > 0 ? ` · ${p.durationDays} días` : ''}
                </Text>
                {p.giftText ? (
                  <Text style={styles.cardGift}>🎁 {p.giftText}</Text>
                ) : null}
              </View>

              {/* Cargar miembro a ESTA membresía */}
              <Pressable
                style={styles.cardAddBtn}
                onPress={() => setEnroll({ name: '', email: '', planId: p._id })}
                hitSlop={8}
              >
                <Plus size={20} color={p.color} strokeWidth={3} />
              </Pressable>
            </Pressable>
          ))}

          {Array.from({ length: emptySlots }).map((_, i) => (
            <Pressable key={`slot-${i}`} style={styles.emptyCard} onPress={openNew}>
              <Plus size={22} color={theme.textSecondary} />
              <Text style={styles.emptyCardText}>Crear membresía</Text>
            </Pressable>
          ))}

          <View style={{ height: 130 }} />
        </ScrollView>
      )}

      {/* Config de tarjeta */}
      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{edit?.planId ? 'Editar' : 'Nueva'} membresía</Text>
              <Pressable onPress={() => setEdit(null)}>
                <X size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Plan Fade"
                placeholderTextColor={theme.placeholder}
                value={edit?.name}
                onChangeText={t => setEdit(e => (e ? { ...e, name: t } : e))}
              />

              <Text style={styles.label}>Color</Text>
              <View style={styles.colorRow}>
                {COLORS.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => setEdit(e => (e ? { ...e, color: c } : e))}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      edit?.color === c && styles.colorDotActive,
                    ]}
                  >
                    {edit?.color === c ? (
                      <Check size={18} color="#fff" strokeWidth={3} />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Turnos gratis</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="8"
                    placeholderTextColor={theme.placeholder}
                    value={edit?.freeTurns}
                    onChangeText={t => setEdit(e => (e ? { ...e, freeTurns: t } : e))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Duración (días)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="30 (0 = sin límite)"
                    placeholderTextColor={theme.placeholder}
                    value={edit?.durationDays}
                    onChangeText={t => setEdit(e => (e ? { ...e, durationDays: t } : e))}
                  />
                </View>
              </View>

              <Text style={styles.label}>Precio (va a la caja)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Ej. 30000"
                placeholderTextColor={theme.placeholder}
                value={edit?.priceArs}
                onChangeText={t => setEdit(e => (e ? { ...e, priceArs: t } : e))}
              />

              <Text style={styles.label}>Regalo / extra (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. 1 bebida gratis"
                placeholderTextColor={theme.placeholder}
                value={edit?.giftText}
                onChangeText={t => setEdit(e => (e ? { ...e, giftText: t } : e))}
              />

              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={savePlan}>
                <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
              </Pressable>
              {edit?.planId ? (
                <Pressable style={styles.deleteBtn} disabled={saving} onPress={removePlan}>
                  <Text style={styles.deleteBtnText}>Eliminar membresía</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cargar miembro */}
      <Modal visible={!!enroll} transparent animationType="fade" onRequestClose={() => setEnroll(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Cargar miembro</Text>
              <Pressable onPress={() => setEnroll(null)}>
                <X size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <Text style={styles.label}>Membresía</Text>
              <View style={styles.chips}>
                {plans.map(p => {
                  const active = enroll?.planId === p._id;
                  return (
                    <Pressable
                      key={p._id}
                      style={[styles.chip, active && { backgroundColor: p.color, borderColor: p.color }]}
                      onPress={() => setEnroll(e => (e ? { ...e, planId: p._id } : e))}
                    >
                      <Text style={[styles.chipText, active && { color: '#fff' }]}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Nombre del cliente</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre y apellido"
                placeholderTextColor={theme.placeholder}
                value={enroll?.name}
                onChangeText={t => setEnroll(e => (e ? { ...e, name: t } : e))}
              />

              <Text style={styles.label}>Email del cliente</Text>
              <TextInput
                style={styles.input}
                placeholder="cliente@mail.com"
                placeholderTextColor={theme.placeholder}
                autoCapitalize="none"
                keyboardType="email-address"
                value={enroll?.email}
                onChangeText={t => setEnroll(e => (e ? { ...e, email: t } : e))}
              />
              <Text style={styles.hint}>
                Los turnos se descuentan solos cuando el cliente reserva con este mail.
              </Text>

              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={saveEnroll}>
                <Text style={styles.saveBtnText}>{saving ? 'Cargando...' : 'Cargar miembro'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 56,
      paddingBottom: 12,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    title: { fontSize: 22, fontWeight: '800', color: theme.textPrimary, flex: 1 },
    membersIconBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 38,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    membersIconLabel: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    content: { paddingHorizontal: 18, paddingBottom: 30, gap: 14 },
    subtitle: { color: theme.textSecondary, fontSize: 13, marginBottom: 2 },
    card: {
      borderRadius: 20,
      padding: 18,
      minHeight: 168,
      overflow: 'hidden',
      position: 'relative',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardName: {
      color: '#fff',
      fontSize: 19,
      fontWeight: '800',
      flex: 1,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    cardPrice: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '800',
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    cardPerk: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
      marginTop: 8,
      textShadowColor: 'rgba(0,0,0,0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    cardGift: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: 13,
      marginTop: 4,
      textShadowColor: 'rgba(0,0,0,0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    cardEdit: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: 12.5,
      fontWeight: '800',
      textAlign: 'center',
      alignSelf: 'center',
      textShadowColor: 'rgba(0,0,0,0.18)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    cardBottom: { paddingRight: 52 },
    cardAddBtn: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: '#fff',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    emptyCard: {
      borderRadius: 20,
      minHeight: 96,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    emptyCardText: { color: theme.primary, fontWeight: '800', fontSize: 14 },
    enrollBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 15,
      marginTop: 6,
    },
    enrollBtnText: { color: theme.textOnPrimary, fontWeight: '800', fontSize: 15 },
    sectionLabel: {
      color: theme.textSecondary,
      fontWeight: '800',
      fontSize: 13,
      marginTop: 14,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      marginTop: 8,
    },
    memberName: { color: theme.textPrimary, fontWeight: '800', fontSize: 15 },
    memberMail: { color: theme.textSecondary, fontSize: 12 },
    memberPlan: { color: theme.primary, fontSize: 12, fontWeight: '700', marginTop: 2 },
    memberBadge: { alignItems: 'center', minWidth: 56 },
    memberBadgeNum: { color: theme.textPrimary, fontSize: 20, fontWeight: '800' },
    memberBadgeLbl: { color: theme.textSecondary, fontSize: 11 },
    accItem: { marginBottom: 10 },
    accHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    accTitle: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 15,
      flex: 1,
      textShadowColor: 'rgba(0,0,0,0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    accRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    accCount: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 14,
      backgroundColor: 'rgba(255,255,255,0.25)',
      minWidth: 24,
      textAlign: 'center',
      borderRadius: 12,
      paddingHorizontal: 6,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    accEmpty: {
      color: theme.textSecondary,
      fontSize: 13,
      paddingVertical: 10,
      paddingHorizontal: 6,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 18,
    },
    modalCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 22,
      padding: 18,
      maxHeight: '85%',
    },
    modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: theme.textPrimary },
    label: { color: theme.textPrimary, fontWeight: '700', fontSize: 13, marginTop: 12, marginBottom: 6 },
    input: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.textPrimary,
      fontSize: 15,
    },
    row2: { flexDirection: 'row', gap: 12 },
    colorRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
      paddingVertical: 6,
      paddingLeft: 12,
      paddingRight: 6,
    },
    colorDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorDotActive: { borderColor: theme.textPrimary, transform: [{ scale: 1.12 }] },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    chipText: { color: theme.textPrimary, fontWeight: '700', fontSize: 13 },
    hint: { color: theme.textSecondary, fontSize: 12, marginTop: 8 },
    saveBtn: {
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 18,
    },
    saveBtnText: { color: theme.textOnPrimary, fontWeight: '800', fontSize: 15 },
    deleteBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    deleteBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  });

export default MembershipScreen;
