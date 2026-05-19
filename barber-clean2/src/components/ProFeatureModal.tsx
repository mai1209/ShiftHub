import React, { useMemo } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Theme } from '../context/ThemeContext';

type Variant =
  | 'metrics'
  | 'history'
  | 'barber-metrics'
  | 'barber-limit'
  | 'basic-feature';

type Props = {
  visible: boolean;
  variant: Variant;
  theme: Theme;
  onClose: () => void;
  onOpenPlan: () => void;
};

const COPY: Record<
  Variant,
  { title: string; body: string; cta: string }
> = {
  metrics: {
    title: 'Desbloqueá las métricas del negocio',
    body:
      'Con el plan Pro ves rendimiento mensual, ingresos, servicios más pedidos y evolución de turnos en una vista completa.',
    cta: 'Ver plan Pro',
  },
  history: {
    title: 'Desbloqueá el historial completo',
    body:
      'Con Pro accedés al historial de clientes, servicios y caja para revisar mejor cada movimiento del local.',
    cta: 'Ver plan Pro',
  },
  'barber-metrics': {
    title: 'Desbloqueá las métricas del barbero',
    body:
      'Con el plan Pro podés ver el rendimiento individual de cada barbero con paneles y comparativas dedicadas.',
    cta: 'Ver plan Pro',
  },
  'barber-limit': {
    title: 'Sumá más profesionales',
    body:
      'El plan gratis permite 1 profesional activo. Actualizá el plan para cargar más integrantes del equipo.',
    cta: 'Ver planes',
  },
  'basic-feature': {
    title: 'Actualizá para desbloquear esta opción',
    body:
      'Esta configuración está disponible desde el plan Básico. Podés seguir usando la app gratis con funciones limitadas.',
    cta: 'Ver planes',
  },
};

function hexToRgba(hex: string, alpha: number) {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(
    sanitized.length === 3 ? sanitized.repeat(2) : sanitized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ProFeatureModal({
  visible,
  variant,
  theme,
  onClose,
  onOpenPlan,
}: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = COPY[variant];
  const isIOS = Platform.OS === 'ios';
  const ctaLabel = isIOS ? 'Gestionar plan' : copy.cta;
  const titleText = copy.title;
  const bodyText = copy.body;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.previewWrap}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderLeft}>
                <Image source={theme.logo} style={styles.previewBrand} resizeMode="contain" />
                <View style={styles.previewTitleBlock}>
                  <View style={styles.previewPill} />
                  <View style={styles.previewTitleLine} />
                </View>
              </View>
              <View style={styles.previewCircle} />
            </View>

            <View style={styles.previewHeroPanel}>
              <View style={styles.previewHeroBadge} />
              <View style={styles.previewHeroTitle} />
              <View style={styles.previewHeroSubtitle} />
            </View>

            {variant === 'history' ? (
              <View style={styles.previewList}>
                {[0, 1, 2].map(item => (
                  <View key={item} style={styles.previewRow}>
                    <View style={styles.previewAvatar} />
                    <View style={styles.previewRowContent}>
                      <View style={styles.previewShortLine} />
                      <View style={styles.previewLongLine} />
                    </View>
                    <View style={styles.previewTag} />
                  </View>
                ))}
              </View>
            ) : (
              <>
                <View style={styles.previewMetricRow}>
                  {[0, 1, 2].map(item => (
                    <View key={item} style={styles.previewMetricCard}>
                      <View style={styles.previewMetricValue} />
                      <View style={styles.previewMetricLabel} />
                    </View>
                  ))}
                </View>
                <View style={styles.previewChart}>
                  <View style={[styles.bar, { height: 38 }]} />
                  <View style={[styles.bar, { height: 62 }]} />
                  <View style={[styles.bar, { height: 94 }]} />
                  <View style={[styles.bar, { height: 70 }]} />
                  <View style={[styles.bar, { height: 108 }]} />
                </View>
              </>
            )}

            <View style={styles.previewLock}>
              <Text style={styles.previewLockText}>Vista bloqueada</Text>
            </View>
          </View>

          <Text style={styles.title}>{titleText}</Text>
          <Text style={styles.body}>{bodyText}</Text>

          <View style={styles.actions}>
            {!isIOS ? (
              <Pressable style={styles.secondaryBtn} onPress={onClose}>
                <Text style={styles.secondaryBtnText}>Ahora no</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.primaryBtn} onPress={onOpenPlan}>
              <Text style={styles.primaryBtnText}>{ctaLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(4,5,8,0.82)',
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    sheet: {
      borderRadius: 28,
      overflow: 'hidden',
      backgroundColor: '#111317',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      padding: 18,
    },
    previewWrap: {
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
      padding: 16,
      marginBottom: 18,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    previewHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    previewBrand: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    previewTitleBlock: {
      gap: 8,
    },
    previewPill: {
      width: 88,
      height: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.07)',
    },
    previewTitleLine: {
      width: 148,
      height: 16,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    previewCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: hexToRgba(theme.primary, 0.18),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.3),
    },
    previewHeroPanel: {
      borderRadius: 22,
      padding: 16,
      marginBottom: 14,
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.18),
    },
    previewHeroBadge: {
      width: 74,
      height: 12,
      borderRadius: 999,
      backgroundColor: hexToRgba(theme.primary, 0.2),
      marginBottom: 12,
    },
    previewHeroTitle: {
      width: '68%',
      height: 22,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.16)',
      marginBottom: 10,
    },
    previewHeroSubtitle: {
      width: '86%',
      height: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    previewMetricRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    previewMetricCard: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.05)',
      padding: 12,
      gap: 10,
    },
    previewMetricValue: {
      width: '70%',
      height: 20,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
    previewMetricLabel: {
      width: '90%',
      height: 11,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    previewChart: {
      height: 130,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.04)',
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 14,
    },
    bar: {
      width: 24,
      borderRadius: 10,
      backgroundColor: hexToRgba(theme.primary, 0.28),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.4),
    },
    previewList: {
      gap: 10,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.05)',
      padding: 12,
      gap: 10,
    },
    previewAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    previewRowContent: {
      flex: 1,
      gap: 8,
    },
    previewShortLine: {
      width: '45%',
      height: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    previewLongLine: {
      width: '75%',
      height: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    previewTag: {
      width: 58,
      height: 26,
      borderRadius: 999,
      backgroundColor: hexToRgba(theme.primary, 0.18),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.32),
    },
    previewLock: {
      position: 'absolute',
      right: 14,
      bottom: 14,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: 'rgba(10, 10, 14, 0.76)',
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.32),
    },
    previewLockText: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    title: {
      color: theme.textPrimary,
      fontSize: 24,
      fontWeight: '900',
      lineHeight: 28,
    },
    body: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 10,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },
    secondaryBtn: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryBtnText: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    primaryBtn: {
      flex: 1.15,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
    },
    primaryBtnText: {
      color: theme.textOnPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
  });
}
