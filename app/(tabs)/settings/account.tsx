import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, LogOut, User, Trash2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';

export default function AccountSettingsScreen() {
  const { t } = useSettings();
  const { logout, deleteAccount, isDeletingAccount } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const confirmWord = t.settings.deleteAccountConfirmPlaceholder;

  const handleLogout = async () => {
    Alert.alert(
      t.settings.logOut,
      t.settings.logOutConfirm,
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

  const handleDeleteAccount = () => {
    Alert.alert(
      t.settings.deleteAccountTitle,
      t.settings.deleteAccountWarning,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.confirm,
          style: 'destructive',
          onPress: () => setShowDeleteConfirm(true),
        },
      ]
    );
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmText !== confirmWord) return;

    try {
      await deleteAccount();
      Alert.alert(t.common.success, t.settings.deleteAccountSuccess);
      router.replace('/(auth)/login');
    } catch (e: any) {
      Alert.alert(t.common.error, t.settings.deleteAccountFailed);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.settings.accountSettings}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <TouchableOpacity style={styles.menuItem}>
            <User size={20} color={Colors.textSecondary} />
            <Text style={styles.menuItemText}>{t.settings.editProfile}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={20} color={Colors.error} />
            <Text style={styles.logoutButtonText}>{t.settings.logOut}</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <Text style={styles.dangerTitle}>{t.settings.dangerZone}</Text>

          {!showDeleteConfirm ? (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteAccount}
              disabled={isDeletingAccount}
            >
              <Trash2 size={20} color="#fff" />
              <Text style={styles.deleteButtonText}>{t.settings.deleteAccount}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.deleteConfirmBox}>
              <Text style={styles.deleteConfirmLabel}>
                {t.settings.deleteAccountConfirmPrompt}
              </Text>
              <TextInput
                style={styles.deleteConfirmInput}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder={confirmWord}
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isDeletingAccount}
              />
              <View style={styles.deleteConfirmActions}>
                <TouchableOpacity
                  style={styles.cancelConfirmButton}
                  onPress={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  disabled={isDeletingAccount}
                >
                  <Text style={styles.cancelConfirmText}>{t.common.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.confirmDeleteButton,
                    deleteConfirmText !== confirmWord && styles.confirmDeleteButtonDisabled,
                  ]}
                  onPress={handleConfirmDelete}
                  disabled={deleteConfirmText !== confirmWord || isDeletingAccount}
                >
                  {isDeletingAccount ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmDeleteText}>{t.settings.deleteAccount}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    gap: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.text,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  logoutButtonText: {
    fontSize: 16,
    color: Colors.error,
    fontWeight: '500',
  },
  dangerSection: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239, 68, 68, 0.2)',
    paddingTop: 20,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: Colors.error,
    borderRadius: 12,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  deleteConfirmBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    padding: 16,
    gap: 12,
  },
  deleteConfirmLabel: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  deleteConfirmInput: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '700',
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelConfirmText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  confirmDeleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: 'center',
  },
  confirmDeleteButtonDisabled: {
    opacity: 0.4,
  },
  confirmDeleteText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
});
