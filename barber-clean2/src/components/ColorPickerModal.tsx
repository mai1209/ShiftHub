import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type Props = {
  visible: boolean;
  title: string;
  value: string;
  swatches?: string[];
  onClose: () => void;
  onConfirm: (value: string) => void;
};

type HsvColor = {
  h: number;
  s: number;
  v: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHex(value: string) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
  return '#39E01F';
}

function sanitizeHexInput(value: string) {
  const raw = String(value ?? '')
    .toUpperCase()
    .replace(/[^0-9A-F#]/g, '')
    .replace(/^([^#])/, '#$1');
  return raw.startsWith('#') ? raw.slice(0, 7) : `#${raw.slice(0, 6)}`;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex).replace('#', '');
  const intValue = Number.parseInt(normalized, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function hsvToHex({ h, s, v }: HsvColor) {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = v - chroma;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = chroma;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = chroma;
  } else if (hue < 180) {
    g = chroma;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = chroma;
  } else if (hue < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return rgbToHex((r + match) * 255, (g + match) * 255, (b + match) * 255);
}

function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function SliderTrack({
  label,
  value,
  colorStops,
  onChange,
}: {
  label: string;
  value: number;
  colorStops: string[];
  onChange: (nextValue: number) => void;
}) {
  return (
    <View style={styles.sliderSection}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{Math.round(value * 100)}%</Text>
      </View>

      <View style={styles.trackWrap}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={`${label}-gradient`} x1="0%" y1="0%" x2="100%" y2="0%">
              {colorStops.map((color, index) => (
                <Stop
                  key={`${label}-${color}-${index}`}
                  offset={`${(index / Math.max(colorStops.length - 1, 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="12"
            fill={`url(#${label}-gradient)`}
          />
        </Svg>
      </View>

      <Slider
        style={styles.nativeSlider}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor="#FFFFFF"
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}

export default function ColorPickerModal({
  visible,
  title,
  value,
  swatches = [],
  onClose,
  onConfirm,
}: Props) {
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(value));
  const [hexInput, setHexInput] = useState(() => normalizeHex(value));

  useEffect(() => {
    if (!visible) return;
    const nextHsv = hexToHsv(value);
    setHsv(nextHsv);
    setHexInput(normalizeHex(value));
  }, [visible, value]);

  const currentColor = useMemo(() => hsvToHex(hsv), [hsv]);
  const saturationStart = useMemo(() => hsvToHex({ h: hsv.h, s: 0, v: hsv.v }), [hsv]);
  const saturationEnd = useMemo(() => hsvToHex({ h: hsv.h, s: 1, v: hsv.v }), [hsv]);
  const brightnessEnd = useMemo(() => hsvToHex({ h: hsv.h, s: hsv.s, v: 1 }), [hsv]);

  useEffect(() => {
    setHexInput(currentColor);
  }, [currentColor]);

  const applyHexInput = () => {
    const normalized = normalizeHex(hexInput);
    setHsv(hexToHsv(normalized));
    setHexInput(normalized);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.previewBlock}>
            <View style={[styles.previewSwatch, { backgroundColor: currentColor }]} />
            <View style={styles.previewMeta}>
              <Text style={styles.previewTitle}>Color actual</Text>
              <Text style={styles.previewHex}>{currentColor}</Text>
            </View>
          </View>

          <SliderTrack
            label="Matiz"
            value={hsv.h / 360}
            colorStops={[
              '#FF0000',
              '#FFFF00',
              '#00FF00',
              '#00FFFF',
              '#0000FF',
              '#FF00FF',
              '#FF0000',
            ]}
            onChange={ratio =>
              setHsv(current => ({
                ...current,
                h: ratio * 360,
              }))
            }
          />

          <SliderTrack
            label="Saturacion"
            value={hsv.s}
            colorStops={[saturationStart, saturationEnd]}
            onChange={ratio =>
              setHsv(current => ({
                ...current,
                s: ratio,
              }))
            }
          />

          <SliderTrack
            label="Luminosidad"
            value={hsv.v}
            colorStops={['#000000', brightnessEnd]}
            onChange={ratio =>
              setHsv(current => ({
                ...current,
                v: ratio,
              }))
            }
          />

          <View style={styles.hexBlock}>
            <Text style={styles.hexLabel}>Hex</Text>
            <TextInput
              value={hexInput}
              onChangeText={setHexInput}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              style={styles.hexInput}
              placeholder="#39E01F"
              placeholderTextColor="#6B7280"
            />
            <Pressable style={styles.applyHexBtn} onPress={applyHexInput}>
              <Text style={styles.applyHexText}>Aplicar</Text>
            </Pressable>
          </View>

          {swatches.length ? (
            <View style={styles.swatchesWrap}>
              {swatches.map(swatch => {
                const normalized = normalizeHex(swatch);
                const isSelected = normalized === currentColor;
                return (
                  <Pressable
                    key={swatch}
                    style={[
                      styles.swatchChip,
                      {
                        backgroundColor: normalized,
                        borderColor: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.14)',
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    onPress={() => {
                      setHsv(hexToHsv(normalized));
                      setHexInput(normalized);
                    }}
                  />
                );
              })}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={styles.confirmBtn}
              onPress={() => {
                onConfirm(currentColor);
                onClose();
              }}
            >
              <Text style={styles.confirmText}>Hecho</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.66)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    backgroundColor: '#1C1C1C',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#F4F4F4',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  previewBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131313',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    marginBottom: 10,
  },
  previewSwatch: {
    width: 54,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  previewMeta: {
    marginLeft: 14,
    flex: 1,
  },
  previewTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewHex: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  sliderSection: {
    marginTop: 14,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  sliderValue: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  trackWrap: {
    height: 18,
    borderRadius: 12,
    overflow: 'hidden',
  },
  nativeSlider: {
    marginTop: -18,
    marginHorizontal: -14,
    height: 38,
  },
  hexBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  hexLabel: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '700',
  },
  hexInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  applyHexBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyHexText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  swatchesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  swatchChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#2A2A2A',
  },
  cancelText: {
    color: '#E4E4E4',
    fontWeight: '700',
  },
  confirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#34C759',
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
