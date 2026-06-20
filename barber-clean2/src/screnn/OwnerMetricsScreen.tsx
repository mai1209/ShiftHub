import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  CurrentMonthOverviewResponse,
  MonthOverviewBarber,
  getCurrentUser,
  fetchOwnerMetricsOverview,
} from '../services/api';
import { hasProPlanAccess } from '../services/planAccess';
import LockedFeatureScreen from '../components/LockedFeatureScreen';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  Calendar,
  Users,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Banknote,
  CreditCard,
} from 'lucide-react-native';

type Props = {
  navigation: any;
};

type RangeMode = 'daily' | 'weekly' | 'monthly' | 'annual';

const RANGE_OPTIONS: { key: RangeMode; label: string }[] = [
  { key: 'daily', label: 'Día' },
  { key: 'weekly', label: 'Semana' },
  { key: 'monthly', label: 'Mes' },
  { key: 'annual', label: 'Año' },
];

const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

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

function OwnerMetricsScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [rangeMode, setRangeMode] = useState<RangeMode>('monthly');
  const [refDate, setRefDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<CurrentMonthOverviewResponse | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const buildRangeParams = useCallback(() => {
    if (rangeMode === 'daily')
      return { range: 'daily' as const, date: toYmd(refDate) };
    if (rangeMode === 'weekly')
      return { range: 'weekly' as const, date: toYmd(refDate) };
    if (rangeMode === 'annual')
      return { range: 'annual' as const, year: refDate.getFullYear() };
    return {
      range: 'monthly' as const,
      year: refDate.getFullYear(),
      month: refDate.getMonth() + 1,
    };
  }, [rangeMode, refDate]);

  const shiftPeriod = (dir: number) => {
    setRefDate(prev => {
      const d = new Date(prev);
      if (rangeMode === 'daily') d.setDate(d.getDate() + dir);
      else if (rangeMode === 'weekly') d.setDate(d.getDate() + dir * 7);
      else if (rangeMode === 'annual') d.setFullYear(d.getFullYear() + dir);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) setLoading(true);
        setError('');
        const currentUser = await getCurrentUser();
        const canUseFeature = hasProPlanAccess(currentUser?.user);
        setHasAccess(canUseFeature);
        if (!canUseFeature) return;
        const response = await fetchOwnerMetricsOverview(buildRangeParams());
        setData(response);
      } catch (err: any) {
        setError(err?.message ?? 'No se pudo cargar el resumen');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildRangeParams],
  );

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [loadData]),
  );

  if (hasAccess === false) {
    return (
      <LockedFeatureScreen
        theme={theme}
        navigation={navigation}
        title="Métricas globales bloqueadas"
        body="Las métricas globales del negocio están disponibles con plan Pro."
      />
    );
  }

  const periodLabel = data?.period.label || toYmd(refDate);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData(true);
            }}
            tintColor={theme.primary}
          />
        }
      >
        {/* Header Elegante */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerTextGroup}>
              <Text style={styles.headerSubtitle}>ADMINISTRACIÓN</Text>
              <Text style={styles.headerTitle}>Global Local</Text>
            </View>
          </View>
        </View>

        {/* Filtros de Periodo */}
        <View style={styles.filterContainer}>
          <View style={styles.filterHeader}>
            <View style={styles.filterLabelGroup}>
              <Calendar size={14} color={theme.textSecondary} />
              <Text style={styles.filterHeaderText}>Periodo de análisis</Text>
            </View>
          </View>

          <View style={styles.rangeTabs}>
            {RANGE_OPTIONS.map(opt => {
              const active = rangeMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.rangeTab, active && styles.rangeTabActive]}
                  onPress={() => setRangeMode(opt.key)}
                >
                  <Text
                    style={[
                      styles.rangeTabText,
                      active && styles.rangeTabTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.periodNav}>
            <Pressable style={styles.periodNavBtn} onPress={() => shiftPeriod(-1)}>
              <ChevronLeft size={18} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.periodNavLabel}>{periodLabel}</Text>
            <Pressable style={styles.periodNavBtn} onPress={() => shiftPeriod(1)}>
              <ChevronRight size={18} color={theme.textPrimary} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={theme.textSecondary} />
            <Text style={styles.loaderText}>
              Consolidando datos del local...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.mainContent}>
            {/* 1. EL TOTAL (HIGHLIGHT PRINCIPAL) */}
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <Text style={styles.heroPeriod}>{periodLabel}</Text>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>TOTAL GENERAL</Text>
                </View>
              </View>
              <Text style={styles.heroValue}>
                {formatCurrency(data?.totals.totalRevenue ?? 0)}
              </Text>
              <View style={styles.heroFooter}>
                <View style={styles.heroMetric}>
                  <Users size={14} color={theme.textSecondary} opacity={0.8} />
                  <Text style={styles.heroMetricText}>
                    {data?.totals.appointmentsCount ?? 0} Turnos
                  </Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroMetric}>
                  <TrendingUp size={14} color={theme.textSecondary} />
                  <Text style={styles.heroMetricText}>Rendimiento Óptimo</Text>
                </View>
              </View>
            </View>

            {/* 2. DESGLOSE DE COBROS */}
            <View style={styles.paymentRow}>
              <View style={styles.paymentCard}>
                <View
                  style={[
                    styles.paymentIconWrap,
                    { backgroundColor: hexToRgba(theme.primary, 0.12) },
                  ]}
                >
                  <Banknote size={16} color={theme.textSecondary} />
                </View>
                <View>
                  <Text style={styles.paymentLabel}>Efectivo</Text>
                  <Text style={styles.paymentValue}>
                    {formatCurrency(data?.totals.cashRevenue ?? 0)}
                  </Text>
                  <Text style={styles.paymentSub}>
                    {data?.totals.cashCount ?? 0} cobros
                  </Text>
                </View>
              </View>

              <View style={styles.paymentCard}>
                <View
                  style={[
                    styles.paymentIconWrap,
                    { backgroundColor: hexToRgba(theme.primary, 0.12) },
                  ]}
                >
                  <CreditCard size={16} color={theme.textSecondary} />
                </View>
                <View>
                  <Text style={styles.paymentLabel}>Transferencia</Text>
                  <Text style={styles.paymentValue}>
                    {formatCurrency(data?.totals.transferRevenue ?? 0)}
                  </Text>
                  <Text style={styles.paymentSub}>
                    {data?.totals.transferCount ?? 0} cobros
                  </Text>
                </View>
              </View>
            </View>

            {/* 2b. COMISIONES Y GANANCIA DEL LOCAL */}
            <View style={styles.paymentRow}>
              <View style={styles.paymentCard}>
                <View
                  style={[
                    styles.paymentIconWrap,
                    { backgroundColor: hexToRgba(theme.primary, 0.12) },
                  ]}
                >
                  <Users size={16} color={theme.textSecondary} />
                </View>
                <View>
                  <Text style={styles.paymentLabel}>Comisiones</Text>
                  <Text style={styles.paymentValue}>
                    {formatCurrency(data?.totals.commission ?? 0)}
                  </Text>
                  <Text style={styles.paymentSub}>de los profesionales</Text>
                </View>
              </View>

              <View style={styles.paymentCard}>
                <View
                  style={[
                    styles.paymentIconWrap,
                    { backgroundColor: hexToRgba(theme.primary, 0.12) },
                  ]}
                >
                  <TrendingUp size={16} color={theme.textSecondary} />
                </View>
                <View>
                  <Text style={styles.paymentLabel}>Ganancia del local</Text>
                  <Text style={styles.paymentValue}>
                    {formatCurrency(data?.totals.localRevenue ?? 0)}
                  </Text>
                  <Text style={styles.paymentSub}>neto de comisiones</Text>
                </View>
              </View>
            </View>

            {/* 3. RANKING DE BARBEROS */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Rendimiento por Barbero</Text>
              <LayoutDashboard size={16} color={theme.textSecondary} />
            </View>

            <View style={styles.barberList}>
              {(data?.byBarber ?? []).map(
                (item: MonthOverviewBarber, index: number) => (
                  <Pressable
                    key={item.barberId}
                    style={({ pressed }) => [
                      styles.barberRow,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() =>
                      navigation.navigate('Customer-History', {
                        barberId: item.barberId,
                        barberName: item.barberName,
                      })
                    }
                  >
                    <View style={styles.barberInfo}>
                      <View style={styles.barberRank}>
                        <Text style={styles.rankText}>{index + 1}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.barberNameText} numberOfLines={1}>
                          {item.barberName}
                        </Text>
                        <Text style={styles.barberSubText} numberOfLines={1}>
                          {item.appointmentsCount} turnos realizados
                        </Text>
                      </View>
                    </View>
                    <View style={styles.barberStats}>
                      <Text style={styles.barberRevenue}>
                        {formatCurrency(item.totalRevenue)}
                      </Text>
                      <View style={styles.barberMiniSplit}>
                        <Text style={styles.miniSplitText}>
                          EF: {formatCurrency(item.cashRevenue)}
                        </Text>
                        <Text style={styles.miniSplitText}>
                          TR: {formatCurrency(item.transferRevenue)}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight
                      size={18}
                      color={theme.textSecondary}
                      style={{ marginLeft: 4 }}
                    />
                  </Pressable>
                ),
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingBottom: 130,
    },
    header: {
      marginTop: Platform.OS === 'ios' ? 60 : 30,
      paddingHorizontal: 20,
      marginBottom: 20,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    headerTextGroup: {
      alignItems: 'center',
    },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 3,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 24,
      fontWeight: '900',
    },

    // Filtros
    filterContainer: {
      marginBottom: 25,
    },
    filterHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    filterLabelGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    filterHeaderText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    rangeTabs: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    rangeTab: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    rangeTabActive: {
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderColor: theme.primary,
    },
    rangeTabText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    rangeTabTextActive: {
      color: theme.primary,
    },
    periodNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 20,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    periodNavBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
    },
    periodNavLabel: {
      flex: 1,
      textAlign: 'center',
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'capitalize',
    },

    // Main Content
    mainContent: {
      paddingHorizontal: 20,
    },
    heroCard: {
      backgroundColor: theme.card,
      borderRadius: 28,
      padding: 24,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.2),
      marginBottom: 15,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 5,
    },
    heroHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 15,
    },
    heroPeriod: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      gap: 6,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.primary,
    },
    liveText: {
      color: theme.textPrimary,
      fontSize: 9,
      fontWeight: '900',
    },
    heroValue: {
      color: theme.textPrimary,
      fontSize: 38,
      fontWeight: '900',
      marginBottom: 20,
      textAlign: 'center',
    },
    heroFooter: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 15,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 15,
    },
    heroMetric: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    heroMetricText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      opacity: 0.8,
    },
    heroDivider: {
      width: 1,
      height: 15,
      backgroundColor: theme.border,
    },

    // Payment Row
    paymentRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 30,
    },
    paymentCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    paymentIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    paymentLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    paymentValue: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
      marginTop: 2,
    },
    paymentSub: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '600',
    },

    // Barber List
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 15,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '900',
    },
    barberList: {
      gap: 10,
    },
    barberRow: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    barberRank: {
      width: 24,
      height: 24,
      borderRadius: 8,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    rankText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    barberInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    barberNameText: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    barberSubText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    barberStats: {
      alignItems: 'flex-end',
      flexShrink: 0,
      marginLeft: 10,
    },
    barberRevenue: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '900',
    },
    barberMiniSplit: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
    },
    miniSplitText: {
      color: theme.textMuted,
      fontSize: 9,
      fontWeight: '700',
    },

    // Loader & Error
    loaderContainer: {
      marginTop: 80,
      alignItems: 'center',
    },
    loaderText: {
      color: theme.textMuted,
      marginTop: 15,
      fontWeight: '600',
    },
    errorContainer: {
      padding: 20,
      backgroundColor: hexToRgba('#ff0000', 0.05),
      margin: 20,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: hexToRgba('#ff0000', 0.2),
    },
    errorText: {
      color: theme.mode === 'light' ? '#C53333' : '#ff9191',
      textAlign: 'center',
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default OwnerMetricsScreen;
