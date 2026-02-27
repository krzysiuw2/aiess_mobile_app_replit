import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';

export default function NotFoundScreen() {
  const { t } = useSettings();
  return (
    <>
      <Stack.Screen options={{ title: t.notFound.oops }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t.notFound.pageNotFound}</Text>
        <Text style={styles.text}>{t.notFound.screenNotExist}</Text>
        <Link href="/(tabs)/devices" style={styles.link}>
          <Text style={styles.linkText}>{t.notFound.goHome}</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  text: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  link: {
    marginTop: 16,
    paddingVertical: 15,
    paddingHorizontal: 30,
    backgroundColor: Colors.primary,
    borderRadius: 25,
  },
  linkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
