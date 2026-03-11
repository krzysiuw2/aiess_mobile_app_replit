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
import { Eye, EyeOff } from 'lucide-react-native';
import AiessLogo from '@/components/AiessLogo';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useAppleAuth } from '@/hooks/useAppleAuth';

const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

export default function SignupScreen() {
  const { signup, isSignupLoading, isAuthenticated } = useAuth();
  const { signInWithGoogle, isLoading: isGoogleLoading, isConfigured: isGoogleConfigured } = useGoogleAuth();
  const { signInWithApple, isLoading: isAppleLoading, isAvailable: isAppleAvailable } = useAppleAuth();
  const { t } = useSettings();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRetypePassword, setShowRetypePassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)/devices');
    }
  }, [isAuthenticated]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSignup = async () => {
    if (!email.trim()) {
      Alert.alert(t.common.error, t.auth.enterEmail);
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert(t.common.error, t.auth.validEmail);
      return;
    }

    if (!password) {
      Alert.alert(t.common.error, t.auth.enterAPassword);
      return;
    }

    if (password.length < 6) {
      Alert.alert(t.common.error, t.auth.passwordMin6);
      return;
    }

    if (!retypePassword) {
      Alert.alert(t.common.error, t.auth.confirmPassword);
      return;
    }

    if (password !== retypePassword) {
      Alert.alert(t.common.error, t.auth.passwordsNoMatch);
      return;
    }

    try {
      const result = await signup(email.trim(), password);

      if (result?.user && !result?.session) {
        Alert.alert(
          t.auth.checkYourEmail,
          t.auth.confirmEmailSent,
          [
            {
              text: t.common.ok,
              onPress: () => router.replace('/(auth)/login'),
            },
          ]
        );
      } else {
        router.replace('/(tabs)/devices');
      }
    } catch (error: any) {
      let errorMessage = t.auth.signupFailed;
      
      if (error?.message) {
        if (error.message.includes('User already registered')) {
          errorMessage = t.auth.accountExists;
        } else if (error.message.includes('Password should be at least')) {
          errorMessage = t.auth.passwordTooShort;
        } else if (error.message.includes('Unable to validate email')) {
          errorMessage = t.auth.invalidEmailFormat;
        } else if (error.message.includes('Signups not allowed')) {
          errorMessage = t.auth.signupsDisabled;
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

          <Text style={styles.title}>{t.auth.createAccount}</Text>
          <Text style={styles.subtitle}>{t.auth.signUpSubtitle}</Text>

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
                  autoComplete="new-password"
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
              <Text style={styles.passwordHint}>{t.auth.minPasswordLength}</Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>{t.auth.retypePassword}</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••••"
                  placeholderTextColor={Colors.textLight}
                  value={retypePassword}
                  onChangeText={setRetypePassword}
                  secureTextEntry={!showRetypePassword}
                  autoComplete="new-password"
                  testID="retype-password-input"
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowRetypePassword(!showRetypePassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
              style={[styles.signUpButton, isSignupLoading && styles.buttonDisabled]}
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

            {showSocialDivider && (
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>{t.auth.orSignUpWith}</Text>
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
                  <Text style={styles.googleButtonText}>{t.auth.signUpWithGoogle}</Text>
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
                  <Text style={styles.appleButtonText}>{t.auth.signUpWithApple}</Text>
                )}
              </TouchableOpacity>
            )}

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
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
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
  passwordHint: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 6,
    marginLeft: 4,
  },
  signUpButton: {
    backgroundColor: Colors.primary,
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signUpButtonText: {
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
