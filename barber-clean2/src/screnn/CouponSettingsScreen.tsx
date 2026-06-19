import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchServices,
  getCurrentUser,
  updatePaymentSettings,
  type BookingCouponSettings,
  type ServiceOption,
} from '../services/api';
import { saveUserProfile } from '../services/authStorage';
import { useTheme } from '../context/ThemeContext';

const createEmptyCoupon = (): BookingCouponSettings => ({
  code: '',
  name: '',
  discountType: 'percent',
  discountValue: 10,
  serviceIds: [],
  isActive: true,
});

function normalizeCouponCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
}

function normalizeBookingCoupons(value: any): BookingCouponSettings[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    code: normalizeCouponCode(String(item?.code ?? '')),
    name: String(item?.name ?? '').trim(),
    discountType: item?.discountType === 'fixed' ? 'fixed' : 'percent',
    discountValue: Math.max(0, Number(item?.discountValue || 0)),
    serviceIds: Array.isArray(item?.serviceIds)
      ? Array.from(new Set(item.serviceIds.map(String).filter(Boolean)))
      : [],
    isActive: item?.isActive !== false,
  }));
}

function formatPrice(value: number) {
  return `$${Math.max(0, Number(value || 0)).toLocaleString('es-AR')}`;
}

export default function CouponSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [coupons, setCoupons] = useState<BookingCouponSettings[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [userResponse, servicesResponse] = await Promise.all([
        getCurrentUser(),
        fetchServices().catch(() => ({ services: [] })),
      ]);
      setCoupons(
        normalizeBookingCoupons(userResponse.user?.paymentSettings?.bookingCoupons),
      );
      setServices(servicesResponse?.services ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos cargar los cupones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const updateCoupon = (
    index: number,
    updates: Partial<BookingCouponSettings>,
  ) => {
    setCoupons(current =>
      current.map((coupon, couponIndex) =>
        couponIndex === index ? { ...coupon, ...updates } : coupon,
      ),
    );
  };

  const addCoupon = () => {
    setCoupons(current => [...current, createEmptyCoupon()]);
    setExpandedIndex(coupons.length);
  };

  const removeCoupon = (index: number) => {
    Alert.alert('Eliminar cupón', '¿Querés eliminar este cupón?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          setCoupons(current =>
            current.filter((_, couponIndex) => couponIndex !== index),
          );
          setExpandedIndex(null);
        },
      },
    ]);
  };

  const toggleCouponService = (index: number, serviceId: string) => {
    setCoupons(current =>
      current.map((coupon, couponIndex) => {
        if (couponIndex !== index) return coupon;
        const allServiceIds = services.map(service => service._id);
        const currentIds = coupon.serviceIds.length
          ? coupon.serviceIds
          : allServiceIds;
        const hasService = currentIds.includes(serviceId);
        const nextIds = hasService
          ? currentIds.filter(id => id !== serviceId)
          : [...currentIds, serviceId];

        return {
          ...coupon,
          serviceIds:
            nextIds.length === allServiceIds.length
              ? []
              : Array.from(new Set(nextIds)),
        };
      }),
    );
  };

  const calculateDiscountedPrice = (
    price: number,
    coupon: BookingCouponSettings,
  ) => {
    const basePrice = Math.max(0, Number(price || 0));
    const value = Math.max(0, Number(coupon.discountValue || 0));
    const discount =
      coupon.discountType === 'fixed'
        ? value
        : basePrice * (Math.min(value, 100) / 100);
    return Math.max(0, Math.round(basePrice - Math.min(basePrice, discount)));
  };

  const validateCoupons = () => {
    const cleanCoupons = coupons
      .map(coupon => ({
        ...coupon,
        code: normalizeCouponCode(coupon.code),
        name: coupon.name.trim(),
        discountValue: Number(coupon.discountValue),
        serviceIds: Array.from(
          new Set(coupon.serviceIds.map(String).filter(Boolean)),
        ),
      }))
      .filter(coupon => coupon.code || coupon.name || coupon.discountValue > 0);

    const seenCodes = new Set<string>();
    for (const coupon of cleanCoupons) {
      if (!coupon.code) {
        Alert.alert('Cupón incompleto', 'Cada cupón necesita un código.');
        return null;
      }
      if (seenCodes.has(coupon.code)) {
        Alert.alert('Cupón repetido', `El código ${coupon.code} está repetido.`);
        return null;
      }
      seenCodes.add(coupon.code);
      if (!Number.isFinite(coupon.discountValue) || coupon.discountValue <= 0) {
        Alert.alert('Descuento inválido', `Revisá el descuento de ${coupon.code}.`);
        return null;
      }
      if (coupon.discountType === 'percent' && coupon.discountValue > 100) {
        Alert.alert('Descuento inválido', 'El porcentaje no puede superar 100%.');
        return null;
      }
    }

    return cleanCoupons.map(coupon => ({
      ...coupon,
      name: coupon.name || coupon.code,
    }));
  };

  const handleSave = async () => {
    const cleanCoupons = validateCoupons();
    if (!cleanCoupons) return;

    try {
      setSaving(true);
      setError('');
      const response = await updatePaymentSettings({
        bookingCoupons: cleanCoupons,
      });
      await saveUserProfile(response.user);
      setCoupons(normalizeBookingCoupons(response.user?.paymentSettings?.bookingCoupons));
      setExpandedIndex(null);
      Alert.alert('Listo', 'Cupones guardados.');
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos guardar los cupones.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Cupones</Text>
        <Text style={styles.subtitle}>
          Códigos de descuento para clientes en la web de turnos.
        </Text>
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.topActions}>
        <Pressable style={styles.addButton} onPress={addCoupon}>
          <Text style={styles.addButtonText}>+ Crear cupón</Text>
        </Pressable>
      </View>

      {coupons.length ? (
        <View style={styles.couponList}>
          {coupons.map((coupon, index) => {
            const isExpanded = expandedIndex === index;
            const serviceIds =
              coupon.serviceIds.length || !services.length
                ? coupon.serviceIds
                : services.map(service => service._id);
            const selectedServices = services.filter(service =>
              serviceIds.includes(service._id),
            );
            const appliesToAll =
              !coupon.serviceIds.length || selectedServices.length === services.length;
            const discountLabel =
              coupon.discountType === 'fixed'
                ? `${formatPrice(coupon.discountValue)} de descuento`
                : `${coupon.discountValue || 0}% de descuento`;
            const previewServices = appliesToAll ? services : selectedServices;

            return (
              <View key={`coupon-${index}`} style={styles.couponCard}>
                <Pressable
                  style={styles.couponSummary}
                  onPress={() => setExpandedIndex(isExpanded ? null : index)}
                >
                  <View style={styles.couponSummaryMain}>
                    <Text style={styles.couponCode}>
                      {coupon.code || 'Cupón sin código'}
                    </Text>
                    <Text style={styles.couponMeta}>
                      {discountLabel} · {appliesToAll ? 'Todos los servicios' : `${selectedServices.length} servicio(s)`}
                    </Text>
                    {!!coupon.name && (
                      <Text style={styles.couponName}>{coupon.name}</Text>
                    )}
                  </View>
                  <View style={styles.summaryRight}>
                    <Text
                      style={[
                        styles.statusPill,
                        coupon.isActive ? styles.statusPillActive : styles.statusPillOff,
                      ]}
                    >
                      {coupon.isActive ? 'Activo' : 'Pausado'}
                    </Text>
                    <Text style={styles.expandText}>
                      {isExpanded ? 'Cerrar' : 'Editar'}
                    </Text>
                  </View>
                </Pressable>

                {isExpanded ? (
                  <View style={styles.couponBody}>
                    <View style={styles.switchRow}>
                      <View>
                        <Text style={styles.blockLabel}>Estado</Text>
                        <Text style={styles.helpText}>
                          Si está pausado no aparece como válido en la web.
                        </Text>
                      </View>
                      <Switch
                        value={coupon.isActive}
                        onValueChange={value => updateCoupon(index, { isActive: value })}
                        trackColor={{ false: '#323640', true: theme.primary + '66' }}
                        thumbColor={coupon.isActive ? theme.primary : '#F4F4F5'}
                      />
                    </View>

                    <TextInput
                      style={styles.input}
                      placeholder="Código: EJ PROMO20"
                      placeholderTextColor={theme.placeholder}
                      value={coupon.code}
                      autoCapitalize="characters"
                      onChangeText={value =>
                        updateCoupon(index, { code: normalizeCouponCode(value) })
                      }
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Nombre interno"
                      placeholderTextColor={theme.placeholder}
                      value={coupon.name}
                      onChangeText={value => updateCoupon(index, { name: value })}
                    />

                    <Text style={styles.blockLabel}>Tipo de descuento</Text>
                    <View style={styles.segmentRow}>
                      <SegmentButton
                        label="Porcentaje %"
                        active={coupon.discountType === 'percent'}
                        onPress={() => updateCoupon(index, { discountType: 'percent' })}
                        theme={theme}
                        styles={styles}
                      />
                      <SegmentButton
                        label="Monto fijo"
                        active={coupon.discountType === 'fixed'}
                        onPress={() => updateCoupon(index, { discountType: 'fixed' })}
                        theme={theme}
                        styles={styles}
                      />
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder={coupon.discountType === 'fixed' ? 'Monto' : 'Porcentaje'}
                      placeholderTextColor={theme.placeholder}
                      keyboardType="numeric"
                      value={String(coupon.discountValue || '')}
                      onChangeText={value =>
                        updateCoupon(index, {
                          discountValue:
                            Number(value.replace(/[^0-9.]/g, '')) || 0,
                        })
                      }
                    />

                    <View style={styles.servicesHeaderRow}>
                      <View>
                        <Text style={styles.blockLabel}>Servicios donde aplica</Text>
                        <Text style={styles.helpText}>
                          Tocá cada servicio para activar o quitar el descuento.
                        </Text>
                      </View>
                      <Pressable
                        style={styles.allServicesButton}
                        onPress={() => updateCoupon(index, { serviceIds: [] })}
                      >
                        <Text style={styles.allServicesButtonText}>Todos</Text>
                      </Pressable>
                    </View>

                    <View style={styles.serviceList}>
                      {services.map(service => {
                        const selected = appliesToAll || coupon.serviceIds.includes(service._id);
                        const finalPrice = selected
                          ? calculateDiscountedPrice(Number(service.price || 0), coupon)
                          : Number(service.price || 0);
                        return (
                          <Pressable
                            key={service._id}
                            style={[
                              styles.serviceRow,
                              selected ? styles.serviceRowActive : styles.serviceRowOff,
                            ]}
                            onPress={() => toggleCouponService(index, service._id)}
                          >
                            <View
                              style={[
                                styles.serviceStateIcon,
                                selected
                                  ? styles.serviceStateIconActive
                                  : styles.serviceStateIconOff,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.serviceStateIconText,
                                  selected
                                    ? styles.serviceStateIconTextActive
                                    : styles.serviceStateIconTextOff,
                                ]}
                              >
                                {selected ? '✓' : ''}
                              </Text>
                            </View>
                            <View style={styles.serviceRowBody}>
                              <Text style={styles.serviceName}>{service.name}</Text>
                              <Text style={styles.servicePriceLine}>
                                {selected
                                  ? `${formatPrice(Number(service.price || 0))} → ${formatPrice(finalPrice)}`
                                  : `${formatPrice(Number(service.price || 0))} sin descuento`}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={styles.previewBox}>
                      <Text style={styles.previewTitle}>Resumen del descuento</Text>
                      {previewServices.length ? (
                        previewServices.map(service => (
                          <Text key={service._id} style={styles.previewText}>
                            {service.name}: {formatPrice(Number(service.price || 0))} → {formatPrice(calculateDiscountedPrice(Number(service.price || 0), coupon))}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.helpText}>
                          No hay servicios seleccionados para este cupón.
                        </Text>
                      )}
                    </View>

                    <Pressable
                      style={styles.removeButton}
                      onPress={() => removeCoupon(index)}
                    >
                      <Text style={styles.removeButtonText}>Eliminar cupón</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Todavía no hay cupones</Text>
          <Text style={styles.emptyText}>
            Creá un código para que el cliente lo ingrese en la web y vea el precio con descuento.
          </Text>
        </View>
      )}

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Guardando...' : 'Guardar cupones'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SegmentButton({ label, active, onPress, theme, styles }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.segmentButton,
        active && { backgroundColor: theme.primary + '22', borderColor: theme.primary },
      ]}
    >
      <Text style={[styles.segmentButtonText, active && { color: theme.primary }]}>
        {label}
      </Text>
    </Pressable>
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
    subtitle: { color: theme.textSecondary, fontSize: 14, marginTop: 6 },
    errorText: {
      color: theme.mode === 'light' ? '#C53333' : '#FF8D8D',
      fontSize: 13,
      marginBottom: 12,
    },
    topActions: { marginBottom: 16 },
    addButton: {
      borderRadius: 18,
      backgroundColor: theme.primary,
      paddingVertical: 15,
      alignItems: 'center',
    },
    addButtonText: {
      color: theme.textOnPrimary,
      fontSize: 15,
      fontWeight: '900',
    },
    couponList: { gap: 14 },
    couponCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      overflow: 'hidden',
    },
    couponSummary: {
      gap: 12,
      padding: 16,
    },
    couponSummaryMain: { gap: 4 },
    couponCode: { color: theme.textPrimary, fontSize: 17, fontWeight: '900' },
    couponMeta: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    couponName: { color: theme.textMuted, fontSize: 12 },
    summaryRight: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
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
    expandText: { color: theme.primary, fontSize: 12, fontWeight: '900' },
    couponBody: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
      padding: 14,
      gap: 12,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    blockLabel: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginBottom: 8,
    },
    helpText: { color: theme.textMuted, fontSize: 12, lineHeight: 17, maxWidth: 200 },
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
    segmentRow: { flexDirection: 'row', gap: 8 },
    segmentButton: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentButtonText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
    servicesHeaderRow: {
      gap: 10,
      marginTop: 4,
    },
    allServicesButton: {
      alignSelf: 'flex-start',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.primary + '18',
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    allServicesButtonText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    serviceList: { gap: 8 },
    serviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      padding: 12,
    },
    serviceRowActive: {
      borderColor: theme.primary + '66',
      backgroundColor: theme.primary + '12',
    },
    serviceRowOff: {
      borderColor: '#fff',
      backgroundColor: '#fff',
    },
    serviceStateIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    serviceStateIconActive: {
      borderColor: 'rgba(22, 163, 74, 0.42)',
      backgroundColor: 'rgba(22, 163, 74, 0.14)',
    },
    serviceStateIconOff: {
      borderColor: '#000',
      backgroundColor: '#fff',
    },
    serviceStateIconText: { fontSize: 18, fontWeight: '900' },
    serviceStateIconTextActive: {
      color: theme.mode === 'light' ? '#15803D' : '#86EFAC',
    },
    serviceStateIconTextOff: {
      color: theme.mode === 'light' ? '#ffff' : '#ffff',
    },
    serviceRowBody: { flex: 1, gap: 3 },
    serviceName: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '900',
      flexShrink: 1,
    },
    servicePriceLine: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    previewBox: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      padding: 12,
      gap: 6,
    },
    previewTitle: { color: theme.textPrimary, fontSize: 13, fontWeight: '900' },
    previewText: { color: theme.textSecondary, fontSize: 12, lineHeight: 17 },
    removeButton: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.35)',
      backgroundColor: 'rgba(239, 68, 68, 0.10)',
      paddingVertical: 12,
      alignItems: 'center',
    },
    removeButtonText: {
      color: theme.mode === 'light' ? '#fff' : '#fff',
      fontSize: 12,
      fontWeight: '900',
    },
    emptyCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 18,
      marginBottom: 18,
    },
    emptyTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: '900' },
    emptyText: { color: theme.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
    saveButton: {
      height: 56,
      borderRadius: 18,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: {
      color: theme.textOnPrimary,
      fontSize: 16,
      fontWeight: '900',
    },
  });
