import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Banknote,
  Clock3,
  Pencil,
  Save,
  ArrowDown,
  ArrowUp,
  GripVertical,
  Trash2,
  X,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  ServiceOption,
  createService,
  deleteService,
  fetchServices,
  reorderServices,
  updateService,
} from '../services/api';

type Props = {
  navigation: any;
};

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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function ServiceSettingsScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const servicesRef = useRef<ServiceOption[]>([]);
  const dragYRef = useRef<Record<string, number>>({});
  const orderDirtyRef = useRef(false);

  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState('');
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [highlightForm, setHighlightForm] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [name, setName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [price, setPrice] = useState('');
  const [commission, setCommission] = useState('');

  useEffect(() => {
    servicesRef.current = services;
  }, [services]);

  const resetForm = () => {
    setEditingServiceId(null);
    setHighlightForm(false);
    setName('');
    setDurationMinutes('30');
    setPrice('');
    setCommission('');
  };

  const loadServices = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError('');
      const response = await fetchServices();
      setServices(response?.services ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudieron cargar los servicios');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadServices(false);
    }, [loadServices]),
  );

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const parsedDuration = Number(durationMinutes);
    const parsedPrice = Number(price || '0');

    if (!trimmedName) {
      Alert.alert('Falta el nombre', 'Escribí cómo se llama el servicio.');
      return;
    }

    if (!Number.isFinite(parsedDuration) || parsedDuration < 10) {
      Alert.alert(
        'Duración inválida',
        'La duración tiene que ser de al menos 10 minutos.',
      );
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      Alert.alert('Precio inválido', 'El precio no puede ser negativo.');
      return;
    }

    // Vacío = sin comisión propia (hereda la del profesional).
    const trimmedCommission = commission.trim();
    const parsedCommission =
      trimmedCommission === ''
        ? null
        : Math.max(0, Math.min(100, Number(trimmedCommission) || 0));

    try {
      setSaving(true);
      if (editingServiceId) {
        await updateService(editingServiceId, {
          name: trimmedName,
          durationMinutes: parsedDuration,
          price: parsedPrice,
          commissionPercent: parsedCommission,
        });
      } else {
        await createService({
          name: trimmedName,
          durationMinutes: parsedDuration,
          price: parsedPrice,
          commissionPercent: parsedCommission,
        });
      }
      resetForm();
      await loadServices(true);
    } catch (err: any) {
      Alert.alert('No se pudo guardar', err?.message ?? 'Revisá los datos.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (service: ServiceOption) => {
    setEditingServiceId(service._id);
    setHighlightForm(true);
    setName(service.name ?? '');
    setDurationMinutes(String(service.durationMinutes ?? 30));
    setPrice(
      service.price != null && Number(service.price) > 0
        ? String(service.price)
        : '',
    );
    setCommission(
      service.commissionPercent != null
        ? String(service.commissionPercent)
        : '',
    );
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const persistServiceOrder = useCallback(
    async (nextServices: ServiceOption[]) => {
      try {
        setSavingOrder(true);
        const response = await reorderServices(nextServices.map(service => service._id));
        setServices(response?.services ?? nextServices);
      } catch (err: any) {
        Alert.alert(
          'No se pudo guardar el orden',
          err?.message ?? 'Recargamos los servicios para evitar inconsistencias.',
        );
        await loadServices(true);
      } finally {
        setSavingOrder(false);
      }
    },
    [loadServices],
  );

  const moveServiceLocally = useCallback((serviceId: string, direction: -1 | 1) => {
      const current = servicesRef.current;
      const index = current.findIndex(service => service._id === serviceId);
      const targetIndex = index + direction;

      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return false;

      const nextServices = [...current];
      const [moved] = nextServices.splice(index, 1);
      nextServices.splice(targetIndex, 0, moved);
      servicesRef.current = nextServices;
      setServices(nextServices);
      return true;
    }, []);

  const moveService = useCallback(
    async (serviceId: string, direction: -1 | 1) => {
      if (!moveServiceLocally(serviceId, direction)) return;
      await persistServiceOrder(servicesRef.current);
    },
    [moveServiceLocally, persistServiceOrder],
  );

  const handleDragMove = useCallback(
    (serviceId: string, pageY: number) => {
      if (!reorderMode || savingOrder) return;

      const lastY = dragYRef.current[serviceId] || pageY;
      const delta = pageY - lastY;

      if (Math.abs(delta) < 58) return;

      const moved = moveServiceLocally(serviceId, delta > 0 ? 1 : -1);
      if (moved) {
        dragYRef.current[serviceId] = pageY;
        orderDirtyRef.current = true;
      }
    },
    [moveServiceLocally, reorderMode, savingOrder],
  );

  const handleDragRelease = useCallback(async () => {
    if (!orderDirtyRef.current) return;
    orderDirtyRef.current = false;
    await persistServiceOrder(servicesRef.current);
  }, [persistServiceOrder]);

  const handleStartReorder = useCallback(
    (serviceId: string, pageY?: number) => {
      setReorderMode(true);
      dragYRef.current[serviceId] = pageY || 0;
    },
    [],
  );

  const handleDelete = (service: ServiceOption) => {
    Alert.alert(
      'Eliminar servicio',
      `Vas a sacar "${service.name}" del listado de servicios.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteService(service._id);
              if (editingServiceId === service._id) resetForm();
              await loadServices(true);
            } catch (err: any) {
              Alert.alert(
                'No se pudo eliminar',
                err?.message ?? 'Intentá de nuevo.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadServices(true);
            }}
            tintColor={theme.primary}
          />
        }
      >
        <View style={styles.headerRow}>
       
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Servicios</Text>
            <Text style={styles.subtitle}>
              Cargá, editá o sacá los servicios que ofrece tu local.
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.formCard,
            editingServiceId && highlightForm && styles.formCardEditing,
          ]}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingServiceId ? 'Editar servicio' : 'Nuevo servicio'}
            </Text>
            {editingServiceId ? (
              <Pressable style={styles.secondaryMiniBtn} onPress={resetForm}>
                <X size={14} color="#B5BBC8" />
                <Text style={styles.secondaryMiniBtnText}>Cancelar</Text>
              </Pressable>
            ) : null}
          </View>

          {editingServiceId ? (
            <View style={styles.editingBanner}>
              <Text style={styles.editingBannerText}>
                Estás editando este servicio. Guardá o cancelá para volver a crear uno nuevo.
              </Text>
            </View>
          ) : null}

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              placeholder="Carga tu servicio"
              placeholderTextColor="#555"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.twoColumns}>
            <View style={[styles.fieldBlock, styles.fieldHalf]}>
              <Text style={styles.label}>Duración (min)</Text>
              <TextInput
                style={styles.input}
                placeholder="30"
                placeholderTextColor="#555"
                keyboardType="numeric"
                value={durationMinutes}
                onChangeText={setDurationMinutes}
              />
            </View>

            <View style={[styles.fieldBlock, styles.fieldHalf]}>
              <Text style={styles.label}>Precio</Text>
              <TextInput
                style={styles.input}
                placeholder="15000"
                placeholderTextColor="#555"
                keyboardType="numeric"
                value={price}
                onChangeText={setPrice}
              />
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Comisión de este servicio (%)</Text>
            <TextInput
              style={styles.input}
              placeholder="Opcional — vacío usa la comisión del profesional"
              placeholderTextColor="#555"
              keyboardType="numeric"
              value={commission}
              onChangeText={setCommission}
            />
          </View>

          <Pressable
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
          >
            <Save size={16} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {saving
                ? 'Guardando...'
                : editingServiceId
                  ? 'Guardar cambios'
                  : 'Agregar servicio'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionLabel}>Servicios cargados</Text>
            <Text style={styles.sectionHint}>
              Mantené apretada una tarjeta para ordenar.
            </Text>
          </View>
          <View style={styles.sectionCountWrap}>
            {savingOrder ? (
              <Text style={styles.savingOrderText}>Guardando orden...</Text>
            ) : null}
            <Text style={styles.sectionCount}>{services.length}</Text>
            {reorderMode ? (
              <Pressable style={styles.doneReorderButton} onPress={() => setReorderMode(false)}>
                <Text style={styles.doneReorderText}>Listo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={theme.textSecondary} />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : services.length ? (
          services.map((service, index) => (
            <Pressable
              key={service._id}
              style={[
                styles.serviceCard,
                reorderMode && styles.serviceCardReorder,
                editingServiceId === service._id && styles.serviceCardEditing,
              ]}
              delayLongPress={260}
              onStartShouldSetResponder={() => reorderMode}
              onMoveShouldSetResponder={() => reorderMode}
              onResponderGrant={event => {
                dragYRef.current[service._id] = event.nativeEvent.pageY;
              }}
              onResponderMove={event => {
                handleDragMove(service._id, event.nativeEvent.pageY);
              }}
              onResponderRelease={handleDragRelease}
              onPressIn={event => {
                if (reorderMode) {
                  dragYRef.current[service._id] = event.nativeEvent.pageY;
                }
              }}
              onLongPress={event => handleStartReorder(service._id, event.nativeEvent.pageY)}
            >
              <View style={styles.serviceTopRow}>
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaChip}>
                      <Clock3 size={12} color="#9DA6B8" />
                      <Text style={styles.metaText}>
                        {service.durationMinutes} min
                      </Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Banknote size={12} color={theme.textSecondary} />
                      <Text style={[styles.metaText, { color: theme.primary }]}>
                        {formatCurrency(Number(service.price || 0))}
                      </Text>
                    </View>
                  </View>
                </View>
                {reorderMode ? (
                  <View style={styles.reorderControls}>
                    <Pressable
                      style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                      disabled={index === 0 || savingOrder}
                      onPress={() => moveService(service._id, -1)}
                    >
                      <ArrowUp size={14} color={index === 0 ? '#687181' : theme.textPrimary} />
                    </Pressable>
                    <GripVertical size={18} color={theme.textMuted} />
                    <Pressable
                      style={[
                        styles.reorderButton,
                        index === services.length - 1 && styles.reorderButtonDisabled,
                      ]}
                      disabled={index === services.length - 1 || savingOrder}
                      onPress={() => moveService(service._id, 1)}
                    >
                      <ArrowDown
                        size={14}
                        color={index === services.length - 1 ? '#687181' : theme.textPrimary}
                      />
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionBtn, styles.editBtn]}
                  onPress={() => handleEdit(service)}
                >
                  <Pencil size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Editar</Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDelete(service)}
                >
                  <Trash2 size={14} color="#FFB4B4" />
                  <Text style={styles.deleteBtnText}>Eliminar</Text>
                </Pressable>
              </View>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Todavía no cargaste servicios</Text>
            <Text style={styles.emptyText}>
              Sumá tus servicios desde acá y después van a aparecer en la reserva.
            </Text>
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
      paddingTop: Platform.OS === 'ios' ? 70 : 28,
      paddingHorizontal: 20,
      paddingBottom: 130,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      marginBottom: 18,
    },
    
    title: {
      color: theme.textPrimary,
      fontSize: 31,
      fontWeight: '800',
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 14,
      marginTop: 6,
      lineHeight: 20,
    },
    formCard: {
      backgroundColor: theme.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginBottom: 18,
    },
    formCardEditing: {
      borderColor: theme.primary,
      shadowColor: theme.primary,
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 3,
    },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    formTitle: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: '800',
    },
    editingBanner: {
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.32),
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    editingBannerText: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    secondaryMiniBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    secondaryMiniBtnText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    fieldBlock: {
      marginBottom: 12,
    },
    fieldHalf: {
      flex: 1,
      marginBottom: 0,
    },
    twoColumns: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    label: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      marginBottom: 8,
      marginLeft: 4,
    },
    input: {
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.textPrimary,
      paddingHorizontal: 14,
      fontSize: 14,
    },
    primaryButton: {
      height: 50,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: theme.textOnPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      gap: 12,
    },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    sectionCount: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '800',
    },
    sectionHint: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 3,
    },
    sectionCountWrap: {
      alignItems: 'flex-end',
      gap: 4,
    },
    savingOrderText: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    doneReorderButton: {
      minHeight: 30,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneReorderText: {
      color: theme.textOnPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    loaderWrap: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorCard: {
      backgroundColor: '#1A1111',
      borderWidth: 1,
      borderColor: '#3A1E1E',
      borderRadius: 18,
      padding: 16,
    },
    errorText: {
      color: '#FF8080',
      fontSize: 13,
    },
    serviceCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 12,
    },
    serviceCardReorder: {
      borderColor: hexToRgba(theme.primary, 0.38),
    },
    serviceCardEditing: {
      borderColor: theme.primary,
    },
    serviceTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    serviceIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: hexToRgba(theme.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    orderBadge: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: hexToRgba(theme.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    orderBadgeText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    serviceName: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    metaRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
      flexWrap: 'wrap',
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    metaText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    reorderControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 4,
    },
    reorderButton: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reorderButtonDisabled: {
      opacity: 0.45,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
    },
    editBtn: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
    },
    deleteBtn: {
      backgroundColor: 'rgba(255, 96, 96, 0.08)',
      borderColor: 'rgba(255, 96, 96, 0.18)',
    },
    actionBtnText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    deleteBtnText: {
      color: '#FFB4B4',
      fontSize: 13,
      fontWeight: '800',
    },
    emptyCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
      alignItems: 'center',
    },
    emptyTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 8,
    },
  });

export default ServiceSettingsScreen;
