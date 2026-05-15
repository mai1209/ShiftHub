import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { ImagePlus, PaintBucket, Sparkles, SwatchBook } from 'lucide-react-native';
import ColorPickerModal from '../components/ColorPickerModal';
import { buildThemeFromConfig, useTheme } from '../context/ThemeContext';
import type { Theme, ThemeMode } from '../context/ThemeContext';
import { getUserProfile, saveUserProfile } from '../services/authStorage';
import { updatePublicProfile, updateThemeConfig } from '../services/api';

const ACCENT_SWATCHES = [
  '#39E01F',
  '#65F239',
  '#1FA83A',
  '#0D9488',
  '#16A34A',
  '#84CC16',
  '#0D9488',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
];

const TEXT_SWATCHES = [
  '#0F172A',
  '#1E293B',
  '#334155',
  '#1F7A1F',
  '#475569',
  '#0F766E',
];

const CARD_SWATCHES = [
  '#FFFFFF',
  '#F8FAFC',
  '#F1F5F9',
  '#F7FFF1',
  '#EEFDE2',
  '#FFF7EA',
  '#FEFCE8',
];

const GRADIENT_PRESETS = [
  {
    label: 'Codex base',
    colors: ['#FFFFFF', '#F7FFF1', '#E6FFC6', '#FFD08A'],
  },
  {
    label: 'Verde comercial',
    colors: ['#F9FFF3', '#EFFFDA', '#CFFF8A', '#FFA85A'],
  },
  {
    label: 'Lila editorial',
    colors: ['#FAF5FF', '#F3E8FF', '#E9D5FF', '#DDD6FE'],
  },
  {
    label: 'Lima energética',
    colors: ['#F8FFF0', '#E7FFD0', '#BFFF69', '#FF8E4D'],
  },
  {
    label: 'Verde suave',
    colors: ['#F0FDF4', '#DCFCE7', '#D1FAE5', '#BBF7D0'],
  },
  {
    label: 'Arena cálida',
    colors: ['#FFFBEB', '#FEF3C7', '#FDE68A', '#FCD34D'],
  },
  {
    label: 'Verde naranja',
    colors: ['#F8FFF4', '#EAFEDD', '#D2F7B8', '#FFC978'],
  },
];

const GRADIENT_SWATCHES = Array.from(
  new Set(GRADIENT_PRESETS.flatMap(preset => preset.colors)),
);

const STYLE_PRESETS = [
  {
    label: 'Codex base',
    helper: 'Vuelve al look original de la app.',
    mode: 'light' as ThemeMode,
    primary: '#39E01F',
    secondary: '#F3A63B',
    card: '#FFFFFF',
    gradientColors: ['#FFFFFF', '#F7FFF1', '#E6FFC6', '#FFD08A'],
  },
  {
    label: 'Lima editorial',
    helper: 'Usa una base clara con acentos verde lima y energía cálida.',
    mode: 'light' as ThemeMode,
    primary: '#39E01F',
    secondary: '#F28C28',
    card: '#FFFFFF',
    gradientColors: ['#F9FFF3', '#EFFFDA', '#CFFF8A', '#FFA85A'],
  },
  {
    label: 'Claro editorial',
    helper: 'Activa fondo claro, paneles blancos y textos oscuros.',
    mode: 'light' as ThemeMode,
    primary: '#111111',
    secondary: '#1F2937',
    card: '#FFFFFF',
    gradientColors: ['#FFFFFF', '#F8FAFC', '#EEF2F7', '#E2E8F0'],
  },
];

const WEB_STYLE_PRESETS = [
  {
    key: 'light' as const,
    label: 'Modo claro',
    helper: 'Deja la web limpia, clara y más comercial.',
  },
  {
    key: 'dark' as const,
    label: 'Modo oscuro',
    helper: 'Usa un claro más sobrio con contraste comercial y limpio.',
  },
  {
    key: 'vintage' as const,
    label: 'Modo vintage',
    helper: 'Usa tonos crema y cobre para una estética clásica.',
  },
];

type WebPreset = (typeof WEB_STYLE_PRESETS)[number]['key'];

type FormState = {
  mode: ThemeMode;
  webPreset: WebPreset;
  primary: string;
  secondary: string;
  card: string;
  gradient0: string;
  gradient1: string;
  gradient2: string;
  gradient3: string;
  logoDataUrl: string | null;
  bannerDataUrl: string | null;
  mobileBannerDataUrl: string | null;
  publicSubtitle: string;
  publicAddress: string;
  publicPhone: string;
  googleMapsUrl: string;
  googleReviewsUrl: string;
  googlePlaceId: string;
};

type PickerField =
  | 'primary'
  | 'secondary'
  | 'card'
  | 'gradient0'
  | 'gradient1'
  | 'gradient2'
  | 'gradient3'
  | null;

function normalizeHexInput(value: string) {
  const cleaned = value.trim().replace(/[^#0-9a-fA-F]/g, '');
  if (!cleaned) return '';
  const prefixed = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
  return prefixed.slice(0, 7).toUpperCase();
}

function isValidHexColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(value.trim().toUpperCase());
}

function buildInitialForm(theme: Theme, profile: any): FormState {
  const customTheme = profile?.themeConfig ?? {};
  const publicProfile = profile?.publicProfile ?? {};
  const gradientColors =
    Array.isArray(customTheme.gradientColors) && customTheme.gradientColors.length === 4
      ? customTheme.gradientColors
      : theme.gradientColors;

    return {
      mode: 'light',
    webPreset:
      customTheme.webPreset === 'vintage' ||
      customTheme.webPreset === 'light' ||
      customTheme.webPreset === 'dark'
        ? customTheme.webPreset
        : 'light',
    primary: customTheme.primary ?? theme.primary,
    secondary: customTheme.secondary ?? theme.secondary,
    card: customTheme.card ?? theme.card,
    gradient0: gradientColors[0] ?? theme.gradientColors[0],
    gradient1: gradientColors[1] ?? theme.gradientColors[1],
    gradient2: gradientColors[2] ?? theme.gradientColors[2],
    gradient3: gradientColors[3] ?? theme.gradientColors[3],
    logoDataUrl: customTheme.logoDataUrl ?? null,
    bannerDataUrl: customTheme.bannerDataUrl ?? null,
    mobileBannerDataUrl: customTheme.mobileBannerDataUrl ?? null,
    publicSubtitle: publicProfile.subtitle ?? '',
    publicAddress: publicProfile.address ?? '',
    publicPhone: publicProfile.phone ?? '',
    googleMapsUrl: publicProfile.googleMapsUrl ?? '',
    googleReviewsUrl: publicProfile.googleReviewsUrl ?? '',
    googlePlaceId: publicProfile.googlePlaceId ?? '',
  };
}

function previewThemeFromForm(form: FormState, fallbackTheme: Theme): Theme {
  return buildThemeFromConfig(fallbackTheme, {
    mode: form.mode,
    primary: isValidHexColor(form.primary) ? form.primary : fallbackTheme.primary,
    secondary: isValidHexColor(form.secondary) ? form.secondary : fallbackTheme.secondary,
    card: isValidHexColor(form.card) ? form.card : fallbackTheme.card,
    gradientColors: [
      isValidHexColor(form.gradient0) ? form.gradient0 : fallbackTheme.gradientColors[0],
      isValidHexColor(form.gradient1) ? form.gradient1 : fallbackTheme.gradientColors[1],
      isValidHexColor(form.gradient2) ? form.gradient2 : fallbackTheme.gradientColors[2],
      isValidHexColor(form.gradient3) ? form.gradient3 : fallbackTheme.gradientColors[3],
    ],
    logoDataUrl: form.logoDataUrl,
  });
}

type ImageField = 'logoDataUrl' | 'bannerDataUrl' | 'mobileBannerDataUrl';

export default function AppearanceSettingsScreen({ navigation }: { navigation: any }) {
  const { theme, applyUserTheme } = useTheme();
  const [form, setForm] = useState<FormState>(() => buildInitialForm(theme, null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pickerField, setPickerField] = useState<PickerField>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const storedUser = await getUserProfile<any>();
      if (isMounted) {
        setForm(buildInitialForm(theme, storedUser));
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [theme]);

  const previewTheme = useMemo(() => previewThemeFromForm(form, theme), [form, theme]);
  const styles = useMemo(() => createStyles(previewTheme), [previewTheme]);
  const pickerConfig = useMemo(() => {
    if (pickerField === 'primary') {
      return {
        title: 'Color de botones y acentos',
        value: form.primary,
        swatches: ACCENT_SWATCHES,
      };
    }
    if (pickerField === 'secondary') {
      return {
        title: 'Color de textos destacados',
        value: form.secondary,
        swatches: TEXT_SWATCHES,
      };
    }
    if (pickerField === 'card') {
      return {
        title: 'Color de tarjetas y paneles',
        value: form.card,
        swatches: CARD_SWATCHES,
      };
    }
    if (pickerField === 'gradient0') {
      return {
        title: 'Fondo 1',
        value: form.gradient0,
        swatches: GRADIENT_SWATCHES,
      };
    }
    if (pickerField === 'gradient1') {
      return {
        title: 'Fondo 2',
        value: form.gradient1,
        swatches: GRADIENT_SWATCHES,
      };
    }
    if (pickerField === 'gradient2') {
      return {
        title: 'Fondo 3',
        value: form.gradient2,
        swatches: GRADIENT_SWATCHES,
      };
    }
    if (pickerField === 'gradient3') {
      return {
        title: 'Fondo 4',
        value: form.gradient3,
        swatches: GRADIENT_SWATCHES,
      };
    }
    return null;
  }, [
    pickerField,
    form.primary,
    form.secondary,
    form.card,
    form.gradient0,
    form.gradient1,
    form.gradient2,
    form.gradient3,
  ]);

  const updateField = (field: keyof FormState, value: string | null) => {
    setForm(current => ({
      ...current,
      [field]:
        typeof value === 'string' &&
        field !== 'logoDataUrl' &&
        field !== 'bannerDataUrl' &&
        field !== 'mobileBannerDataUrl' &&
        field !== 'publicSubtitle' &&
        field !== 'publicAddress' &&
        field !== 'publicPhone' &&
        field !== 'googleMapsUrl' &&
        field !== 'googleReviewsUrl' &&
        field !== 'googlePlaceId'
          ? normalizeHexInput(value)
          : value,
    }));
  };

  const applyPreset = (preset: (typeof STYLE_PRESETS)[number]) => {
    setForm(current => ({
      ...current,
      mode: preset.mode,
    }));
    updateField('primary', preset.primary);
    updateField('secondary', preset.secondary);
    updateField('card', preset.card);
    updateField('gradient0', preset.gradientColors[0]);
    updateField('gradient1', preset.gradientColors[1]);
    updateField('gradient2', preset.gradientColors[2]);
    updateField('gradient3', preset.gradientColors[3]);
  };

  const handlePickImage = async ({
    field,
    maxWidth,
    maxHeight,
    invalidTitle,
  }: {
    field: ImageField;
    maxWidth: number;
    maxHeight: number;
    invalidTitle: string;
  }) => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth,
        maxHeight,
      });

      if (result.didCancel) return;

      const asset = result.assets?.[0];
      if (!asset?.base64 || !asset.type) {
        Alert.alert(invalidTitle, 'No pudimos leer esa imagen. Probá con otra.');
        return;
      }

      updateField(field, `data:${asset.type};base64,${asset.base64}`);
    } catch {
      Alert.alert('Error', 'No pudimos abrir la galería.');
    }
  };

  const validateForm = () => {
    const colorFields: Array<keyof FormState> = [
      'primary',
      'secondary',
      'card',
      'gradient0',
      'gradient1',
      'gradient2',
      'gradient3',
    ];

    for (const field of colorFields) {
      if (!isValidHexColor(String(form[field] ?? ''))) {
        setError('Hay un color inválido en el modo avanzado.');
        return false;
      }
    }

    setError('');
    return true;
  };

  const handlePickLogo = async () => {
    await handlePickImage({
      field: 'logoDataUrl',
      maxWidth: 600,
      maxHeight: 600,
      invalidTitle: 'Logo inválido',
    });
  };

  const persistTheme = async (payload: {
    mode: ThemeMode | null;
    webPreset: WebPreset | null;
    primary: string | null;
    secondary: string | null;
    card: string | null;
    gradientColors: string[] | null;
    logoDataUrl: string | null;
    bannerDataUrl: string | null;
    mobileBannerDataUrl: string | null;
  }) => {
    const response = await updateThemeConfig(payload);
    await saveUserProfile(response.user);
    applyUserTheme(response.user);
  };

  const persistPublicProfile = async () => {
    const response = await updatePublicProfile({
      subtitle: form.publicSubtitle.trim() || null,
      address: form.publicAddress.trim() || null,
      phone: form.publicPhone.trim() || null,
      googleMapsUrl: form.googleMapsUrl.trim() || null,
      googleReviewsUrl: form.googleReviewsUrl.trim() || null,
      googlePlaceId: form.googlePlaceId.trim() || null,
    });
    await saveUserProfile(response.user);
    applyUserTheme(response.user);
  };

  const handleSave = async () => {
    if (saving || !validateForm()) return;

    try {
      setSaving(true);
      await persistTheme({
        mode: form.mode,
        webPreset: form.webPreset,
        primary: form.primary,
        secondary: form.secondary,
        card: form.card,
        gradientColors: [form.gradient0, form.gradient1, form.gradient2, form.gradient3],
        logoDataUrl: form.logoDataUrl,
        bannerDataUrl: form.bannerDataUrl,
        mobileBannerDataUrl: form.mobileBannerDataUrl,
      });
      await persistPublicProfile();
      Alert.alert('Aspecto guardado', 'La vista del local se actualizó correctamente.');
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar el aspecto.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (saving) return;
    setError('');
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator color={previewTheme.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>PERSONALIZAR ASPECTO</Text>
          <Text style={styles.headerTitle}>Elegí cómo se ve la app</Text>
          <Text style={styles.headerText}>
            Cada bloque dice exactamente qué cambia para que no haya dudas.
          </Text>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewEyebrow}>Vista previa</Text>
          <Text style={styles.previewHelper}>
            Todo lo que cambies acá se ve antes de guardar.
          </Text>
          <View style={styles.previewHero}>
            {form.mobileBannerDataUrl ? (
              <Image source={{ uri: form.mobileBannerDataUrl }} style={styles.previewHeroBanner} />
            ) : null}
            <View style={styles.previewHeroOverlay} />
            <Image style={styles.previewLogo} source={previewTheme.logo} />
            <View style={styles.previewTextWrap}>
              <Text style={styles.previewTitle}>Tu barbería</Text>
              <Text style={styles.previewSubtitle}>Así se ven botones, textos y paneles.</Text>
            </View>
          </View>
          <View style={styles.previewActions}>
            <View style={[styles.previewButton, { backgroundColor: previewTheme.primary }]}>
              <Text style={styles.previewButtonText}>Botón principal</Text>
            </View>
            <View style={styles.previewTag}>
              <Text style={[styles.previewTagText, { color: previewTheme.secondary }]}>
                Texto destacado
              </Text>
            </View>
          </View>
        </View>

        <SectionCard title="Estilos predeterminados" icon={Sparkles} theme={previewTheme}>
          <Text style={styles.helperText}>
            Aplicá una base lista para usar y después, si querés, ajustás colores finos.
          </Text>
          <ModeField theme={previewTheme} />
          <StylePresetField
            value={[form.mode, form.primary, form.secondary, form.card, form.gradient0, form.gradient1, form.gradient2, form.gradient3]}
            options={STYLE_PRESETS}
            theme={previewTheme}
            onSelect={applyPreset}
          />
        </SectionCard>

        <SectionCard title="Estilo web de reservas" icon={SwatchBook} theme={previewTheme}>
          <Text style={styles.helperText}>
            Esto cambia solo la web donde tus clientes reservan turnos. La app no se toca.
          </Text>
          <WebPresetField
            value={form.webPreset}
            options={WEB_STYLE_PRESETS}
            theme={previewTheme}
            onSelect={preset => setForm(current => ({ ...current, webPreset: preset }))}
          />
        </SectionCard>

        <SectionCard title="Datos públicos del local" icon={Sparkles} theme={previewTheme}>
          <Text style={styles.helperText}>
            Estos datos aparecen en la web de reservas. Los links de mapa y reseñas se muestran solo si están cargados.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Subtítulo corto del local"
            placeholderTextColor={previewTheme.textMuted}
            value={form.publicSubtitle}
            onChangeText={value => updateField('publicSubtitle', value)}
          />
          <TextInput
            style={styles.input}
            placeholder="Dirección"
            placeholderTextColor={previewTheme.textMuted}
            value={form.publicAddress}
            onChangeText={value => updateField('publicAddress', value)}
          />
          <TextInput
            style={styles.input}
            placeholder="Teléfono público"
            placeholderTextColor={previewTheme.textMuted}
            value={form.publicPhone}
            onChangeText={value => updateField('publicPhone', value)}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="URL de Google Maps"
            placeholderTextColor={previewTheme.textMuted}
            value={form.googleMapsUrl}
            onChangeText={value => updateField('googleMapsUrl', value)}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            placeholder="URL de reseñas de Google"
            placeholderTextColor={previewTheme.textMuted}
            value={form.googleReviewsUrl}
            onChangeText={value => updateField('googleReviewsUrl', value)}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            placeholder="Google Place ID (opcional)"
            placeholderTextColor={previewTheme.textMuted}
            value={form.googlePlaceId}
            onChangeText={value => updateField('googlePlaceId', value)}
            autoCapitalize="none"
          />
        </SectionCard>

        <SectionCard title="Logo del local" icon={ImagePlus} theme={previewTheme}>
          <Text style={styles.helperText}>
            Este logo aparece en la app y ayuda a que el local se reconozca rápido.
          </Text>
          <View style={styles.logoBox}>
            <Image
              style={styles.logoPreview}
              source={form.logoDataUrl ? { uri: form.logoDataUrl } : previewTheme.logo}
            />
          </View>
          <View style={styles.row}>
            <Pressable style={styles.secondaryBtn} onPress={handlePickLogo}>
              <Text style={styles.secondaryBtnText}>Elegir imagen</Text>
            </Pressable>
            <Pressable style={styles.ghostBtnInline} onPress={() => updateField('logoDataUrl', null)}>
              <Text style={styles.ghostBtnText}>Quitar</Text>
            </Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Portada web del local" icon={ImagePlus} theme={previewTheme}>
          <Text style={styles.helperText}>
            Esta imagen se muestra arriba de la web de reservas como banner principal.
          </Text>
          <Text style={styles.recommendedSizeText}>Tamaño recomendado: 1600 x 900 px</Text>
          <View style={styles.bannerBox}>
            {form.bannerDataUrl ? (
              <Image style={styles.bannerPreview} source={{ uri: form.bannerDataUrl }} />
            ) : (
              <View style={styles.bannerPlaceholder}>
                <Text style={styles.bannerPlaceholderText}>Sin portada cargada</Text>
              </View>
            )}
          </View>
          <View style={styles.row}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() =>
                handlePickImage({
                  field: 'bannerDataUrl',
                  maxWidth: 1600,
                  maxHeight: 900,
                  invalidTitle: 'Portada web inválida',
                })
              }
            >
              <Text style={styles.secondaryBtnText}>Elegir portada</Text>
            </Pressable>
            <Pressable
              style={styles.ghostBtnInline}
              onPress={() => updateField('bannerDataUrl', null)}
            >
              <Text style={styles.ghostBtnText}>Quitar</Text>
            </Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Portada para teléfono" icon={ImagePlus} theme={previewTheme}>
          <Text style={styles.helperText}>
            Esta imagen queda preparada para la versión móvil y para previews dentro de la app.
          </Text>
          <Text style={styles.recommendedSizeText}>Tamaño recomendado: 1080 x 1920 px</Text>
          <View style={styles.bannerBox}>
            {form.mobileBannerDataUrl ? (
              <Image style={styles.mobileBannerPreview} source={{ uri: form.mobileBannerDataUrl }} />
            ) : (
              <View style={styles.bannerPlaceholder}>
                <Text style={styles.bannerPlaceholderText}>Sin portada para teléfono</Text>
              </View>
            )}
          </View>
          <View style={styles.row}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() =>
                handlePickImage({
                  field: 'mobileBannerDataUrl',
                  maxWidth: 1080,
                  maxHeight: 1920,
                  invalidTitle: 'Portada para teléfono inválida',
                })
              }
            >
              <Text style={styles.secondaryBtnText}>Elegir portada</Text>
            </Pressable>
            <Pressable
              style={styles.ghostBtnInline}
              onPress={() => updateField('mobileBannerDataUrl', null)}
            >
              <Text style={styles.ghostBtnText}>Quitar</Text>
            </Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Botones y acentos" icon={Sparkles} theme={previewTheme}>
          <Text style={styles.helperText}>
            Cambia el color de botones principales, detalles activos y acentos visuales.
          </Text>
          <ColorSelectorButton
            label="Elegir color"
            value={form.primary}
            theme={previewTheme}
            onPress={() => setPickerField('primary')}
          />
        </SectionCard>

        <SectionCard title="Textos destacados" icon={SwatchBook} theme={previewTheme}>
          <Text style={styles.helperText}>
            Cambia el color de textos que querés remarcar, etiquetas activas y brillos.
          </Text>
          <ColorSelectorButton
            label="Elegir color"
            value={form.secondary}
            theme={previewTheme}
            onPress={() => setPickerField('secondary')}
          />
        </SectionCard>

        <SectionCard title="Tarjetas y paneles" icon={PaintBucket} theme={previewTheme}>
          <Text style={styles.helperText}>
            Cambia el fondo de los paneles grandes, cajas y tarjetas de información.
          </Text>
          <ColorSelectorButton
            label="Elegir color"
            value={form.card}
            theme={previewTheme}
            onPress={() => setPickerField('card')}
          />
        </SectionCard>

        <SectionCard title="Fondo general" icon={PaintBucket} theme={previewTheme}>
          <Text style={styles.helperText}>
            Elegí el degradado del fondo completo de la app.
          </Text>
          <GradientPresetField
            value={[form.gradient0, form.gradient1, form.gradient2, form.gradient3]}
            options={GRADIENT_PRESETS}
            theme={previewTheme}
            onSelect={colors => {
              updateField('gradient0', colors[0]);
              updateField('gradient1', colors[1]);
              updateField('gradient2', colors[2]);
              updateField('gradient3', colors[3]);
            }}
          />
        </SectionCard>

        <Pressable style={styles.advancedToggle} onPress={() => setShowAdvanced(current => !current)}>
          <Text style={styles.advancedToggleText}>
            {showAdvanced ? 'Ocultar modo avanzado' : 'Modo avanzado para ajustar colores finos'}
          </Text>
        </Pressable>

        {showAdvanced ? (
          <View style={styles.advancedPanel}>
            <AdvancedColorField
              label="Botones y acentos"
              value={form.primary}
              theme={previewTheme}
              onPress={() => setPickerField('primary')}
            />
            <AdvancedColorField
              label="Textos destacados"
              value={form.secondary}
              theme={previewTheme}
              onPress={() => setPickerField('secondary')}
            />
            <AdvancedColorField
              label="Tarjetas y paneles"
              value={form.card}
              theme={previewTheme}
              onPress={() => setPickerField('card')}
            />
            <AdvancedColorField
              label="Fondo 1"
              value={form.gradient0}
              theme={previewTheme}
              onPress={() => setPickerField('gradient0')}
            />
            <AdvancedColorField
              label="Fondo 2"
              value={form.gradient1}
              theme={previewTheme}
              onPress={() => setPickerField('gradient1')}
            />
            <AdvancedColorField
              label="Fondo 3"
              value={form.gradient2}
              theme={previewTheme}
              onPress={() => setPickerField('gradient2')}
            />
            <AdvancedColorField
              label="Fondo 4"
              value={form.gradient3}
              theme={previewTheme}
              onPress={() => setPickerField('gradient3')}
            />
          </View>
        ) : null}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable
          style={[styles.ghostBtn, saving && styles.disabledBtn]}
          onPress={handleCancel}
          disabled={saving}
        >
          <Text style={styles.ghostBtnText}>Cancelar</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.floatingActionWrap}>
        <Pressable style={[styles.primaryBtn, saving && styles.disabledBtn]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Guardar aspecto</Text>}
        </Pressable>
      </View>
      {pickerConfig ? (
        <ColorPickerModal
          visible
          title={pickerConfig.title}
          value={pickerConfig.value}
          swatches={pickerConfig.swatches}
          onClose={() => setPickerField(null)}
          onConfirm={color => {
            if (pickerField) {
              updateField(pickerField, color);
            }
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function SectionCard({
  title,
  icon: Icon,
  theme,
  children,
}: {
  title: string;
  icon: React.ComponentType<any>;
  theme: Theme;
  children: React.ReactNode;
}) {
  const styles = createStyles(theme);

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Icon size={18} color={theme.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ColorSelectorButton({
  label,
  value,
  theme,
  onPress,
}: {
  label: string;
  value: string;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.surfaceAlt,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.border,
        paddingVertical: 14,
        paddingHorizontal: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            backgroundColor: value,
            borderWidth: 1,
            borderColor: theme.border,
            marginRight: 12,
          }}
        />
        <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '700' }}>{label}</Text>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>{value}</Text>
    </Pressable>
  );
}

function GradientPresetField({
  value,
  options,
  theme,
  onSelect,
}: {
  value: string[];
  options: Array<{ label: string; colors: string[] }>;
  theme: Theme;
  onSelect: (value: string[]) => void;
}) {
  const selectedKey = value.join('|');

  return (
    <View style={{ gap: 10, marginTop: 10 }}>
      {options.map(option => {
        const isActive = option.colors.join('|') === selectedKey;
        return (
          <Pressable
            key={option.label}
            onPress={() => onSelect(option.colors)}
            style={{
              borderRadius: 18,
              borderWidth: isActive ? 2 : 1,
              borderColor: isActive ? theme.primary : theme.border,
              padding: 12,
              backgroundColor: theme.surfaceAlt,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
              {option.label}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {option.colors.map(color => (
                <View key={color} style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: color }} />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function AdvancedColorField({
  label,
  value,
  theme,
  onPress,
}: {
  label: string;
  value: string;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginBottom: 12,
        backgroundColor: theme.surfaceAlt,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View>
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
          {label}
        </Text>
        <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '700' }}>{value}</Text>
      </View>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          backgroundColor: value,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      />
    </Pressable>
  );
}

function StylePresetField({
  value,
  options,
  theme,
  onSelect,
}: {
  value: string[];
  options: Array<{
    label: string;
    helper: string;
    mode: ThemeMode;
    primary: string;
    secondary: string;
    card: string;
    gradientColors: string[];
  }>;
  theme: Theme;
  onSelect: (preset: (typeof STYLE_PRESETS)[number]) => void;
}) {
  const selectedKey = value.join('|');

  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      {options.map(option => {
        const optionKey = [
          option.mode,
          option.primary,
          option.secondary,
          option.card,
          ...option.gradientColors,
        ].join('|');
        const isActive = optionKey === selectedKey;

        return (
          <Pressable
            key={option.label}
            onPress={() => onSelect(option)}
            style={{
              borderRadius: 18,
              borderWidth: isActive ? 2 : 1,
              borderColor: isActive ? theme.primary : theme.border,
              padding: 14,
              backgroundColor: theme.surfaceAlt,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '800' }}>
                  {option.label}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                  {option.helper}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 6,
                    backgroundColor: option.primary,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                />
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 6,
                    backgroundColor: option.secondary,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                />
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 6,
                    backgroundColor: option.card,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {option.gradientColors.map(color => (
                <View
                  key={`${option.label}-${color}`}
                  style={{ flex: 1, height: 34, borderRadius: 10, backgroundColor: color }}
                />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function WebPresetField({
  value,
  options,
  theme,
  onSelect,
}: {
  value: WebPreset;
  options: Array<{
    key: WebPreset;
    label: string;
    helper: string;
  }>;
  theme: Theme;
  onSelect: (preset: WebPreset) => void;
}) {
  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      {options.map(option => {
        const isActive = option.key === value;

        return (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.key)}
            style={{
              borderRadius: 18,
              borderWidth: isActive ? 2 : 1,
              borderColor: isActive ? theme.primary : theme.border,
              padding: 14,
              backgroundColor: theme.surfaceAlt,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '800' }}>
                  {option.label}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                  {option.helper}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: isActive ? `${theme.primary}18` : theme.input,
                  borderWidth: 1,
                  borderColor: isActive ? theme.primary : theme.border,
                }}
              >
                <Text
                  style={{
                    color: isActive ? theme.primary : theme.textMuted,
                    fontSize: 11,
                    fontWeight: '800',
                    textTransform: 'uppercase',
                  }}
                >
                  {isActive ? 'Activo' : 'Usar'}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function ModeField({ theme }: { theme: Theme }) {
  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: theme.primary,
        backgroundColor: `${theme.primary}12`,
        gap: 6,
      }}
    >
      <Text
        style={{
          color: theme.primary,
          fontWeight: '800',
          textAlign: 'center',
        }}
      >
        Modo claro activo
      </Text>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: 12,
          lineHeight: 18,
          textAlign: 'center',
        }}
      >
        La app y la web quedan configuradas en tema claro para mantener una misma línea visual.
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centeredState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
    },
    scrollContent: {
      paddingTop: Platform.OS === 'ios' ? 72 : 28,
      paddingHorizontal: 20,
      paddingBottom: 260,
    },
    header: {
      marginBottom: 20,
    },
    headerSubtitle: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 2,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 30,
      fontWeight: '800',
      marginTop: 8,
    },
    headerText: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
    },
    previewCard: {
      backgroundColor: theme.card,
      borderRadius: 28,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
    },
    previewEyebrow: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      marginBottom: 14,
    },
    previewHelper: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 12,
    },
    previewHero: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      minHeight: 108,
      borderRadius: 24,
      padding: 16,
      backgroundColor: theme.surfaceAlt,
    },
    previewHeroBanner: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
    },
    previewHeroOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay,
    },
    previewLogo: {
      width: 68,
      height: 68,
      borderRadius: 20,
      marginRight: 14,
      backgroundColor: theme.surfaceAlt,
      zIndex: 1,
    },
    previewTextWrap: {
      flex: 1,
      zIndex: 1,
    },
    previewTitle: {
      color: theme.textPrimary,
      fontSize: 21,
      fontWeight: '800',
    },
    previewSubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      marginTop: 4,
    },
    previewActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
      alignItems: 'center',
    },
    previewButton: {
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    previewButtonText: {
      color: theme.textOnPrimary,
      fontWeight: '900',
    },
    previewTag: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 11,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    previewTagText: {
      fontWeight: '800',
    },
    sectionCard: {
      backgroundColor: theme.card,
      borderRadius: 28,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
      marginRight: 10,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      flex: 1,
    },
    helperText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    input: {
      minHeight: 48,
      marginTop: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      color: theme.textPrimary,
      paddingHorizontal: 14,
      fontSize: 14,
      fontWeight: '700',
    },
    recommendedSizeText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 10,
      letterSpacing: 0.4,
    },
    logoBox: {
      height: 120,
      borderRadius: 22,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
      marginBottom: 14,
    },
    logoPreview: {
      width: 86,
      height: 86,
      resizeMode: 'contain',
    },
    bannerBox: {
      height: 150,
      borderRadius: 22,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      marginTop: 14,
      marginBottom: 14,
    },
    bannerPreview: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    mobileBannerPreview: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    bannerPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 18,
    },
    bannerPlaceholderText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    secondaryBtn: {
      flex: 1,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryBtnText: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    ghostBtnInline: {
      width: 92,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    advancedToggle: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 13,
      paddingHorizontal: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 14,
    },
    advancedToggleText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    advancedPanel: {
      marginBottom: 12,
      padding: 14,
      borderRadius: 20,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 18,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 20,
      elevation: 12,
    },
    primaryBtnText: {
      color: theme.textOnPrimary,
      fontSize: 12,
      fontWeight: '900',
    },
    ghostBtn: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 2,
    },
    ghostBtnText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    errorText: {
      color: '#FF8D8D',
      fontSize: 13,
      fontWeight: '700',
      marginTop: 4,
      marginBottom: 8,
    },
    disabledBtn: {
      opacity: 0.7,
    },
    floatingActionWrap: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: Platform.OS === 'ios' ? 116 : 102,
      zIndex: 40,
      elevation: 40,
    },
  });
}
