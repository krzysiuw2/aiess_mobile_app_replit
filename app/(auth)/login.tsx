import React, { useState, useEffect } from 'react';
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
import { Check, Eye, EyeOff } from 'lucide-react-native';
import AiessLogo from '@/components/AiessLogo';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAppleAuth } from '@/hooks/useAppleAuth';

const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

export default function LoginScreen() {
  const { login, resetPassword, isLoginLoading, isAuthenticated } = useAuth();
  const { signInWithGoogle, isLoading: isGoogleLoading, isConfigured: isGoogleConfigured } = useGoogleAuth();
  const { signInWithApple, isLoading: isAppleLoading, isAvailable: isAppleAvailable } = useAppleAuth();
  const { t } = useSettings();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)/devices');
    }
  }, [isAuthenticated]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert(t.common.error, t.auth.enterEmail);
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert(t.common.error, t.auth.validEmail);
      return;
    }

    if (!password) {
      Alert.alert(t.common.error, t.auth.enterPassword);
      return;
    }

    if (password.length < 6) {
      Alert.alert(t.common.error, t.auth.passwordMin6);
      return;
    }
    
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/devices');
    } catch (error: any) {
      let errorMessage = t.auth.loginFailed;
      
      if (error?.message) {
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = t.auth.invalidCredentials;
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = t.auth.emailNotConfirmed;
        } else if (error.message.includes('Too many requests')) {
          errorMessage = t.auth.tooManyAttempts;
        } else {
          errorMessage = error.message;
        }
      }
      
      Alert.alert(t.common.error, errorMessage);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error?.code === 'SIGN_IN_CANCELLED') return;
      Alert.alert(t.common.error, error?.message || t.auth.googleSignInFailed);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      await signInWithApple();
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert(t.common.error, error?.message || t.auth.appleSignInFailed);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert(
        t.auth.resetPassword,
        t.auth.resetPasswordHint,
      );
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert(t.common.error, t.auth.validEmail);
      return;
    }

    try {
      await resetPassword(email.trim());
      Alert.alert(
        t.auth.checkYourEmail,
        t.auth.resetEmailSent,
      );
    } catch (error: any) {
      Alert.alert(t.common.error, error?.message || t.auth.failedResetEmail);
    }
  };

  const showGoogleButton = isNativePlatform && isGoogleConfigured;
  const showAppleButton = Platform.OS === 'ios' && isAppleAvailable;
  const showSocialDivider = showGoogleButton || showAppleButton;
  const isSocialLoading = isGoogleLoading || isAppleLoading;

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
                placeholder={t.auth.emailPlaceholder}
                placeholderTextColor={Colors.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                testID="email-input"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>{t.auth.password}</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••••"
                  placeholderTextColor={Colors.textLight}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  testID="password-input"
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={Colors.textSecondary} />
                  ) : (
                    <Eye size={20} color={Colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.rememberContainer}
                onPress={() => setRememberMe(!rememberMe)}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && <Check size={14} color="#fff" />}
                </View>
                <Text style={styles.rememberText}>{t.auth.rememberMe}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>{t.auth.forgotPassword}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.signInButton, isLoginLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoginLoading}
              testID="login-button"
            >
              {isLoginLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.signInButtonText}>{t.auth.signIn}</Text>
              )}
            </TouchableOpacity>

            {showSocialDivider && (
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>{t.auth.orSignInWith}</Text>
                <View style={styles.divider} />
              </View>
            )}

            {showGoogleButton && (
              <TouchableOpacity
                style={[styles.googleButton, isSocialLoading && styles.buttonDisabled]}
                onPress={handleGoogleSignIn}
                disabled={isSocialLoading}
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <Text style={styles.googleButtonText}>{t.auth.signInWithGoogle}</Text>
                )}
              </TouchableOpacity>
            )}

            {showAppleButton && (
              <TouchableOpacity
                style={[styles.appleButton, isSocialLoading && styles.buttonDisabled]}
                onPress={handleAppleSignIn}
                disabled={isSocialLoading}
              >
                {isAppleLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.appleButtonText}>{t.auth.signInWithApple}</Text>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.signUpContainer}>
              <Text style={styles.signUpText}>{t.auth.noAccount} </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
                <Text style={styles.signUpLink}>{t.auth.signUp}</Text>
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
    marginBottom: 40,
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
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  rememberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
  },
  rememberText: {
    fontSize: 14,
    color: Colors.text,
  },
  forgotText: {
    fontSize: 14,
    color: Colors.primary,
  },
  signInButton: {
    backgroundColor: Colors.primary,
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600' as const,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  googleButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  googleButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '500' as const,
  },
  appleButton: {
    backgroundColor: '#000',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  appleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500' as const,
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  signUpLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
});
