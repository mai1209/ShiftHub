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
  fetchAppointmentMetrics,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  TrendingUp,
  Users,
  Wallet,
  Calendar,
  CreditCard,
  Banknote,
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

const MONTH_LABELS = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
];

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
          <Icon size={18} color={theme.primary} strokeWidth={2.5} />
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
            color={theme.primary}
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
  const now = useMemo(() => new Date(), []);

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState<AppointmentMetricsResponse | null>(
    null,
  );

  const loadMetrics = useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) setLoading(true);
        setError('');
        const response = await fetchAppointmentMetrics({
          barberId,
          year: now.getFullYear(),
          month: selectedMonth,
          annual,
        });
        setMetrics(response);
      } catch (err: any) {
        setError(err?.message ?? 'No se pudieron cargar las métricas');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [annual, barberId, now, selectedMonth],
  );

  useFocusEffect(
    useCallback(() => {
      loadMetrics(false);
    }, [loadMetrics]),
  );

  const periodLabel =
    metrics?.period.label ||
    (annual
      ? `Año ${now.getFullYear()}`
      : `${MONTH_LABELS[selectedMonth - 1]} ${now.getFullYear()}`);

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
              <Calendar size={16} color={theme.primary} />
              <Text style={styles.filterTitle}>Seleccionar Periodo</Text>
            </View>
            <Pressable
              style={[styles.annualToggle, annual && styles.annualToggleActive]}
              onPress={() => setAnnual(prev => !prev)}
            >
              <Text
                style={[
                  styles.annualToggleText,
                  annual && styles.annualToggleTextActive,
                ]}
              >
                ANUAL
              </Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.monthStrip}
          >
            {MONTH_LABELS.map((label, index) => {
              const monthNumber = index + 1;
              const selected = !annual && selectedMonth === monthNumber;

              return (
                <Pressable
                  key={label}
                  style={[styles.monthCard, selected && styles.monthCardActive]}
                  onPress={() => {
                    setAnnual(false);
                    setSelectedMonth(monthNumber);
                  }}
                >
                  <Text
                    style={[
                      styles.monthLabel,
                      selected && styles.monthLabelActive,
                    ]}
                  >
                    {label}
                  </Text>
                  <View
                    style={[
                      styles.monthIndicator,
                      selected && styles.monthIndicatorActive,
                    ]}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
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
      paddingBottom: 80,
    },
    header: {
      marginTop: Platform.OS === 'ios' ? 60 : 30,
      paddingHorizontal: 20,
      marginBottom: 10,
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
    annualToggle: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    annualToggleActive: {
      borderColor: theme.primary,
      backgroundColor: hexToRgba(theme.primary, 0.1),
    },
    annualToggleText: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
    },
    annualToggleTextActive: {
      color: theme.primary,
    },
    monthStrip: {
      paddingHorizontal: 20,
      gap: 10,
    },
    monthCard: {
      width: 60,
      height: 50,
      borderRadius: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthCardActive: {
      borderColor: theme.primary,
      backgroundColor: hexToRgba(theme.primary, 0.05),
    },
    monthLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    monthLabelActive: {
      color: theme.primary,
    },
    monthIndicator: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'transparent',
      marginTop: 4,
    },
    monthIndicatorActive: {
      backgroundColor: theme.primary,
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
