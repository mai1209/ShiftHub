import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  CashEntry,
  CashSummaryResponse,
  createCashEntry,
  updateCashEntry,
  deleteCashEntry,
  fetchCashEntries,
  fetchCashSummary,
  updateAppointmentStatus,
  deleteAppointment,
  createAppointment,
  fetchBarbers,
  fetchServices,
  type Barber,
  type ServiceOption,
  type PaymentMethod,
} from '../services/api';
import { getUserProfile } from '../services/authStorage';
import { hasProPlanAccess } from '../services/planAccess';
import { exportCajaExcel, exportCajaPDF } from '../services/exportCaja';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TrendingUp,
  Store,
  Banknote,
  X,
} from 'lucide-react-native';

type Props = {
  navigation: any;
  route?: { params?: { openService?: boolean } };
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

const INCOME_COLOR = '#16a34a';
const EXPENSE_COLOR = '#ef4444';

const EXPENSE_CATEGORIES = [
  'Alquiler',
  'Sueldos',
  'Insumos',
  'Productos',
  'Servicios',
  'Otro',
];
const INCOME_CATEGORIES = ['Producto', 'Propina', 'Otro'];

function CajaScreen({ navigation, route }: Props) {
  const { theme, businessCopy } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [rangeMode, setRangeMode] = useState<RangeMode>('monthly');
  const [refDate, setRefDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<CashSummaryResponse | null>(null);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [exporting, setExporting] = useState(false);
  const [shopName, setShopName] = useState('');

  const doExport = async (kind: 'excel' | 'pdf') => {
    if (!summary) return;
    try {
      setExporting(true);
      if (kind === 'excel') await exportCajaExcel(summary, entries, shopName);
      else await exportCajaPDF(summary, entries, shopName);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  };

  // Formulario de carga
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<'income' | 'expense'>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modo del formulario: movimiento común o registrar un servicio de un
  // profesional (turno olvidado) que suma a las métricas del negocio y del
  // profesional, pero al ser walkIn NO ocupa un horario en la agenda.
  const [formMode, setFormMode] = useState<'movement' | 'service'>('movement');
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [svcBarberId, setSvcBarberId] = useState('');
  const [svcServiceId, setSvcServiceId] = useState('');
  const [svcPriceInput, setSvcPriceInput] = useState('');
  const [svcMethod, setSvcMethod] = useState<PaymentMethod>('cash');
  const [svcCustomer, setSvcCustomer] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [b, s] = await Promise.all([fetchBarbers(), fetchServices()]);
        if (!mounted) return;
        setBarbers(b.barbers || []);
        setServiceOptions(
          (s.services || []).filter(opt => opt.isActive !== false),
        );
      } catch {
        // si falla, el modo "servicio" simplemente no tendrá opciones
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const buildRangeParams = useCallback(() => {
    if (rangeMode === 'daily') return { range: 'daily' as const, date: toYmd(refDate) };
    if (rangeMode === 'weekly') return { range: 'weekly' as const, date: toYmd(refDate) };
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
        const params = buildRangeParams();
        const [summaryRes, entriesRes] = await Promise.all([
          fetchCashSummary(params),
          fetchCashEntries(params),
        ]);
        setSummary(summaryRes);
        setEntries(entriesRes.entries ?? []);
      } catch (err: any) {
        setError(err?.message ?? 'No se pudo cargar la caja');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildRangeParams],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const storedUser = await getUserProfile();
        if (cancelled) return;
        setShopName(
          (storedUser as any)?.fullName ||
            (storedUser as any)?.shopName ||
            '',
        );
        if (!hasProPlanAccess(storedUser)) {
          Alert.alert(
            'Función Pro',
            'La caja está disponible en el plan Pro.',
            [{ text: 'Volver', onPress: () => navigation.goBack() }],
          );
          return;
        }
        loadData(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [loadData, navigation]),
  );

  const periodLabel = summary?.period.label || toYmd(refDate);

  const resetForm = () => {
    setAmountInput('');
    setDescriptionInput('');
    setCategoryInput('');
    setEditingId(null);
    setFormMode('movement');
    setSvcBarberId('');
    setSvcServiceId('');
    setSvcPriceInput('');
    setSvcMethod('cash');
    setSvcCustomer('');
  };

  const handleOpenForm = () => {
    resetForm();
    setFormType('expense');
    setFormOpen(true);
  };

  // "Turno olvidado" desde el + del menú: abre la carga de servicio (walk-in).
  useEffect(() => {
    if (route?.params?.openService) {
      resetForm();
      setFormMode('service');
      setFormOpen(true);
      navigation.setParams?.({ openService: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.openService]);

  const handleEdit = (entry: CashEntry) => {
    setEditingId(entry._id);
    setFormType(entry.type);
    setAmountInput(String(entry.amount));
    setDescriptionInput(entry.description || '');
    setCategoryInput(entry.category || '');
    setFormOpen(true);
  };

  const handleSaveService = async () => {
    const price = Number(svcPriceInput.replace(',', '.'));
    const service = serviceOptions.find(opt => opt._id === svcServiceId);
    if (!svcBarberId) {
      Alert.alert(
        `Falta el ${businessCopy.staffSingular}`,
        `Elegí qué ${businessCopy.staffSingular} hizo el servicio.`,
      );
      return;
    }
    if (!service) {
      Alert.alert('Falta el servicio', 'Elegí el servicio realizado.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un precio mayor a 0.');
      return;
    }
    try {
      setSaving(true);
      // Se registra como un turno YA completado por orden de llegada: suma a las
      // métricas del negocio ("servicios cobrados") y del profesional (con su
      // comisión), pero al ser walkIn NO ocupa un horario en la agenda ni choca
      // con otros turnos.
      const created = await createAppointment({
        barberId: svcBarberId,
        customerName: svcCustomer.trim() || 'Orden de llegada',
        service: service.name,
        servicePrice: price,
        durationMinutes: service.durationMinutes || 30,
        startTime: new Date().toISOString(),
        email: '',
        paymentMethod: svcMethod,
        walkIn: true,
      });
      const apptId = created?.appointment?._id;
      if (apptId) {
        await updateAppointmentStatus(apptId, 'completed', {
          paymentMethodCollected: svcMethod,
          paymentStatus: 'paid',
          amountPaid: price,
        });
      }
      resetForm();
      setFormOpen(false);
      await loadData(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo registrar el servicio.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (formMode === 'service') {
      await handleSaveService();
      return;
    }
    const amount = Number(amountInput.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un monto mayor a 0.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        type: formType,
        amount,
        description: descriptionInput.trim(),
        category: categoryInput.trim() || undefined,
      };
      if (editingId) {
        await updateCashEntry(editingId, payload);
      } else {
        await createCashEntry(payload);
      }
      resetForm();
      setFormOpen(false);
      await loadData(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo guardar el movimiento.');
    } finally {
      setSaving(false);
    }
  };

  const methodLabel = (method: string | null) => {
    if (method === 'cash') return 'Efectivo';
    if (method === 'transfer') return 'Transferencia';
    if (method === 'mixed') return 'Mixto';
    return 'Cobrado';
  };

  const undoService = (id: string, name: string) => {
    Alert.alert(
      'Deshacer cobro',
      `El turno de ${name} vuelve a "pendiente" y se descuenta de la caja. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deshacer',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateAppointmentStatus(id, 'pending');
              await loadData(true);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'No se pudo deshacer el cobro.');
            }
          },
        },
      ],
    );
  };

  const removeService = (id: string, name: string) => {
    Alert.alert(
      'Eliminar turno',
      `Se elimina definitivamente el turno de ${name}. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAppointment(id);
              await loadData(true);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'No se pudo eliminar el turno.');
            }
          },
        },
      ],
    );
  };

  const handleDelete = (entry: CashEntry) => {
    Alert.alert(
      'Borrar movimiento',
      `¿Borrar "${entry.description || (entry.type === 'income' ? 'Ingreso' : 'Egreso')}" por ${formatCurrency(entry.amount)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCashEntry(entry._id);
              await loadData(true);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'No se pudo borrar.');
            }
          },
        },
      ],
    );
  };

  // Listas siempre con lo último cargado primero (fecha desc, desempate por _id
  // que en Mongo es creciente con el tiempo de creación).
  const byDateDesc = <T extends { date: string; _id: string }>(list: T[]) =>
    [...list].sort((a, b) => {
      const t = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (t !== 0) return t;
      return a._id > b._id ? -1 : a._id < b._id ? 1 : 0;
    });
  const incomeEntries = byDateDesc(entries.filter(e => e.type === 'income'));
  const expenseEntries = byDateDesc(entries.filter(e => e.type === 'expense'));
  const sortedServices = [...(summary?.services ?? [])].sort((a, b) => {
    const t =
      new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime();
    if (t !== 0) return t;
    return a._id > b._id ? -1 : a._id < b._id ? 1 : 0;
  });

  const renderEntryRow = (entry: CashEntry) => {
    const isIncome = entry.type === 'income';
    const color = isIncome ? INCOME_COLOR : EXPENSE_COLOR;
    return (
      <View key={entry._id} style={styles.entryRow}>
        <View style={styles.entryInfo}>
          <Text style={styles.entryDesc}>
            {entry.description || (isIncome ? 'Venta' : 'Egreso')}
          </Text>
          <View style={styles.entryMetaRow}>
            <Text style={styles.entryDate}>
              {new Date(entry.date).toLocaleDateString('es-AR')}
            </Text>
            {entry.category ? (
              <View style={styles.entryCategoryBadge}>
                <Text style={styles.entryCategoryText}>{entry.category}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={[styles.entryAmount, { color }]}>
          {isIncome ? '+' : '−'} {formatCurrency(entry.amount)}
        </Text>
        <Pressable style={styles.entryEdit} onPress={() => handleEdit(entry)}>
          <Pencil size={15} color={theme.textSecondary} />
        </Pressable>
        <Pressable
          style={styles.entryDelete}
          onPress={() => handleDelete(entry)}
        >
          <Trash2 size={16} color={EXPENSE_COLOR} />
        </Pressable>
      </View>
    );
  };

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
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={theme.textPrimary} />
          </Pressable>
          <View>
            <Text style={styles.headerSubtitle}>CAJA DEL LOCAL</Text>
            <Text style={styles.headerTitle}>Ingresos y egresos</Text>
          </View>
        </View>

        {/* Selector de periodo */}
        <View style={styles.filterSection}>
          <View style={styles.filterHeader}>
            <Calendar size={14} color={theme.textSecondary} />
            <Text style={styles.filterTitle}>Periodo</Text>
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

          <View style={styles.exportRow}>
            <Pressable
              style={[
                styles.exportBtn,
                (!summary || exporting) && styles.exportBtnDisabled,
              ]}
              onPress={() => doExport('excel')}
              disabled={!summary || exporting}
            >
              <Download size={15} color={theme.textSecondary} />
              <Text style={styles.exportBtnText}>Excel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.exportBtn,
                (!summary || exporting) && styles.exportBtnDisabled,
              ]}
              onPress={() => doExport('pdf')}
              disabled={!summary || exporting}
            >
              <Download size={15} color={theme.textSecondary} />
              <Text style={styles.exportBtnText}>PDF</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={theme.textSecondary} />
            <Text style={styles.loaderText}>Calculando la caja...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            {/* Ganancia destacada */}
            <View style={styles.profitCard}>
              <Text style={styles.profitLabel}>GANANCIA DEL LOCAL</Text>
              <Text style={styles.profitValue}>
                {formatCurrency(summary?.profit ?? 0)}
              </Text>
              <Text style={styles.profitHint}>
                Ingresos − egresos − comisiones
              </Text>
            </View>

            {/* Desglose */}
            <View style={styles.breakdownGrid}>
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>Servicios cobrados</Text>
                <Text style={styles.breakdownValue}>
                  {formatCurrency(summary?.serviceIncome ?? 0)}
                </Text>
              </View>
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>Ventas de productos</Text>
                <Text style={styles.breakdownValue}>
                  {formatCurrency(summary?.manualIncome ?? 0)}
                </Text>
              </View>
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>Comisiones profesionales</Text>
                <Text style={[styles.breakdownValue, { color: EXPENSE_COLOR }]}>
                  − {formatCurrency(summary?.commissions ?? 0)}
                </Text>
              </View>
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>Egresos</Text>
                <Text style={[styles.breakdownValue, { color: EXPENSE_COLOR }]}>
                  − {formatCurrency(summary?.expenses ?? 0)}
                </Text>
              </View>
            </View>

            {/* Botón + cargar movimiento */}
            <Pressable style={styles.addBtn} onPress={handleOpenForm}>
              <View style={styles.addBtnPlus}>
                <Plus size={18} color="#fff" />
              </View>
              <Text style={styles.addBtnText}>Cargar movimiento</Text>
            </Pressable>

            <Modal
              visible={formOpen}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setFormOpen(false);
                resetForm();
              }}
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => {
                  if (!saving) {
                    setFormOpen(false);
                    resetForm();
                  }
                }}
              >
                <Pressable style={styles.modalCard} onPress={() => {}}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {editingId
                        ? 'Editar movimiento'
                        : formMode === 'service'
                        ? 'Registrar servicio'
                        : 'Nuevo movimiento'}
                    </Text>
                    <Pressable
                      style={styles.modalClose}
                      onPress={() => {
                        setFormOpen(false);
                        resetForm();
                      }}
                    >
                      <X size={18} color={theme.textSecondary} />
                    </Pressable>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {!editingId && (
                      <View style={styles.typeToggle}>
                        <Pressable
                          style={[
                            styles.typeOption,
                            formMode === 'movement' && {
                              backgroundColor: hexToRgba(theme.primary, 0.15),
                              borderColor: theme.primary,
                            },
                          ]}
                          onPress={() => setFormMode('movement')}
                        >
                          <Text style={styles.typeOptionText}>Movimiento</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.typeOption,
                            formMode === 'service' && {
                              backgroundColor: hexToRgba(theme.primary, 0.15),
                              borderColor: theme.primary,
                            },
                          ]}
                          onPress={() => setFormMode('service')}
                        >
                          <Text style={styles.typeOptionText}>Servicio</Text>
                        </Pressable>
                      </View>
                    )}

                    {formMode === 'movement' && (
                      <>
                    <View style={styles.typeToggle}>
                  <Pressable
                    style={[
                      styles.typeOption,
                      formType === 'income' && {
                        backgroundColor: hexToRgba(INCOME_COLOR, 0.15),
                        borderColor: INCOME_COLOR,
                      },
                    ]}
                    onPress={() => setFormType('income')}
                  >
                    <Banknote size={16} color={INCOME_COLOR} />
                    <Text style={styles.typeOptionText}>Ingreso</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.typeOption,
                      formType === 'expense' && {
                        backgroundColor: hexToRgba(EXPENSE_COLOR, 0.15),
                        borderColor: EXPENSE_COLOR,
                      },
                    ]}
                    onPress={() => setFormType('expense')}
                  >
                    <TrendingUp size={16} color={EXPENSE_COLOR} />
                    <Text style={styles.typeOptionText}>Egreso</Text>
                  </Pressable>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Monto"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="numeric"
                  value={amountInput}
                  onChangeText={setAmountInput}
                />
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="Descripción (ej. alquiler, shampoo)"
                  placeholderTextColor={theme.placeholder}
                  value={descriptionInput}
                  onChangeText={setDescriptionInput}
                />

                <Text style={styles.categoryLabel}>Categoría</Text>
                <View style={styles.categoryChips}>
                  {(formType === 'expense'
                    ? EXPENSE_CATEGORIES
                    : INCOME_CATEGORIES
                  ).map(cat => {
                    const active = categoryInput === cat;
                    return (
                      <Pressable
                        key={cat}
                        style={[
                          styles.categoryChip,
                          active && styles.categoryChipActive,
                        ]}
                        onPress={() =>
                          setCategoryInput(active ? '' : cat)
                        }
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            active && styles.categoryChipTextActive,
                          ]}
                        >
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                      </>
                    )}

                    {formMode === 'service' && (
                      <>
                        <Text style={styles.categoryLabel}>
                          {businessCopy.staffSingularCapitalized}
                        </Text>
                        <View style={styles.categoryChips}>
                          {barbers.map(b => {
                            const active = svcBarberId === b._id;
                            return (
                              <Pressable
                                key={b._id}
                                style={[
                                  styles.categoryChip,
                                  active && styles.categoryChipActive,
                                ]}
                                onPress={() => setSvcBarberId(b._id)}
                              >
                                <Text
                                  style={[
                                    styles.categoryChipText,
                                    active && styles.categoryChipTextActive,
                                  ]}
                                >
                                  {b.fullName}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Text style={styles.categoryLabel}>Servicio</Text>
                        <View style={styles.categoryChips}>
                          {serviceOptions.map(s => {
                            const active = svcServiceId === s._id;
                            return (
                              <Pressable
                                key={s._id}
                                style={[
                                  styles.categoryChip,
                                  active && styles.categoryChipActive,
                                ]}
                                onPress={() => {
                                  setSvcServiceId(s._id);
                                  setSvcPriceInput(
                                    s.price != null ? String(s.price) : '',
                                  );
                                }}
                              >
                                <Text
                                  style={[
                                    styles.categoryChipText,
                                    active && styles.categoryChipTextActive,
                                  ]}
                                >
                                  {s.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <TextInput
                          style={[styles.input, { marginTop: 10 }]}
                          placeholder="Precio"
                          placeholderTextColor={theme.placeholder}
                          keyboardType="numeric"
                          value={svcPriceInput}
                          onChangeText={setSvcPriceInput}
                        />
                        <TextInput
                          style={[styles.input, { marginTop: 10 }]}
                          placeholder="Cliente (opcional)"
                          placeholderTextColor={theme.placeholder}
                          value={svcCustomer}
                          onChangeText={setSvcCustomer}
                        />

                        <Text style={styles.categoryLabel}>Cobrado con</Text>
                        <View style={styles.typeToggle}>
                          <Pressable
                            style={[
                              styles.typeOption,
                              svcMethod === 'cash' && {
                                backgroundColor: hexToRgba(INCOME_COLOR, 0.15),
                                borderColor: INCOME_COLOR,
                              },
                            ]}
                            onPress={() => setSvcMethod('cash')}
                          >
                            <Text style={styles.typeOptionText}>Efectivo</Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.typeOption,
                              svcMethod === 'transfer' && {
                                backgroundColor: hexToRgba(INCOME_COLOR, 0.15),
                                borderColor: INCOME_COLOR,
                              },
                            ]}
                            onPress={() => setSvcMethod('transfer')}
                          >
                            <Text style={styles.typeOptionText}>
                              Transferencia
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    )}

                    <Pressable
                      style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      <Text style={styles.saveBtnText}>
                        {saving
                          ? 'Guardando...'
                          : editingId
                          ? 'Guardar cambios'
                          : formMode === 'service'
                          ? 'Registrar servicio'
                          : 'Guardar movimiento'}
                      </Text>
                    </Pressable>
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>

            {/* Servicios cobrados */}
            {summary?.services && summary.services.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Servicios cobrados</Text>
                  <Banknote size={16} color={theme.textSecondary} />
                </View>
                <View style={styles.entriesList}>
                  {sortedServices.map(svc => (
                    <View key={svc._id} style={styles.entryRow}>
                      <View style={styles.entryInfo}>
                        <Text style={styles.entryDesc}>
                          {svc.customerName || 'Cliente'}
                        </Text>
                        <Text style={styles.entryDate}>
                          {svc.service || 'Servicio'} · {methodLabel(svc.method)}
                        </Text>
                      </View>
                      <Text style={[styles.entryAmount, { color: INCOME_COLOR }]}>
                        {formatCurrency(svc.amount)}
                      </Text>
                      <View style={styles.serviceActions}>
                        <Pressable
                          hitSlop={8}
                          style={styles.serviceActionBtn}
                          onPress={() =>
                            undoService(svc._id, svc.customerName || 'Cliente')
                          }
                        >
                          <RotateCcw size={16} color={theme.textMuted} />
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          style={styles.serviceActionBtn}
                          onPress={() =>
                            removeService(svc._id, svc.customerName || 'Cliente')
                          }
                        >
                          <Trash2 size={16} color={EXPENSE_COLOR} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Ventas (ingresos cargados a mano: productos, propinas, etc.) */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ventas</Text>
              <TrendingUp size={16} color={theme.textSecondary} />
            </View>
            {incomeEntries.length === 0 ? (
              <Text style={styles.emptyText}>
                No hay ventas cargadas en este período.
              </Text>
            ) : (
              <View style={styles.entriesList}>
                {incomeEntries.map(renderEntryRow)}
              </View>
            )}

            {/* Egresos (gastos del período) */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Egresos</Text>
              <Store size={16} color={theme.textSecondary} />
            </View>
            {expenseEntries.length === 0 ? (
              <Text style={styles.emptyText}>
                No hay egresos cargados en este período.
              </Text>
            ) : (
              <View style={styles.entriesList}>
                {expenseEntries.map(renderEntryRow)}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: 140 },
    header: {
      marginTop: Platform.OS === 'ios' ? 60 : 30,
      paddingHorizontal: 20,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
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
    filterSection: { paddingHorizontal: 20, marginBottom: 18 },
    filterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    filterTitle: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    rangeTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
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
    rangeTabText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
    rangeTabTextActive: { color: theme.primary },
    periodNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    exportRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    exportBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    exportBtnDisabled: { opacity: 0.5 },
    exportBtnText: { color: theme.primary, fontSize: 13, fontWeight: '800' },
    loaderContainer: { alignItems: 'center', paddingTop: 50, gap: 12 },
    loaderText: { color: theme.textMuted },
    errorBox: {
      marginHorizontal: 20,
      padding: 16,
      borderRadius: 14,
      backgroundColor: hexToRgba(EXPENSE_COLOR, 0.1),
    },
    errorText: { color: EXPENSE_COLOR, textAlign: 'center' },
    profitCard: {
      marginHorizontal: 20,
      marginBottom: 16,
      padding: 22,
      borderRadius: 22,
      backgroundColor: hexToRgba(theme.primary, 0.1),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.25),
      alignItems: 'center',
    },
    profitLabel: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
    },
    profitValue: {
      color: theme.textPrimary,
      fontSize: 34,
      fontWeight: '900',
      marginTop: 6,
    },
    profitHint: { color: theme.textMuted, fontSize: 12, marginTop: 4 },
    breakdownGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    breakdownCard: {
      flexBasis: '47%',
      flexGrow: 1,
      padding: 14,
      borderRadius: 16,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    breakdownLabel: { color: theme.textMuted, fontSize: 12 },
    breakdownValue: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: '800',
      marginTop: 4,
    },
    addBtn: {
      marginHorizontal: 20,
      marginBottom: 14,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    addBtnPlus: {
      width: 26,
      height: 26,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    modalCard: {
      maxHeight: '82%',
      padding: 18,
      borderRadius: 22,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    modalTitle: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: '800',
    },
    modalClose: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
    },
    formCard: {
      marginHorizontal: 20,
      marginBottom: 16,
      padding: 16,
      borderRadius: 18,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    typeToggle: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    typeOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    typeOptionText: { color: theme.textPrimary, fontWeight: '700' },
    input: {
      height: 48,
      borderRadius: 12,
      paddingHorizontal: 14,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.textPrimary,
    },
    saveBtn: {
      marginTop: 14,
      height: 46,
      borderRadius: 12,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 10,
      marginTop: 4,
    },
    sectionTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: '800' },
    emptyText: {
      color: theme.textMuted,
      textAlign: 'center',
      paddingHorizontal: 20,
      marginTop: 10,
    },
    categoryList: { paddingHorizontal: 20, gap: 8, marginBottom: 8 },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    categoryRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    categoryDot: { width: 8, height: 8, borderRadius: 4 },
    categoryRowName: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    categoryRowType: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    categoryRowTotal: { fontSize: 14, fontWeight: '800' },
    entriesList: { paddingHorizontal: 20, gap: 10 },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    entryInfo: { flex: 1 },
    entryDesc: { color: theme.textPrimary, fontSize: 14, fontWeight: '600' },
    entryMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    entryDate: { color: theme.textMuted, fontSize: 12 },
    entryCategoryBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: hexToRgba(theme.primary, 0.12),
    },
    entryCategoryText: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    categoryLabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 12,
      marginBottom: 8,
    },
    categoryChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    categoryChipActive: {
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderColor: theme.primary,
    },
    categoryChipText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    categoryChipTextActive: { color: theme.primary, fontWeight: '700' },
    entryAmount: { fontSize: 15, fontWeight: '800' },
    serviceActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    serviceActionBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
    },
    entryEdit: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(theme.primary, 0.1),
    },
    entryDelete: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(EXPENSE_COLOR, 0.1),
    },
  });

export default CajaScreen;
