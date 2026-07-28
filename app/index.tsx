import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const extra = Constants.expoConfig?.extra ?? {};
const appEnv = typeof extra.appEnv === 'string' ? extra.appEnv : 'development';
const buildVersion = Constants.expoConfig?.version ?? '0.1.0';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>GRO-5 · GRO-6</Text>
        <Text style={styles.title}>GroSharey</Text>
        <Text style={styles.subtitle}>
          Shared grocery planning is getting started.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Build information</Text>
          <Text style={styles.cardText}>Environment: {appEnv}</Text>
          <Text style={styles.cardText}>Version: {buildVersion}</Text>
        </View>

        <Text style={styles.footer}>
          This starter screen confirms the app shell, routing, metadata, and APK configuration are wired up.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7F2',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  cardText: {
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    fontSize: 14,
    lineHeight: 21,
  },
});
