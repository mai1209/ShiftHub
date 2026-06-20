import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  createMember,
  deleteMembershipPlan,
  fetchMembers,
  fetchMembershipPlans,
  upsertMembershipPlan,
  type Membership,
  type MembershipPlan,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';

const MAX_PLANS = 4;
const PLAN_COLORS = [
  '#2FAA1F',
  '#2563EB',
  '#9333EA',
  '#E11D48',
  '#F59E0B',
  '#0EA5E9',
  '#111827',
];

type PlanDraft = {
  id?: string;
  name: string;
  color: string;
  freeTurns: string;
  durationDays: string;
  giftText: string;
  priceArs: string;
};

const emptyDraft = (): PlanDraft => ({
  name: '',
  color: PLAN_COLORS[0],
  freeTurns: '4',
  durationDays: '30',
  giftText: '',
  priceArs: '',
});

function formatPrice(value: number) {
  return `$${Math.max(0, Number(value || 0)).toLocaleString('es-AR')}`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

function statusLabel(status: Membership['status']) {
  switch (status) {
    case 'active':
      return 'Activa';
    case 'depleted':
      return 'Sin turnos';
    case 'expired':
      return 'Vencida';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status;
  }
}

export default function MembershipSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de plan
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft());
  const [savingPlan, setSavingPlan] = useState(false);

  // Modal de cargar miembro
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberPlanId, setMemberPlanId] = useState<string>('');
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [savingMember, setSavingMember] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [plansResponse, membersResponse] = await Promise.all([
        fetchMembershipPlans(),
        fetchMembers().catch(() => ({ members: [] })),
      ]);
      setPlans(plansResponse?.plans ?? []);
      setMembers(membersResponse?.members ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos cargar las membresías.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const openNewPlan = () => {
    if (plans.length >= MAX_PLANS) {
      Alert.alert('Límite', `Podés tener hasta ${MAX_PLANS} planes activos.`);
      return;
    }
    setDraft(emptyDraft());
    setPlanModalOpen(true);
  };

  const openEditPlan = (plan: MembershipPlan) => {
    setDraft({
      id: plan._id,
      name: plan.name,
      color: plan.color || PLAN_COLORS[0],
      freeTurns: String(plan.freeTurns ?? ''),
      durationDays: String(plan.durationDays ?? 0),
      giftText: plan.giftText ?? '',
      priceArs: String(plan.priceArs ?? ''),
    });
    setPlanModalOpen(true);
  };

  const handleSavePlan = async () => {
    const name = draft.name.trim();
    const freeTurns = Math.floor(Number(draft.freeTurns));
    const priceArs = Math.max(0, Number(draft.priceArs) || 0);
    const durationDays = Math.max(0, Math.floor(Number(draft.durationDays) || 0));

    if (!name) {
      Alert.alert('Falta el nombre', 'Poné un nombre para el plan.');
      return;
    }
    if (!Number.isFinite(freeTurns) || freeTurns < 1) {
      Alert.alert('Turnos inválidos', 'El plan tiene que dar al menos 1 turno.');
      return;
    }

    try {
      setSavingPlan(true);
      await upsertMembershipPlan({
        id: draft.id,
        name,
        color: draft.color,
        freeTurns,
        durationDays,
        giftText: draft.giftText.trim(),
        priceArs,
      });
      setPlanModalOpen(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No pudimos guardar el plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleDeletePlan = (plan: MembershipPlan) => {
    Alert.alert(
      'Eliminar plan',
      `¿Querés sacar el plan "${plan.name}"? Las membresías ya cargadas siguen funcionando.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMembershipPlan(plan._id);
              setPlanModalOpen(false);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'No pudimos eliminar el plan.');
            }
          },
        },
      ],
    );
  };

  const openLoadMember = () => {
    if (!plans.length) {
      Alert.alert('Sin planes', 'Primero creá un plan de membresía.');
      return;
    }
    setMemberPlanId(plans[0]._id);
    setMemberName('');
    setMemberEmail('');
    setMemberModalOpen(true);
  };

  const handleSaveMember = async () => {
    const name = memberName.trim();
    const email = memberEmail.trim().toLowerCase();
    if (!memberPlanId) {
      Alert.alert('Elegí un plan', 'Seleccioná el plan de la membresía.');
      return;
    }
    if (!name) {
      Alert.alert('Falta el nombre', 'Poné el nombre del cliente.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Email inválido', 'Poné un email válido del cliente.');
      return;
    }

    try {
      setSavingMember(true);
      await createMember({
        planId: memberPlanId,
        customerName: name,
        customerEmail: email,
      });
      setMemberModalOpen(false);
      Alert.alert('Listo', 'Membresía cargada y registrada en caja.');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No pudimos cargar el miembro.');
    } finally {
      setSavingMember(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={theme.textSecondary} />
      </View>
    );
  }

  const selectedPlan = plans.find(plan => plan._id === memberPlanId) || null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Membresías</Text>
        <Text style={styles.subtitle}>
          Vendé packs de turnos. El cliente reserva gratis hasta agotar los
          turnos o que venza el plan.
        </Text>
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Planes ({plans.length}/{MAX_PLANS})</Text>
        {plans.length < MAX_PLANS && (
          <Pressable style={styles.smallButton} onPress={openNewPlan}>
            <Text style={styles.smallButtonText}>+ Crear plan</Text>
          </Pressable>
        )}
      </View>

      {plans.length ? (
        <View style={styles.cardList}>
          {plans.map(plan => (
            <Pressable
              key={plan._id}
              style={[styles.planCard, { backgroundColor: plan.color || PLAN_COLORS[0] }]}
              onPress={() => openEditPlan(plan)}
            >
              <View style={styles.planCardTop}>
                <Text style={styles.planCardName}>{plan.name}</Text>
                <Text style={styles.planCardPrice}>{formatPrice(plan.priceArs)}</Text>
              </View>
              <Text style={styles.planCardTurns}>
                {plan.freeTurns} turno{plan.freeTurns === 1 ? '' : 's'} gratis
              </Text>
              <View style={styles.planCardBottom}>
                <Text style={styles.planCardMeta}>
                  {plan.durationDays > 0
                    ? `Vence a los ${plan.durationDays} días`
                    : 'Sin límite de tiempo'}
                </Text>
                <Text style={styles.planCardEdit}>Editar</Text>
              </View>
              {!!plan.giftText && (
                <Text style={styles.planCardGift}>🎁 {plan.giftText}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Todavía no hay planes</Text>
          <Text style={styles.emptyText}>
            Creá un plan (ej. "Pack 4 turnos") y después cargá a los clientes que
            lo compren.
          </Text>
        </View>
      )}

      <View style={[styles.sectionRow, { marginTop: 22 }]}>
        <Text style={styles.sectionTitle}>Miembros</Text>
        <Pressable style={styles.smallButtonPrimary} onPress={openLoadMember}>
          <Text style={styles.smallButtonPrimaryText}>+ Cargar miembro</Text>
        </Pressable>
      </View>

      {members.length ? (
        <View style={styles.cardList}>
          {members.map(member => {
            const expires = formatDate(member.expiresAt);
            return (
              <View key={member._id} style={styles.memberCard}>
                <View style={styles.memberTop}>
                  <View style={styles.memberMain}>
                    <Text style={styles.memberName}>{member.customerName}</Text>
                    <Text style={styles.memberEmail}>{member.customerEmail}</Text>
                  </View>
                  <Text
                    style={[
                      styles.statusPill,
                      member.status === 'active'
                        ? styles.statusPillActive
                        : styles.statusPillOff,
                    ]}
                  >
                    {statusLabel(member.status)}
                  </Text>
                </View>
                <Text style={styles.memberPlan}>{member.planName}</Text>
                <View style={styles.memberBottom}>
                  <Text style={styles.memberTurns}>
                    {member.turnsRemaining} de {member.turnsTotal} turnos
                  </Text>
                  {expires && (
                    <Text style={styles.memberExpiry}>Vence {expires}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Cuando cargues una membresía a un cliente, va a aparecer acá.
          </Text>
        </View>
      )}

      {/* Modal: crear/editar plan */}
      <Modal
        visible={planModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPlanModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>
                {draft.id ? 'Editar plan' : 'Nuevo plan'}
              </Text>

              <Text style={styles.fieldLabel}>Nombre del plan</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Pack 4 turnos"
                placeholderTextColor={theme.placeholder}
                value={draft.name}
                onChangeText={value => setDraft(d => ({ ...d, name: value }))}
              />

              <Text style={styles.fieldLabel}>Color de la tarjeta</Text>
              <View style={styles.colorRow}>
                {PLAN_COLORS.map(color => (
                  <Pressable
                    key={color}
                    style={[
                      styles.colorDot,
                      { backgroundColor: color },
                      draft.color === color && styles.colorDotActive,
                    ]}
                    onPress={() => setDraft(d => ({ ...d, color }))}
                  />
                ))}
              </View>

              <View style={styles.rowTwo}>
                <View style={styles.rowItem}>
                  <Text style={styles.fieldLabel}>Turnos gratis</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    placeholder="4"
                    placeholderTextColor={theme.placeholder}
                    value={draft.freeTurns}
                    onChangeText={value =>
                      setDraft(d => ({ ...d, freeTurns: value.replace(/[^0-9]/g, '') }))
                    }
                  />
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.fieldLabel}>Precio (ARS)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={theme.placeholder}
                    value={draft.priceArs}
                    onChangeText={value =>
                      setDraft(d => ({ ...d, priceArs: value.replace(/[^0-9]/g, '') }))
                    }
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Duración (días) — 0 = sin límite</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                placeholder="30"
                placeholderTextColor={theme.placeholder}
                value={draft.durationDays}
                onChangeText={value =>
                  setDraft(d => ({ ...d, durationDays: value.replace(/[^0-9]/g, '') }))
                }
              />
              <Text style={styles.helpText}>
                La membresía vence por lo que pase primero: que se acaben los
                turnos o que pasen los días.
              </Text>

              <Text style={styles.fieldLabel}>Texto de regalo (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. + un café de regalo"
                placeholderTextColor={theme.placeholder}
                value={draft.giftText}
                onChangeText={value => setDraft(d => ({ ...d, giftText: value }))}
              />

              <Pressable
                style={[styles.saveButton, savingPlan && styles.saveButtonDisabled]}
                onPress={handleSavePlan}
                disabled={savingPlan}
              >
                <Text style={styles.saveButtonText}>
                  {savingPlan ? 'Guardando...' : draft.id ? 'Guardar cambios' : 'Crear plan'}
                </Text>
              </Pressable>

              {draft.id && (
                <Pressable
                  style={styles.removeButton}
                  onPress={() => {
                    const plan = plans.find(p => p._id === draft.id);
                    if (plan) handleDeletePlan(plan);
                  }}
                >
                  <Text style={styles.removeButtonText}>Eliminar plan</Text>
                </Pressable>
              )}

              <Pressable
                style={styles.cancelButton}
                onPress={() => setPlanModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: cargar miembro */}
      <Modal
        visible={memberModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setMemberModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Cargar miembro</Text>

              <Text style={styles.fieldLabel}>Plan</Text>
              <View style={styles.planPickerList}>
                {plans.map(plan => {
                  const active = plan._id === memberPlanId;
                  return (
                    <Pressable
                      key={plan._id}
                      style={[
                        styles.planPickerItem,
                        active && {
                          borderColor: plan.color || theme.primary,
                          backgroundColor: (plan.color || theme.primary) + '18',
                        },
                      ]}
                      onPress={() => setMemberPlanId(plan._id)}
                    >
                      <View
                        style={[styles.planPickerDot, { backgroundColor: plan.color }]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planPickerName}>{plan.name}</Text>
                        <Text style={styles.planPickerMeta}>
                          {plan.freeTurns} turnos · {formatPrice(plan.priceArs)}
                        </Text>
                      </View>
                      {active && <Text style={styles.planPickerCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Nombre del cliente</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre y apellido"
                placeholderTextColor={theme.placeholder}
                value={memberName}
                onChangeText={setMemberName}
              />

              <Text style={styles.fieldLabel}>Email del cliente</Text>
              <TextInput
                style={styles.input}
                placeholder="email@cliente.com"
                placeholderTextColor={theme.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                value={memberEmail}
                onChangeText={setMemberEmail}
              />
              <Text style={styles.helpText}>
                Con este email el cliente va a ver su membresía al reservar en la web.
              </Text>

              {selectedPlan && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryText}>
                    Se registra {formatPrice(selectedPlan.priceArs)} como ingreso en caja.
                  </Text>
                </View>
              )}

              <Pressable
                style={[styles.saveButton, savingMember && styles.saveButtonDisabled]}
                onPress={handleSaveMember}
                disabled={savingMember}
              >
                <Text style={styles.saveButtonText}>
                  {savingMember ? 'Cargando...' : 'Cargar membresía'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setMemberModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scrollContent: {
      paddingTop: 72,
      paddingHorizontal: 14,
      paddingBottom: 140,
    },
    loadingWrap: {
      flex: 1,
      backgroundColor: theme.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    header: { marginBottom: 18 },
    title: { color: theme.textPrimary, fontSize: 30, fontWeight: '900' },
    subtitle: { color: theme.textSecondary, fontSize: 14, marginTop: 6, lineHeight: 20 },
    errorText: {
      color: theme.mode === 'light' ? '#C53333' : '#FF8D8D',
      fontSize: 13,
      marginBottom: 12,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '900' },
    smallButton: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.primary + '18',
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    smallButtonText: { color: theme.primary, fontSize: 12, fontWeight: '900' },
    smallButtonPrimary: {
      borderRadius: 12,
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    smallButtonPrimaryText: {
      color: theme.textOnPrimary,
      fontSize: 12,
      fontWeight: '900',
    },
    cardList: { gap: 14 },
    planCard: {
      borderRadius: 22,
      padding: 18,
      gap: 8,
      minHeight: 120,
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    planCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    planCardName: { color: '#fff', fontSize: 18, fontWeight: '900', flex: 1 },
    planCardPrice: { color: '#fff', fontSize: 18, fontWeight: '900' },
    planCardTurns: { color: '#fff', fontSize: 26, fontWeight: '900' },
    planCardBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    planCardMeta: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
    planCardEdit: { color: '#fff', fontSize: 12, fontWeight: '900' },
    planCardGift: { color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: '700' },
    emptyCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 18,
    },
    emptyTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: '900' },
    emptyText: { color: theme.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
    memberCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 16,
      gap: 6,
    },
    memberTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    memberMain: { flex: 1, gap: 2 },
    memberName: { color: theme.textPrimary, fontSize: 16, fontWeight: '900' },
    memberEmail: { color: theme.textMuted, fontSize: 12 },
    memberPlan: { color: theme.textSecondary, fontSize: 13, fontWeight: '700' },
    memberBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    memberTurns: { color: theme.primary, fontSize: 14, fontWeight: '900' },
    memberExpiry: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    statusPill: {
      borderRadius: 999,
      overflow: 'hidden',
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 11,
      fontWeight: '900',
    },
    statusPillActive: {
      color: theme.mode === 'light' ? '#166534' : '#86EFAC',
      backgroundColor: 'rgba(22, 163, 74, 0.14)',
    },
    statusPillOff: {
      color: theme.textMuted,
      backgroundColor: theme.input,
    },
    // Modales
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.background,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      maxHeight: '90%',
    },
    modalScroll: { padding: 20, paddingBottom: 36, gap: 4 },
    modalTitle: {
      color: theme.textPrimary,
      fontSize: 22,
      fontWeight: '900',
      marginBottom: 12,
    },
    fieldLabel: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginTop: 12,
      marginBottom: 6,
    },
    input: {
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      paddingHorizontal: 14,
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    helpText: { color: theme.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    colorDot: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorDotActive: { borderColor: theme.textPrimary },
    rowTwo: { flexDirection: 'row', gap: 12 },
    rowItem: { flex: 1 },
    planPickerList: { gap: 10 },
    planPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      padding: 12,
    },
    planPickerDot: { width: 16, height: 16, borderRadius: 8 },
    planPickerName: { color: theme.textPrimary, fontSize: 15, fontWeight: '900' },
    planPickerMeta: { color: theme.textSecondary, fontSize: 12, fontWeight: '700' },
    planPickerCheck: { color: theme.primary, fontSize: 18, fontWeight: '900' },
    summaryBox: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      padding: 12,
      marginTop: 12,
    },
    summaryText: { color: theme.textSecondary, fontSize: 13, lineHeight: 18 },
    saveButton: {
      height: 54,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '900' },
    removeButton: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.35)',
      backgroundColor: 'rgba(239, 68, 68, 0.10)',
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 10,
    },
    removeButtonText: {
      color: theme.mode === 'light' ? '#C53333' : '#FF8D8D',
      fontSize: 13,
      fontWeight: '900',
    },
    cancelButton: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    cancelButtonText: { color: theme.textMuted, fontSize: 14, fontWeight: '800' },
  });
