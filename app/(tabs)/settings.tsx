import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronDown, LogOut } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDevices } from '@/contexts/DeviceContext';
import { languageOptions } from '@/locales';
import { Language } from '@/types';

export default function SettingsScreen() {
  const { t, language, setLanguage, settings, setSiteLimits } = useSettings();
  const { logout } = useAuth();
  const { selectedDevice } = useDevices();
  
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [highThreshold, setHighThreshold] = useState(
    settings.highThreshold?.toString() || ''
  );
  const [lowThreshold, setLowThreshold] = useState(
    settings.lowThreshold?.toString() || ''
  );

  const handleLanguageChange = (lang: Language) => {
    console.log('[Settings] Changing language to:', lang);
    setLanguage(lang);
    setShowLanguageDropdown(false);
  };

  const handleSaveLimits = () => {
    const high = highThreshold ? parseFloat(highThreshold) : null;
    const low = lowThreshold ? parseFloat(lowThreshold) : null;
    setSiteLimits(high, low);
    Alert.alert('Success', 'Site limits saved successfully');
  };

  const handleLogout = async () => {
    Alert.alert(
      t.settings.logOut,
      'Are you sure you want to log out?',
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.settings.logOut,
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const currentLanguageLabel = languageOptions.find(l => l.value === language)?.label || 'English';

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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.settings.language}</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowLanguageDropdown(!showLanguageDropdown)}
          >
            <Text style={styles.dropdownText}>{currentLanguageLabel}</Text>
            <ChevronDown size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          
          {showLanguageDropdown && (
            <View style={styles.dropdownMenu}>
              {languageOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.dropdownItem,
                    language === option.value && styles.dropdownItemActive,
                  ]}
                  onPress={() => handleLanguageChange(option.value)}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      language === option.value && styles.dropdownItemTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.settings.siteLimits}</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.highThreshold}</Text>
            <TextInput
              style={styles.textInput}
              value={highThreshold}
              onChangeText={setHighThreshold}
              placeholder="e.g., 100"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.settings.lowThreshold}</Text>
            <TextInput
              style={styles.textInput}
              value={lowThreshold}
              onChangeText={setLowThreshold}
              placeholder="e.g., -50"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSaveLimits}>
            <Text style={styles.saveButtonText}>{t.common.save}</Text>
          </TouchableOpacity>
        </View>

        {selectedDevice && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.settings.deviceInfo}</Text>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t.settings.deviceName}</Text>
              <Text style={styles.infoValue}>{selectedDevice.name}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t.settings.siteId}</Text>
              <Text style={styles.infoValue}>{selectedDevice.device_id}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t.settings.location}</Text>
              <Text style={styles.infoValue}>{selectedDevice.location || '-'}</Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.settings.account}</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>{t.settings.editProfile}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={20} color={Colors.error} />
            <Text style={styles.logoutButtonText}>{t.settings.logOut}</Text>
          </TouchableOpacity>
        </View>
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
    fontWeight: '600' as const,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownText: {
    fontSize: 16,
    color: Colors.text,
  },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  dropdownItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemText: {
    fontSize: 16,
    color: Colors.text,
  },
  dropdownItemTextActive: {
    color: Colors.primary,
    fontWeight: '500' as const,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  menuItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.text,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  logoutButtonText: {
    fontSize: 16,
    color: Colors.error,
    fontWeight: '500' as const,
  },
});
