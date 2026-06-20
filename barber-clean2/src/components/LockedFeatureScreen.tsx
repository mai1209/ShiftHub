import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Lock } from 'lucide-react-native';
import type { Theme } from '../context/ThemeContext';

type Props = {
  theme: Theme;
  title: string;
  body: string;
  navigation: any;
};

export default function LockedFeatureScreen({ theme, title, body, navigation }: Props) {
  const styles = createStyles(theme);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Lock size={26} color={theme.textSecondary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Pressable
          style={styles.button}
          onPress={() =>
            navigation.navigate(Platform.OS === 'ios' ? 'Subscription-Settings' : 'Plans')
          }
        >
          <Text style={styles.buttonText}>Ver opciones de upgrade</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 20,
      paddingBottom: 130,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      alignItems: 'center',
      gap: 14,
    },
    iconWrap: {
      width: 58,
      height: 58,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(57, 224, 31, 0.12)',
    },
    title: {
      color: theme.textPrimary,
      fontSize: 22,
      fontWeight: '900',
      textAlign: 'center',
    },
    body: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    button: {
      marginTop: 6,
      borderRadius: 16,
      backgroundColor: theme.primary,
      paddingVertical: 14,
      paddingHorizontal: 18,
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    buttonText: {
      color: theme.textOnPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
  });
}
