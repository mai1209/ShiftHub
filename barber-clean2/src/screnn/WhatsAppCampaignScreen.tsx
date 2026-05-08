import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { MessageCircle, Search, Send } from 'lucide-react-native';
import { CustomerContact, fetchCustomerContacts } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';

const DEFAULT_MESSAGE =
  'Hola {nombre}! Tenemos una promoción especial en la barbería. Escribinos para reservar tu turno.';

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

const normalizeWhatsAppPhone = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('54')) return digits;
  if (digits.length === 10 && digits.startsWith('3')) return `549${digits}`;
  return digits;
};

const buildMessage = (template: string, contact: CustomerContact) =>
  template
    .replace(/\{nombre\}/gi, contact.customerName || 'Cliente')
    .replace(/\{servicio\}/gi, contact.lastService || 'tu servicio');

export default function WhatsAppCampaignScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [frequencySort, setFrequencySort] = useState<
    'recent' | 'most_frequent' | 'least_frequent'
  >('most_frequent');
  const [minVisitsInput, setMinVisitsInput] = useState('');
  const [maxVisitsInput, setMaxVisitsInput] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetchCustomerContacts({ limit: 500 });
      setContacts(response.contacts ?? []);
    } catch (err: any) {
      console.error('Error clientes WhatsApp:', err?.message, err?.status);
      const detail =
        err?.status === 404
          ? 'La ruta de clientes no existe en el backend actual. Subí los cambios y reiniciá el backend.'
          : err?.code === 'PLAN_UPGRADE_REQUIRED' || err?.status === 403
            ? 'Esta función requiere plan Pro activo.'
            : err?.message || 'Intentá de nuevo en unos minutos.';
      Alert.alert(
        'No pudimos cargar clientes',
        detail,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadContacts();
    }, [loadContacts]),
  );

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const minVisits = Number(minVisitsInput);
    const maxVisits = Number(maxVisitsInput);
    const matches = contacts.filter(contact => {
      const visits = Number(contact.appointmentsCount || 0);
      const matchesMin =
        !Number.isFinite(minVisits) || minVisits <= 0 || visits >= minVisits;
      const matchesMax =
        !Number.isFinite(maxVisits) || maxVisits <= 0 || visits <= maxVisits;
      if (!matchesMin || !matchesMax) return false;
      if (!term) return true;
      return (
        contact.customerName.toLowerCase().includes(term) ||
        String(contact.phone || '').toLowerCase().includes(term) ||
        String(contact.lastService || '').toLowerCase().includes(term)
      );
    });
    return [...matches].sort((a, b) => {
      if (frequencySort === 'most_frequent') {
        return (
          Number(b.appointmentsCount || 0) - Number(a.appointmentsCount || 0) ||
          new Date(b.lastAppointmentAt || 0).getTime() -
            new Date(a.lastAppointmentAt || 0).getTime()
        );
      }
      if (frequencySort === 'least_frequent') {
        return (
          Number(a.appointmentsCount || 0) - Number(b.appointmentsCount || 0) ||
          new Date(b.lastAppointmentAt || 0).getTime() -
            new Date(a.lastAppointmentAt || 0).getTime()
        );
      }
      return (
        new Date(b.lastAppointmentAt || 0).getTime() -
        new Date(a.lastAppointmentAt || 0).getTime()
      );
    });
  }, [contacts, frequencySort, maxVisitsInput, minVisitsInput, search]);

  const handleOpenWhatsApp = async (contact: CustomerContact) => {
    const phone = normalizeWhatsAppPhone(contact.normalizedPhone || contact.phone);
    const text = buildMessage(message, contact).trim();

    if (!phone || phone.length < 8) {
      Alert.alert(
        'Teléfono inválido',
        'Este cliente no tiene un WhatsApp válido guardado.',
      );
      return;
    }

    if (!text) {
      Alert.alert('Mensaje vacío', 'Escribí el mensaje que querés enviar.');
      return;
    }

    const encodedText = encodeURIComponent(text);
    const appUrl = `whatsapp://send?phone=${phone}&text=${encodedText}`;
    const webUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`;

    try {
      await Linking.openURL(appUrl);
    } catch (firstError) {
      try {
        await Linking.openURL(webUrl);
      } catch (_secondError) {
        Clipboard.setString(text);
        console.error('No pudimos abrir WhatsApp:', firstError);
        Alert.alert(
          'No pudimos abrir WhatsApp',
          `Copiamos el mensaje. Revisá que el número tenga código de país: +${phone}`,
        );
      }
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.iconBubble}>
          <MessageCircle size={22} color={theme.textOnPrimary} />
        </View>
        <Text style={styles.title}>Promociones por WhatsApp</Text>
        <Text style={styles.subtitle}>
          Escribí un mensaje y abrí WhatsApp con cada cliente que ya reservó
          turno. Usá {'{nombre}'} para personalizarlo.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Mensaje</Text>
        <TextInput
          style={styles.messageInput}
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Escribí tu promoción o descuento"
          placeholderTextColor={hexToRgba(theme.primary, 0.45)}
        />
        <Text style={styles.helper}>
          Ejemplo: Hola {'{nombre}'}, esta semana tenemos 15% de descuento en
          corte y barba.
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Search size={18} color={hexToRgba(theme.primary, 0.64)} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar cliente, teléfono o servicio"
          placeholderTextColor={hexToRgba(theme.primary, 0.44)}
        />
      </View>

      <View style={styles.filtersCard}>
        <Text style={styles.filtersTitle}>Frecuencia</Text>
        <View style={styles.sortRow}>
          <Pressable
            onPress={() => setFrequencySort('most_frequent')}
            style={[
              styles.filterChip,
              frequencySort === 'most_frequent' && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                frequencySort === 'most_frequent' && styles.filterChipTextActive,
              ]}
            >
              Más frecuente
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFrequencySort('least_frequent')}
            style={[
              styles.filterChip,
              frequencySort === 'least_frequent' && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                frequencySort === 'least_frequent' && styles.filterChipTextActive,
              ]}
            >
              Menos frecuente
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFrequencySort('recent')}
            style={[
              styles.filterChip,
              frequencySort === 'recent' && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                frequencySort === 'recent' && styles.filterChipTextActive,
              ]}
            >
              Más reciente
            </Text>
          </Pressable>
        </View>
        <View style={styles.visitsRow}>
          <View style={styles.visitBox}>
            <Text style={styles.visitLabel}>Mín. veces</Text>
            <TextInput
              style={styles.visitInput}
              value={minVisitsInput}
              onChangeText={setMinVisitsInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={hexToRgba(theme.primary, 0.44)}
            />
          </View>
          <View style={styles.visitBox}>
            <Text style={styles.visitLabel}>Máx. veces</Text>
            <TextInput
              style={styles.visitInput}
              value={maxVisitsInput}
              onChangeText={setMaxVisitsInput}
              keyboardType="number-pad"
              placeholder="Sin tope"
              placeholderTextColor={hexToRgba(theme.primary, 0.44)}
            />
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : filteredContacts.length ? (
        <View style={styles.list}>
          {filteredContacts.map(contact => (
            <View key={contact.id} style={styles.contactCard}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{contact.customerName}</Text>
                <Text style={styles.contactMeta}>{contact.phone}</Text>
                <Text style={styles.contactHint}>
                  {contact.appointmentsCount} turno(s)
                  {contact.lastService ? ` · Último: ${contact.lastService}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => handleOpenWhatsApp(contact)}
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.sendButtonPressed,
                ]}
              >
                <Send size={16} color={theme.textOnPrimary} />
                <Text style={styles.sendButtonText}>Enviar</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sin clientes con WhatsApp</Text>
          <Text style={styles.emptyText}>
            Cuando los clientes reserven turnos con teléfono, van a aparecer acá.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingTop: 36,
      paddingHorizontal: 20,
      paddingBottom: 140,
      gap: 16,
    },
    header: {
      gap: 10,
    },
    iconBubble: {
      width: 46,
      height: 46,
      borderRadius: 18,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: theme.textPrimary,
      fontSize: 31,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    subtitle: {
      color: hexToRgba(theme.primary, 0.58),
      fontSize: 13,
      lineHeight: 20,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.16),
      gap: 10,
    },
    label: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    messageInput: {
      minHeight: 122,
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.textPrimary,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top',
    },
    helper: {
      color: hexToRgba(theme.primary, 0.48),
      fontSize: 12,
      lineHeight: 18,
    },
    filtersCard: {
      backgroundColor: theme.card,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.12),
      gap: 12,
    },
    filtersTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    sortRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    filterChip: {
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.16),
      backgroundColor: hexToRgba(theme.primary, 0.05),
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    filterChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    filterChipText: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    filterChipTextActive: {
      color: theme.textOnPrimary,
    },
    visitsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    visitBox: {
      flex: 1,
      gap: 6,
    },
    visitLabel: {
      color: hexToRgba(theme.primary, 0.56),
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    visitInput: {
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.14),
      backgroundColor: hexToRgba(theme.primary, 0.05),
      color: theme.textPrimary,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: '600',
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 18,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.14),
      paddingHorizontal: 14,
      height: 52,
    },
    searchInput: {
      flex: 1,
      color: theme.textPrimary,
      fontSize: 14,
    },
    loadingBox: {
      padding: 28,
      alignItems: 'center',
    },
    list: {
      gap: 10,
    },
    contactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 14,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.12),
    },
    contactInfo: {
      flex: 1,
      gap: 4,
    },
    contactName: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    contactMeta: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    contactHint: {
      color: hexToRgba(theme.primary, 0.46),
      fontSize: 11,
      fontWeight: '600',
    },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: theme.primary,
      borderRadius: 15,
      paddingVertical: 11,
      paddingHorizontal: 12,
    },
    sendButtonPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.98 }],
    },
    sendButtonText: {
      color: theme.textOnPrimary,
      fontSize: 12,
      fontWeight: '900',
    },
    emptyCard: {
      padding: 24,
      borderRadius: 22,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.14),
      gap: 8,
    },
    emptyTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '900',
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
  });
}
