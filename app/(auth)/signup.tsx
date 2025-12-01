import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import AiessLogo from '@/components/AiessLogo';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';

export default function SignupScreen() {
  const { signup, isSignupLoading } = useAuth();
  const { t } = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRetypePassword, setShowRetypePassword] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !retypePassword) {
      Alert.alert(t.common.error, 'Please fill in all fields');
      return;
    }

    if (password !== retypePassword) {
      Alert.alert(t.common.error, 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert(t.common.error, 'Password must be at least 6 characters');
      return;
    }

    try {
      await signup(email, password);
      console.log('[Signup] Success, navigating to main app');
      router.replace('/(tabs)/devices');
    } catch (error) {
      console.log('[Signup] Error:', error);
      Alert.alert(t.common.error, 'Signup failed. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <AiessLogo size="large" />
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>{t.auth.email}</Text>
              <TextInput
                style={styles.input}
                placeholder="Example@gmail.com"
                placeholderTextColor={Colors.primary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                testID="email-input"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>{t.auth.password}</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••••"
                  placeholderTextColor={Colors.text}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  testID="password-input"
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={Colors.textSecondary} />
                  ) : (
                    <Eye size={20} color={Colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>{t.auth.retypePassword}</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••••"
                  placeholderTextColor={Colors.text}
                  value={retypePassword}
                  onChangeText={setRetypePassword}
                  secureTextEntry={!showRetypePassword}
                  autoComplete="new-password"
                  testID="retype-password-input"
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowRetypePassword(!showRetypePassword)}
                >
                  {showRetypePassword ? (
                    <EyeOff size={20} color={Colors.textSecondary} />
                  ) : (
                    <Eye size={20} color={Colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.signUpButton}
              onPress={handleSignup}
              disabled={isSignupLoading}
              testID="signup-button"
            >
              {isSignupLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.signUpButtonText}>{t.auth.signUp}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.signInContainer}>
              <Text style={styles.signInText}>{t.auth.haveAccount} </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.signInLink}>{t.auth.signIn}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.inputBackground,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -10 }],
  },
  signUpButton: {
    backgroundColor: Colors.primary,
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  signUpButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600' as const,
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  signInLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
});
