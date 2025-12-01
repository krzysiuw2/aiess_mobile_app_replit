import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Page Not Found</Text>
        <Text style={styles.text}>This screen doesn&apos;t exist.</Text>
        <Link href="/(tabs)/devices" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
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
