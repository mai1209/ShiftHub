import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { getPlanPricing } from '../services/api';
import {
  BASIC_PLAN_URL,
  PRO_PLAN_URL,
  CUSTOM_PLAN_URL,
} from '../utils/publicLinks';

const DEFAULT_PRICING = {
  basic: { ars: 25000, usdReference: 25 },
  pro: { ars: 35000, usdReference: 35 },
};

type PlanCard = {
  key: 'basic' | 'pro' | 'custom';
  badge: string;
  title: string;
  accent: string;
  price: string;
  billingLabel: string;
  idealFor: string;
  features: readonly string[];
  cta: string;
  url: string;
};

const PLANS: PlanCard[] = [
  {
    key: 'basic',
    badge: 'Básico',
    title: 'Todo lo necesario para vender turnos online',
    accent: '#39E01F',
    price: 'USD 25',
    billingLabel: 'por mes',
    idealFor: 'Ideal para negocios que quieren ordenar la agenda y cobrar online sin complejidad.',
    features: [
      'Personalización de colores y logo',
      'Link personalizado',
      'Vinculación con Mercado Pago',
      'Carga infinita de profesionales',
      'Carga infinita de servicios',
      'Turnos ilimitados',
      'Vinculación con WhatsApp para cancelación de turnos',
      'Confirmación y recordatorio de turno vía mail',
      'Notificación y recordatorio de turnos vía app para el profesional',
    ],
    cta: 'Conocer plan básico',
    url: BASIC_PLAN_URL,
  },
  {
    key: 'pro',
    badge: 'Pro',
    title: 'Métricas, historial y control más profundo',
    accent: '#1F9D36',
    price: 'USD 35',
    billingLabel: 'por mes',
    idealFor: 'Ideal para equipos que ya trabajan con volumen y quieren medir mejor el negocio.',
    features: [
      'Todo lo del plan Básico',
      'Métricas generales e individuales',
      'Métricas mensuales y anuales',
      'Historial de servicios, turnos y caja',
      'Exportación por mail, PDF y Excel',
    ],
    cta: 'Conocer plan pro',
    url: PRO_PLAN_URL,
  },
  {
    key: 'custom',
    badge: 'Personalizable',
    title: 'Marca propia y solución hecha a medida',
    accent: '#F3A63B',
    price: 'A medida',
    billingLabel: 'consultar por WhatsApp',
    idealFor: 'Ideal para negocios o cadenas que buscan identidad propia y un desarrollo más premium.',
    features: [
      'Todo lo del plan Pro',
      'Personalización completa de la web',
      'Dominio propio',
      'Descarga en App Store y Play Store con nombre propio',
      'Implementación y presupuesto por fuera del flujo estándar',
    ],
    cta: 'Hablar por un plan a medida',
    url: CUSTOM_PLAN_URL,
  },
];

function PlansScreen({ navigation, route }: any) {
  const { theme, businessCopy } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fromRegistration = Boolean(route?.params?.fromRegistration);
  const registeredEmail = String(route?.params?.email || '').trim().toLowerCase();
  const [pricing, setPricing] = useState(DEFAULT_PRICING);

  useEffect(() => {
    let mounted = true;

    const loadPricing = async () => {
      try {
        const response = await getPlanPricing();
        if (!mounted) return;
        setPricing({
          basic: {
            ars: Number(response.pricing?.basic?.ars || DEFAULT_PRICING.basic.ars),
            usdReference: Number(
              response.pricing?.basic?.usdReference || DEFAULT_PRICING.basic.usdReference,
            ),
          },
          pro: {
            ars: Number(response.pricing?.pro?.ars || DEFAULT_PRICING.pro.ars),
            usdReference: Number(
              response.pricing?.pro?.usdReference || DEFAULT_PRICING.pro.usdReference,
            ),
          },
        });
      } catch {
      }
    };

    loadPricing();
    return () => {
      mounted = false;
    };
  }, []);

  const plans = useMemo(
    () =>
      PLANS.map((plan) => {
        if (plan.key === 'basic') {
          return {
            ...plan,
            price: `ARS ${pricing.basic.ars.toLocaleString('es-AR')}`,
            billingLabel: `por mes · ref. USD ${pricing.basic.usdReference}`,
          };
        }
        if (plan.key === 'pro') {
          return {
            ...plan,
            price: `ARS ${pricing.pro.ars.toLocaleString('es-AR')}`,
            billingLabel: `por mes · ref. USD ${pricing.pro.usdReference}`,
          };
        }
        return plan;
      }),
    [pricing],
  );

  const buildPlanUrl = (url: string) => {
    if (!registeredEmail) return url;

    try {
      const parsed = new URL(url);
      parsed.searchParams.set('email', registeredEmail);
      return parsed.toString();
    } catch {
      return url;
    }
  };

  const handleOpen = async (url: string) => {
    if (Platform.OS === 'ios') {
      navigation.replace('Subscription-Settings');
      return;
    }

    try {
      await Linking.openURL(buildPlanUrl(url));
    } catch (error: any) {
      Alert.alert(
        'No disponible',
        error?.message || 'No se pudo abrir el enlace de este plan.',
      );
    }
  };

  const handlePlanPress = async (plan: PlanCard) => {
    await handleOpen(plan.url);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PLANES</Text>
        <Text style={styles.title}>
          {fromRegistration ? 'Cuenta creada. Elegí cómo querés seguir.' : 'Planes disponibles'}
        </Text>
        <Text style={styles.subtitle}>
          {Platform.OS === 'ios'
            ? `Elegí el plan que mejor acompaña ${businessCopy.yourBusiness}. En este dispositivo vas a ver las opciones disponibles para la cuenta.`
            : `Elegí el plan que mejor acompaña ${businessCopy.yourBusiness}. La contratación y renovación se resuelven por web.`}
        </Text>
      </View>

      {plans.map(plan => (
        <View key={plan.key} style={styles.card}>
          <View style={[styles.badge, { borderColor: plan.accent, backgroundColor: `${plan.accent}20` }]}>
            <Text style={[styles.badgeText, { color: plan.accent }]}>{plan.badge}</Text>
          </View>
          <Text style={styles.cardTitle}>{plan.title}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.priceValue, { color: plan.accent }]}>{plan.price}</Text>
            <Text style={styles.priceLabel}>{plan.billingLabel}</Text>
          </View>
          <Text style={styles.cardDescription}>{plan.idealFor}</Text>
          <View style={styles.featureList}>
            {plan.features.map(feature => (
              <View key={feature} style={styles.featureRow}>
                <View style={[styles.featureDot, { backgroundColor: plan.accent }]} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={[styles.cta, { backgroundColor: plan.accent }]}
            onPress={() => handlePlanPress(plan)}
          >
            <Text style={styles.ctaText}>{plan.cta}</Text>
          </Pressable>
        </View>
      ))}

      <Pressable style={styles.secondaryCta} onPress={() => navigation.replace('Login')}>
        <Text style={styles.secondaryCtaText}>
          {fromRegistration ? 'Ir al login por ahora' : 'Volver'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 32,
      paddingBottom: 48,
      gap: 16,
    },
    header: {
      gap: 10,
      paddingTop: 18,
      paddingBottom: 10,
    },
    eyebrow: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    title: {
      color: theme.textPrimary,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
      gap: 14,
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    cardTitle: {
      color: theme.textPrimary,
      fontSize: 21,
      lineHeight: 26,
      fontWeight: '800',
    },
    cardDescription: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    priceValue: {
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '900',
    },
    priceLabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    featureList: {
      gap: 10,
    },
    featureRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
    },
    featureDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      marginTop: 6,
      flexShrink: 0,
    },
    featureText: {
      flex: 1,
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    cta: {
      borderRadius: 18,
      paddingVertical: 15,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 6,
    },
    ctaText: {
      color: theme.textOnPrimary,
      fontSize: 15,
      fontWeight: '900',
    },
    secondaryCta: {
      marginTop: 4,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryCtaText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
  });

export default PlansScreen;
