import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, ChevronDown, Search, X } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  fetchMembershipPlans,
  fetchMembers,
  type MembershipPlan,
  type Membership,
} from '../services/api';

function MembersListScreen({ navigation }: any) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([fetchMembershipPlans(), fetchMembers()]);
      setPlans(p.plans || []);
      setMembers(m.members || []);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No pudimos cargar los miembros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const planById = useMemo(() => {
    const map: Record<string, MembershipPlan> = {};
    plans.forEach(p => {
      map[p._id] = p;
    });
    return map;
  }, [plans]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = useMemo(() => {
    if (!searching) return [];
    return members.filter(
      m =>
        (m.customerName || '').toLowerCase().includes(q) ||
        (m.customerEmail || '').toLowerCase().includes(q),
    );
  }, [members, q, searching]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Miembros</Text>
        <Text style={styles.headerCount}>{members.length}</Text>
      </View>

      <View style={styles.searchBox}>
        <Search size={16} color={theme.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre o email"
          placeholderTextColor={theme.placeholder}
          autoCapitalize="none"
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <X size={16} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.textSecondary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {plans.length === 0 ? (
            <Text style={styles.hint}>Todavía no creaste membresías.</Text>
          ) : searching ? (
            matches.length === 0 ? (
              <Text style={styles.hint}>Sin resultados para “{query}”.</Text>
            ) : (
              matches.map(m => {
                const plan = m.plan ? planById[m.plan] : undefined;
                return (
                  <View key={m._id} style={styles.memberRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{m.customerName}</Text>
                      <Text style={styles.memberMail}>{m.customerEmail}</Text>
                      {plan ? (
                        <Text style={[styles.memberPlan, { color: plan.color }]}>
                          {plan.name}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.memberBadge}>
                      <Text style={styles.memberBadgeNum}>{m.turnsRemaining}</Text>
                      <Text style={styles.memberBadgeLbl}>quedan</Text>
                    </View>
                  </View>
                );
              })
            )
          ) : (
            plans.map(p => {
              const mine = members.filter(m => m.plan === p._id);
              const open = expandedPlanId === p._id;
              return (
                <View key={p._id} style={styles.accItem}>
                  <Pressable
                    style={[styles.accHeader, { backgroundColor: p.color }]}
                    onPress={() => setExpandedPlanId(open ? null : p._id)}
                  >
                    <Text style={styles.accTitle}>{p.name}</Text>
                    <View style={styles.accRight}>
                      <Text style={styles.accCount}>{mine.length}</Text>
                      <ChevronDown
                        size={18}
                        color="#fff"
                        style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                      />
                    </View>
                  </Pressable>
                  {open ? (
                    mine.length === 0 ? (
                      <Text style={styles.accEmpty}>Sin miembros todavía.</Text>
                    ) : (
                      mine.map(m => (
                        <View key={m._id} style={styles.memberRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.memberName}>{m.customerName}</Text>
                            <Text style={styles.memberMail}>{m.customerEmail}</Text>
                          </View>
                          <View style={styles.memberBadge}>
                            <Text style={styles.memberBadgeNum}>
                              {m.turnsRemaining}
                            </Text>
                            <Text style={styles.memberBadgeLbl}>quedan</Text>
                          </View>
                        </View>
                      ))
                    )
                  ) : null}
                </View>
              );
            })
          )}

          <View style={{ height: 130 }} />
        </ScrollView>
      )}
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
    headerCount: {
      color: theme.textSecondary,
      fontWeight: '800',
      fontSize: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      minWidth: 30,
      textAlign: 'center',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
      overflow: 'hidden',
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 18,
      marginBottom: 6,
      paddingHorizontal: 14,
      height: 44,
      borderRadius: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    searchInput: { flex: 1, color: theme.textPrimary, fontSize: 15 },
    content: { paddingHorizontal: 18, paddingTop: 8 },
    hint: { color: theme.textSecondary, fontSize: 13, marginTop: 8 },
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
    memberPlan: { fontSize: 12, fontWeight: '700', marginTop: 2 },
    memberBadge: { alignItems: 'center', minWidth: 56 },
    memberBadgeNum: { color: theme.textPrimary, fontSize: 20, fontWeight: '800' },
    memberBadgeLbl: { color: theme.textSecondary, fontSize: 11 },
  });

export default MembersListScreen;
