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
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  AppointmentMetricsResponse,
  getCurrentUser,
  fetchAppointmentMetrics,
} from '../services/api';
import { hasProPlanAccess } from '../services/planAccess';
import LockedFeatureScreen from '../components/LockedFeatureScreen';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  TrendingUp,
  Users,
  Wallet,
  Calendar,
  CreditCard,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Store,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

type Props = {
  navigation: any;
  route: {
    params?: {
      barberId?: string;
      barberName?: string;
    };
  };
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

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  styles,
  theme,
  isFullWidth = false,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: any;
  styles: any;
  theme: Theme;
  isFullWidth?: boolean;
}) {
  return (
    <View style={[styles.metricCard, isFullWidth && styles.fullWidthCard]}>
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <Icon size={18} color={theme.textSecondary} strokeWidth={2.5} />
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, isFullWidth && styles.largeValue]}>
        {value}
      </Text>
      {helper ? (
        <View style={styles.helperContainer}>
          <TrendingUp
            size={12}
            color={theme.textSecondary}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.metricHelper}>{helper}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MetricsScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const barberId = route.params?.barberId;
  const barberName = route.params?.barberName ?? 'Mi Rendimiento';
  const [rangeMode, setRangeMode] = useState<RangeMode>('monthly');
  const [refDate, setRefDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState<AppointmentMetricsResponse | null>(
    null,
  );
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

  const loadMetrics = useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) setLoading(true);
        setError('');
        const currentUser = await getCurrentUser();
        const canUseFeature = hasProPlanAccess(currentUser?.user);
        setHasAccess(canUseFeature);
        if (!canUseFeature) return;
        const response = await fetchAppointmentMetrics({
          barberId,
          ...buildRangeParams(),
        });
        setMetrics(response);
      } catch (err: any) {
        setError(err?.message ?? 'No se pudieron cargar las métricas');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [barberId, buildRangeParams],
  );

  useFocusEffect(
    useCallback(() => {
      loadMetrics(false);
    }, [loadMetrics]),
  );

  if (hasAccess === false) {
    return (
      <LockedFeatureScreen
        theme={theme}
        navigation={navigation}
        title="Métricas bloqueadas"
        body="Las métricas del profesional están disponibles con plan Pro."
      />
    );
  }

  const periodLabel = metrics?.period.label || toYmd(refDate);

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
              loadMetrics(true);
            }}
            tintColor={theme.primary}
          />
        }
      >
        {/* Header Pro */}
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>ESTADÍSTICAS</Text>
          <Text style={styles.headerTitle}>{barberName}</Text>
        </View>

        {/* Selector de Periodo */}
        <View style={styles.filterSection}>
          <View style={styles.filterHeader}>
            <View style={styles.filterTitleGroup}>
              <Calendar size={16} color={theme.textSecondary} />
              <Text style={styles.filterTitle}>Seleccionar Periodo</Text>
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
            <Pressable
              style={styles.periodNavBtn}
              onPress={() => shiftPeriod(-1)}
            >
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
            <Text style={styles.loaderText}>Calculando tus ingresos...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.resultsSection}>
            <View style={styles.periodIndicator}>
              <Text style={styles.periodIndicatorText}>
                Resumen {periodLabel}
              </Text>
            </View>

            <View style={styles.grid}>
              <MetricCard
                label="Facturación Total"
                value={formatCurrency(metrics?.totals.totalRevenue ?? 0)}
                helper="Ingreso bruto"
                icon={Wallet}
                theme={theme}
                styles={styles}
                isFullWidth
              />

              <MetricCard
                label="Turnos"
                value={String(metrics?.totals.appointmentsCount ?? 0)}
                helper="Completados"
                icon={Users}
                theme={theme}
                styles={styles}
              />

              <MetricCard
                label="Efectivo"
                value={formatCurrency(metrics?.totals.cashRevenue ?? 0)}
                helper={`${metrics?.totals.cashCount ?? 0} cobros`}
                icon={Banknote}
                theme={theme}
                styles={styles}
              />

              <MetricCard
                label="Transferencias"
                value={formatCurrency(metrics?.totals.transferRevenue ?? 0)}
                helper={`${metrics?.totals.transferCount ?? 0} cobros`}
                icon={CreditCard}
                theme={theme}
                styles={styles}
                isFullWidth
              />

              {(metrics?.totals.commission ?? 0) > 0 ? (
                <>
                  <MetricCard
                    label="Tu comisión"
                    value={formatCurrency(metrics?.totals.commission ?? 0)}
                    helper="Lo que te llevás"
                    icon={Users}
                    theme={theme}
                    styles={styles}
                  />
                  <MetricCard
                    label="Queda al local"
                    value={formatCurrency(metrics?.totals.localRevenue ?? 0)}
                    helper="Después de comisión"
                    icon={Store}
                    theme={theme}
                    styles={styles}
                  />
                </>
              ) : null}
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
      paddingBottom: 120,
    },
    header: {
      marginTop: Platform.OS === 'ios' ? 60 : 30,
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 3,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 22,
      fontWeight: '900',
      marginTop: 2,
    },

    // Filtros
    filterSection: {
      marginBottom: 25,
    },
    filterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 15,
    },
    filterTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    filterTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
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

    // Resultados
    resultsSection: {
      paddingHorizontal: 20,
    },
    periodIndicator: {
      alignItems: 'center',
      marginBottom: 20,
    },
    periodIndicatorText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 15,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 12,
    },
    metricCard: {
      width: (width - 52) / 2,
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
    },
    fullWidthCard: {
      width: '100%',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 15,
      gap: 10,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    metricLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    metricValue: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '900',
    },
    largeValue: {
      fontSize: 32,
      color: theme.primary,
    },
    helperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
    },
    metricHelper: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },

    // Otros
    loaderContainer: {
      marginTop: 100,
      alignItems: 'center',
    },
    loaderText: {
      color: theme.textMuted,
      marginTop: 15,
      fontWeight: '600',
    },
    errorBox: {
      marginTop: 40,
      backgroundColor: hexToRgba('#ff0000', 0.05),
      borderRadius: 20,
      borderWidth: 1,
      borderColor: hexToRgba('#ff0000', 0.2),
      padding: 20,
    },
    errorText: {
      color: theme.mode === 'light' ? '#C53333' : '#FF9191',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
  });

export default MetricsScreen;
