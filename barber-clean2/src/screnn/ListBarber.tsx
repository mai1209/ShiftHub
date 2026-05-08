import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Pressable,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { fetchBarbers, Barber, deleteBarber } from "../services/api";
import { useTheme } from "../context/ThemeContext";
import type { Theme } from "../context/ThemeContext";
import { Pencil, Trash2 } from "lucide-react-native";
import { Swipeable } from "react-native-gesture-handler";

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace("#", "");
  const bigint = parseInt(sanitized.length === 3 ? sanitized.repeat(2) : sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatLastAccess = (value?: string | null) => {
  if (!value) return "Nunca ingresó";

  try {
    return new Date(value).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_error) {
    return "Sin dato";
  }
};

const resolveAccessStatus = (barber: Barber) => {
  if (!barber.loginAccess?.enabled) {
    return {
      label: "Sin acceso",
      variant: "disabled" as const,
    };
  }

  if (barber.loginAccess?.lastLoginAt) {
    return {
      label: "Activo",
      variant: "active" as const,
    };
  }

  return {
    label: "Nunca ingresó",
    variant: "pending" as const,
  };
};

type Props = {
  navigation: any;
};

type AccessFilter = "all" | "enabled" | "disabled";

function ListBarber({ navigation }: Props) {
  const { theme, businessCopy } = useTheme();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const openedSwipeableIdRef = useRef<string | null>(null);
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});

  const loadBarbers = useCallback(async () => {
    try {
      if (!refreshing) setLoading(true);
      const res = await fetchBarbers();
      setBarbers(res.barbers);
      setError("");
    } catch (err: any) {
      setError(err?.message ?? `No pudimos cargar los ${businessCopy.staffPlural}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessCopy.staffPlural, refreshing]);

  useEffect(() => {
    loadBarbers();
  }, [loadBarbers]);

  useFocusEffect(
    useCallback(() => {
      loadBarbers();
    }, [loadBarbers]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadBarbers();
  };

  const handleOpenBarber = (barber: Barber) => {
    navigation.navigate("Barber-Home", {
      barberId: barber._id,
      barberName: barber.fullName,
      barber,
    });
  };

  const handleEditBarber = (barber: Barber) => {
    navigation.navigate("Register-Employed", {
      barber,
    });
  };

  const handleManageAccess = (barber: Barber) => {
    navigation.navigate("Barber-Access", { barber });
  };

  const handleDeleteBarber = (barber: Barber) => {
    Alert.alert(
      `Eliminar ${businessCopy.staffSingular}`,
      `Se va a desactivar a ${barber.fullName}. Ya no va a aparecer para cargar turnos.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBarber(barber._id);
              setBarbers(prev => prev.filter(item => item._id !== barber._id));
            } catch (err: any) {
              setError(err?.message ?? `No se pudo eliminar el ${businessCopy.staffSingular}`);
            }
          },
        },
      ],
    );
  };

  const styles = useMemo(() => createStyles(theme), [theme]);
  const filteredBarbers = useMemo(() => {
    if (accessFilter === "enabled") {
      return barbers.filter(barber => barber.loginAccess?.enabled);
    }

    if (accessFilter === "disabled") {
      return barbers.filter(barber => !barber.loginAccess?.enabled);
    }

    return barbers;
  }, [accessFilter, barbers]);

  const handleSwipeableOpen = (barberId: string) => {
    const previousId = openedSwipeableIdRef.current;
    if (previousId && previousId !== barberId) {
      swipeableRefs.current[previousId]?.close();
    }
    openedSwipeableIdRef.current = barberId;
  };

  const renderRightActions = (barber: Barber) => (
    <Pressable
      style={styles.deleteSwipeAction}
      onPress={() => {
        swipeableRefs.current[barber._id]?.close();
        handleDeleteBarber(barber);
      }}
    >
      <Trash2 color="#fff" size={18} />
      <Text style={styles.deleteSwipeText}>Eliminar</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
            />
          }
        >
          <View style={styles.header}>
            <Image style={styles.logo} source={theme.logo} />
            <Text style={[styles.headerSubtitle, { color: theme.primary }]}>EQUIPO PROFESIONAL</Text>
            <Text style={styles.headerTitle}>{businessCopy.staffPluralCapitalized}</Text>
          </View>

          <View style={styles.mainCard}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.filterRow}>
              <Pressable
                onPress={() => setAccessFilter("all")}
                style={[
                  styles.filterChip,
                  accessFilter === "all" && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    accessFilter === "all" && styles.filterChipTextActive,
                  ]}
                >
                  Todos
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAccessFilter("enabled")}
                style={[
                  styles.filterChip,
                  accessFilter === "enabled" && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    accessFilter === "enabled" && styles.filterChipTextActive,
                  ]}
                >
                  Con acceso
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAccessFilter("disabled")}
                style={[
                  styles.filterChip,
                  accessFilter === "disabled" && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    accessFilter === "disabled" && styles.filterChipTextActive,
                  ]}
                >
                  Sin acceso
                </Text>
              </Pressable>
            </View>

            {loading && !barbers.length ? (
              <ActivityIndicator color={theme.primary} style={{ marginVertical: 40 }} />
            ) : (
              <View style={styles.listContainer}>
                {filteredBarbers.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>
                      {`No hay ${businessCopy.staffPlural} para ese filtro`}
                    </Text>
                    <Text style={styles.emptyStateText}>
                      {`Probá ver todos o cargá credenciales desde editar ${businessCopy.staffSingular}.`}
                    </Text>
                  </View>
                ) : filteredBarbers.map((barber) => {
                  const accessStatus = resolveAccessStatus(barber);

                  return (
                    <Swipeable
                      key={barber._id}
                      ref={ref => {
                        swipeableRefs.current[barber._id] = ref;
                      }}
                      renderRightActions={() => renderRightActions(barber)}
                      overshootRight={false}
                      rightThreshold={36}
                      onSwipeableOpen={() => handleSwipeableOpen(barber._id)}
                      onSwipeableClose={() => {
                        if (openedSwipeableIdRef.current === barber._id) {
                          openedSwipeableIdRef.current = null;
                        }
                      }}
                    >
                      <View style={styles.barberItem}>
                        <View style={styles.barberMainAction}>
                          <View style={styles.barberInfo}>
                            <View style={styles.avatarCircle}>
                              {barber.photoUrl ? (
                                <Image
                                  source={{ uri: barber.photoUrl }}
                                  style={styles.avatarImage}
                                />
                              ) : (
                                <Text style={styles.avatarText}>
                                  {barber.fullName.charAt(0).toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.barberName} numberOfLines={1}>
                                {barber.fullName}
                              </Text>
                              <View style={styles.accessMetaRow}>
                                <View
                                  style={[
                                    styles.statusBadge,
                                    accessStatus.variant === "active"
                                      ? styles.statusBadgeActive
                                      : accessStatus.variant === "pending"
                                        ? styles.statusBadgePending
                                        : styles.statusBadgeDisabled,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.statusBadgeText,
                                      accessStatus.variant === "active"
                                        ? styles.statusBadgeTextActive
                                        : accessStatus.variant === "pending"
                                          ? styles.statusBadgeTextPending
                                          : styles.statusBadgeTextDisabled,
                                    ]}
                                  >
                                    {accessStatus.label}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.accessChip,
                                    barber.loginAccess?.enabled
                                      ? styles.accessChipEnabled
                                      : styles.accessChipDisabled,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.accessChipText,
                                      barber.loginAccess?.enabled
                                        ? styles.accessChipTextEnabled
                                        : styles.accessChipTextDisabled,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {barber.loginAccess?.enabled
                                      ? barber.loginAccess?.email || 'Con acceso'
                                      : 'Sin credenciales'}
                                  </Text>
                                </View>
                              </View>
                              {barber.loginAccess?.enabled ? (
                                <Text style={styles.lastAccessText}>
                                  Último acceso: {formatLastAccess(barber.loginAccess?.lastLoginAt)}
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          <View style={styles.barberActions}>
                            <Pressable
                              style={({ pressed }) => [
                                barber.loginAccess?.enabled
                                  ? styles.accessActionBtn
                                  : styles.accessActionBtnPrimary,
                                { opacity: pressed ? 0.7 : 1 },
                              ]}
                              onPress={() => handleManageAccess(barber)}
                            >
                              <Text
                                style={
                                  barber.loginAccess?.enabled
                                    ? styles.accessActionBtnText
                                    : styles.accessActionBtnPrimaryText
                                }
                              >
                                {barber.loginAccess?.enabled
                                  ? "Gestionar acceso"
                                  : "Crear acceso"}
                              </Text>
                            </Pressable>

                            <View style={styles.secondaryActionsRow}>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.editBtn,
                                  { opacity: pressed ? 0.5 : 1 }
                                ]}
                                onPress={() => handleEditBarber(barber)}
                              >
                                <Pencil size={12} color={theme.textMuted} />
                                <Text style={styles.editBtnText}>Editar</Text>
                              </Pressable>

                              <Pressable
                                style={({ pressed }) => [
                                  styles.openBtn,
                                  pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 },
                                ]}
                                onPress={() => handleOpenBarber(barber)}
                              >
                                <Text style={styles.openBtnText}>Abrir panel</Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      </View>
                    </Swipeable>
                  );
                })}
              </View>
            )}

            <Pressable
              style={styles.addBtn}
              onPress={() => navigation.navigate("Register-Employed")}
            >
              <Text style={styles.addBtnText}>
                {`+ Agregar ${businessCopy.staffSingular}`}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: 130 },
    
    header: { 
      marginTop: Platform.OS === 'ios' ? 60 : 20 , 
      paddingHorizontal: 25, 
      alignItems: 'center',
      marginBottom: 20 ,
                                                            
    },
    logo: { width: 50, height: 50, marginBottom: 15, resizeMode: 'contain' },
    headerSubtitle: { 
      color: theme.primary, 
      fontSize: 12, 
      fontWeight: "700", 
      letterSpacing: 2,
      textTransform: 'uppercase'
    },
    headerTitle: { color: theme.textPrimary, fontSize: 32, fontWeight: "800", marginTop: 5 },

    mainCard: { 
      marginHorizontal: 15, 
      backgroundColor: theme.card, 
      borderRadius: 32, 
      padding: 20, 
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.15)
    },
    filterRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap",
    },
    filterChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    filterChipText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    filterChipTextActive: {
      color: theme.textOnPrimary,
    },

    listContainer: { gap: 12 },
    emptyState: {
      borderRadius: 24,
      paddingVertical: 28,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    emptyStateTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: "800",
      textAlign: "center",
    },
    emptyStateText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },

    barberItem: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.mode === 'light' ? 0.05 : 0.18,
      shadowRadius: 18,
      elevation: 2,
    },
    barberMainAction: {
      flexDirection: "column",
      alignItems: "stretch",
      padding: 14,
      gap: 14,
    },
    barberInfo: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    barberActions: {
      gap: 10,
    },
    secondaryActionsRow: {
      flexDirection: "row",
      gap: 10,
    },
    avatarCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    avatarText: {
      color: theme.primary,
      fontSize: 18,
      fontWeight: "800",
    },
    barberName: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: "800",
    },
    accessChip: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      maxWidth: "100%",
    },
    accessChipEnabled: {
      backgroundColor: hexToRgba(theme.primary, 0.14),
      borderColor: hexToRgba(theme.primary, 0.28),
    },
    accessChipDisabled: {
      backgroundColor: hexToRgba(theme.textMuted, 0.12),
      borderColor: hexToRgba(theme.textMuted, 0.22),
    },
    accessChipText: {
      fontSize: 11,
      fontWeight: "700",
    },
    accessChipTextEnabled: {
      color: theme.primary,
    },
    accessChipTextDisabled: {
      color: theme.textMuted,
    },
    accessMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 6,
      alignItems: "center",
    },
    statusBadge: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
    },
    statusBadgeActive: {
      backgroundColor: "rgba(45, 212, 191, 0.12)",
      borderColor: "rgba(45, 212, 191, 0.28)",
    },
    statusBadgePending: {
      backgroundColor: "rgba(250, 204, 21, 0.12)",
      borderColor: "rgba(250, 204, 21, 0.26)",
    },
    statusBadgeDisabled: {
      backgroundColor: "rgba(148, 163, 184, 0.12)",
      borderColor: "rgba(148, 163, 184, 0.24)",
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: "800",
    },
    statusBadgeTextActive: {
      color: "#2DD4BF",
    },
    statusBadgeTextPending: {
      color: "#FACC15",
    },
    statusBadgeTextDisabled: {
      color: theme.textMuted,
    },
    lastAccessText: {
      marginTop: 5,
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "600",
      lineHeight: 16,
    },
    

    // BOTÓN EDITAR (Sutil)
    editBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      flex: 1,
    },
    editBtnText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    accessActionBtn: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.25),
      backgroundColor: hexToRgba(theme.primary, 0.1),
      paddingHorizontal: 14,
      paddingVertical: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    accessActionBtnPrimary: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    accessActionBtnText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: "800",
    },
    accessActionBtnPrimaryText: {
      color: theme.textOnPrimary,
      fontSize: 13,
      fontWeight: "800",
    },

    // BOTÓN ABRIR (Principal)
    openBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
      elevation: 3,
      flex: 1,
    },
    openBtnText: {
      color: theme.textOnPrimary,
      fontSize: 12,
      fontWeight: "800",
    },
 

    deleteSwipeAction: {
      width: 90,
      borderRadius: 24,
      marginLeft: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#d64545",
      gap: 4,
    },
    deleteSwipeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "800",
    },

    addBtn: {
      backgroundColor: "transparent",
      paddingVertical: 16,
      borderRadius: 20,
      marginTop: 25,
      borderWidth: 1.5,
      borderColor: hexToRgba(theme.primary, 0.5),
      alignItems: "center",
    },
    addBtnText: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: "700",
    },
    
    errorText: {
      color: "#ff8080",
      textAlign: "center",
      marginBottom: 15,
      fontWeight: '600'
    },
  });

export default ListBarber;
