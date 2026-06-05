import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Building2, Plus, Store } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  createOwnShop,
  fetchOwnShops,
  type ShopOption,
} from '../services/api';
import {
  getUserProfile,
  saveActiveShop,
  saveUserProfile,
} from '../services/authStorage';

type Props = {
  navigation: any;
};

export default function ShopSelectionScreen({ navigation }: Props) {
  const { theme, applyUserTheme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [businessLimit, setBusinessLimit] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  const loadShops = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetchOwnShops();
      setShops(response.shops || []);
      setBusinessLimit(Math.max(1, Number(response.businessLimit || 1)));
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudieron cargar los locales.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  const openShop = useCallback(
    async (shop: ShopOption) => {
      await saveActiveShop(shop);
      const user = await getUserProfile<any>();
      if (user) {
        const nextUser = {
          ...user,
          activeShop: shop,
          shopSlug: shop.slug || user.shopSlug,
        };
        await saveUserProfile(nextUser);
        applyUserTheme(nextUser);
      }
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    },
    [applyUserTheme, navigation],
  );

  const handleCreateShop = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Dato requerido', 'Ingresá el nombre del local.');
      return;
    }

    try {
      setSaving(true);
      const response = await createOwnShop({
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      const createdShop = response.shop;
      setName('');
      setAddress('');
      setPhone('');
      setShowCreate(false);
      setShops(response.shops || []);
      setBusinessLimit(Math.max(1, Number(response.businessLimit || 1)));
      if (createdShop) {
        await openShop(createdShop);
      }
    } catch (err: any) {
      Alert.alert(
        'No se pudo crear',
        err?.message ||
          'No se pudo crear el local. Revisá el límite de tu plan.',
      );
    } finally {
      setSaving(false);
    }
  }, [address, name, openShop, phone]);

  const canCreateMore = shops.length < businessLimit;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerIcon}>
        <Building2 size={26} color={theme.primary} />
      </View>
      <Text style={styles.title}>Elegí un local</Text>
      <Text style={styles.subtitle}>
        Cada local tiene su propio panel de servicios, profesionales y turnos.
      </Text>

      <View style={styles.limitCard}>
        <Text style={styles.limitText}>
          Tenés {shops.length} de {businessLimit} local(es) disponibles.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {shops.map(shop => (
            <Pressable
              key={shop._id}
              style={({ pressed }) => [
                styles.shopCard,
                pressed && styles.shopCardPressed,
              ]}
              onPress={() => openShop(shop)}
            >
              <View style={styles.shopIcon}>
                <Store size={20} color={theme.primary} />
              </View>
              <View style={styles.shopBody}>
                <Text style={styles.shopName}>{shop.name}</Text>
                <Text style={styles.shopMeta}>
                  /{shop.slug}
                  {shop.address ? ` · ${shop.address}` : ''}
                </Text>
              </View>
              <Text style={styles.enterText}>Entrar</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!showCreate ? (
        <Pressable
          style={[
            styles.createToggle,
            !canCreateMore && styles.createToggleDisabled,
          ]}
          onPress={() => {
            if (!canCreateMore) {
              Alert.alert(
                'Límite alcanzado',
                'Agregá un negocio adicional a tu plan para crear otro local.',
              );
              return;
            }
            setShowCreate(true);
          }}
        >
          <Plus size={18} color={theme.textOnPrimary} />
          <Text style={styles.createToggleText}>Crear otro local</Text>
        </Pressable>
      ) : (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Nuevo local</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre"
            placeholderTextColor={theme.placeholder}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Dirección"
            placeholderTextColor={theme.placeholder}
            value={address}
            onChangeText={setAddress}
          />
          <TextInput
            style={styles.input}
            placeholder="Teléfono"
            placeholderTextColor={theme.placeholder}
            value={phone}
            onChangeText={setPhone}
          />
          <View style={styles.formActions}>
            <Pressable
              style={styles.cancelButton}
              onPress={() => setShowCreate(false)}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={styles.saveButton}
              onPress={handleCreateShop}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={theme.textOnPrimary} />
              ) : (
                <Text style={styles.saveButtonText}>Crear y entrar</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    content: {
      paddingHorizontal: 20,
      paddingTop: 70,
      paddingBottom: 140,
    },
    headerIcon: {
      width: 54,
      height: 54,
      borderRadius: 20,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 32,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
      marginBottom: 18,
    },
    limitCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 14,
      marginBottom: 16,
    },
    limitText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '800',
    },
    loader: { marginTop: 30 },
    list: { gap: 12 },
    shopCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 16,
    },
    shopCardPressed: { opacity: 0.86 },
    shopIcon: {
      width: 42,
      height: 42,
      borderRadius: 16,
      backgroundColor: theme.input,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shopBody: { flex: 1 },
    shopName: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '900',
    },
    shopMeta: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },
    enterText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    createToggle: {
      marginTop: 18,
      borderRadius: 20,
      backgroundColor: theme.primary,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    createToggleDisabled: { opacity: 0.5 },
    createToggleText: {
      color: theme.textOnPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
    formCard: {
      marginTop: 18,
      gap: 12,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 16,
    },
    formTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '900',
    },
    input: {
      backgroundColor: theme.input,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.textPrimary,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
    },
    formActions: { flexDirection: 'row', gap: 10 },
    cancelButton: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelButtonText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '900',
    },
    saveButton: {
      flex: 1,
      borderRadius: 16,
      backgroundColor: theme.primary,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveButtonText: {
      color: theme.textOnPrimary,
      fontSize: 13,
      fontWeight: '900',
    },
  });
