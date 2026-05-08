import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  View,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  CurrentMonthOverviewResponse,
  MonthOverviewBarber,
  fetchOwnerMetricsOverview,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  ArrowLeft,
  Calendar,
  Users,
  ChevronRight,
  TrendingUp,
  Banknote,
  CreditCard,
  Store,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

type Props = {
  navigation: any;
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

function OwnerMetricsScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const now = useMemo(() => new Date(), []);

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<CurrentMonthOverviewResponse | null>(null);

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) setLoading(true);
        setError('');
        const response = await fetchOwnerMetricsOverview({
          year: now.getFullYear(),
          month: selectedMonth,
          annual,
        });
        setData(response);
      } catch (err: any) {
        setError(err?.message ?? 'No se pudo cargar el resumen');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [annual, now, selectedMonth],
  );

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [loadData]),
  );

  const periodLabel =
    data?.period.label ||
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
            <View>
              <Image style={styles.headerIcon} source={require('../assets/logo.png')} />
            </View>
          </View>
        </View>

        {/* Filtros de Periodo */}
        <View style={styles.filterContainer}>
          <View style={styles.filterHeader}>
            <View style={styles.filterLabelGroup}>
              <Calendar size={14} color={theme.primary} />
              <Text style={styles.filterHeaderText}>Periodo de análisis</Text>
            </View>
            <Pressable
              style={[styles.annualChip, annual && styles.annualChipActive]}
              onPress={() => setAnnual(prev => !prev)}
            >
              <Text
                style={[
                  styles.annualChipText,
                  annual && styles.annualChipTextActive,
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
              const isSelected = !annual && selectedMonth === monthNumber;
              return (
                <Pressable
                  key={label}
                  style={[styles.monthBox, isSelected && styles.monthBoxActive]}
                  onPress={() => {
                    setAnnual(false);
                    setSelectedMonth(monthNumber);
                  }}
                >
                  <Text
                    style={[
                      styles.monthText,
                      isSelected && styles.monthTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                  {isSelected && <View style={styles.activeIndicator} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
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
                  <TrendingUp size={14} color={theme.primary} />
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
                  <Banknote size={16} color={theme.primary} />
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
                  <CreditCard size={16} color={theme.primary} />
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

            {/* 3. RANKING DE BARBEROS */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Rendimiento por Barbero</Text>
              <LayoutDashboard size={16} color={theme.primary} />
            </View>

            <View style={styles.barberList}>
              {(data?.byBarber ?? []).map(
                (item: MonthOverviewBarber, index: number) => (
                  <View key={item.barberId} style={styles.barberRow}>
                    <View style={styles.barberInfo}>
                      <View style={styles.barberRank}>
                        <Text style={styles.rankText}>{index + 1}</Text>
                      </View>
                      <View>
                        <Text style={styles.barberNameText}>
                          {item.barberName}
                        </Text>
                        <Text style={styles.barberSubText}>
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
                  </View>
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
    headerIcon: {
      width: 20,
      height: 20,
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
    annualChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    annualChipActive: {
      backgroundColor: hexToRgba(theme.primary, 0.1),
      borderColor: theme.primary,
    },
    annualChipText: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
    },
    annualChipTextActive: {
      color: theme.primary,
    },
    monthStrip: {
      paddingHorizontal: 20,
      gap: 12,
    },
    monthBox: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    monthBoxActive: {
      borderColor: theme.primary,
      backgroundColor: hexToRgba(theme.primary, 0.05),
    },
    monthText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
    monthTextActive: {
      color: theme.primary,
    },
    activeIndicator: {
      width: 12,
      height: 2,
      backgroundColor: theme.primary,
      marginTop: 4,
      borderRadius: 1,
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
