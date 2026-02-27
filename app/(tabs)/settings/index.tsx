import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Building2,
  SlidersHorizontal,
  User,
  Smartphone,
  ChevronRight,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';

interface MenuCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onPress: () => void;
}

function MenuCard({ icon, title, description, onPress }: MenuCardProps) {
  return (
    <TouchableOpacity style={styles.menuCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuCardIcon}>{icon}</View>
      <View style={styles.menuCardContent}>
        <Text style={styles.menuCardTitle}>{title}</Text>
        <Text style={styles.menuCardDescription}>{description}</Text>
      </View>
      <ChevronRight size={20} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

export default function SettingsMenuScreen() {
  const { t } = useSettings();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.settings.title}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <MenuCard
          icon={<Building2 size={24} color={Colors.primary} />}
          title="Site Settings"
          description="Device info, safety limits, site limits"
          onPress={() => router.push('/(tabs)/settings/site')}
        />
        <MenuCard
          icon={<SlidersHorizontal size={24} color={Colors.primary} />}
          title="System Settings"
          description="Operating mode"
          onPress={() => router.push('/(tabs)/settings/system')}
        />
        <MenuCard
          icon={<User size={24} color={Colors.primary} />}
          title="Account Settings"
          description="Profile, sign out"
          onPress={() => router.push('/(tabs)/settings/account')}
        />
        <MenuCard
          icon={<Smartphone size={24} color={Colors.primary} />}
          title="App Settings"
          description="Language, preferences"
          onPress={() => router.push('/(tabs)/settings/app-settings')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCardContent: {
    flex: 1,
    marginLeft: 14,
  },
  menuCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  menuCardDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
