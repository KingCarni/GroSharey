import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/lib/auth';
import { supabase } from '../src/lib/supabase';
import type { GroceryList, Household } from '../src/types/database';

export default function HomeScreen() {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [householdName, setHouseholdName] = useState('');
  const [selectedHousehold, setSelectedHousehold] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadHouseholds();
  }, [user]);

  useEffect(() => {
    if (!selectedHousehold) return;
    loadLists(selectedHousehold);
    const channel = supabase
      .channel(`lists:${selectedHousehold}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_lists', filter: `household_id=eq.${selectedHousehold}` }, () => loadLists(selectedHousehold))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedHousehold]);

  async function loadHouseholds() {
    const { data, error } = await supabase.from('households').select('*').is('deleted_at', null).order('created_at');
    if (error) return Alert.alert('Could not load households', error.message);
    setHouseholds(data ?? []);
    if (!selectedHousehold && data?.[0]) setSelectedHousehold(data[0].id);
  }

  async function loadLists(householdId: string) {
    const { data, error } = await supabase.from('grocery_lists').select('*').eq('household_id', householdId).is('deleted_at', null).order('created_at');
    if (error) return Alert.alert('Could not load lists', error.message);
    setLists(data ?? []);
  }

  async function createHousehold() {
    if (!householdName.trim()) return;
    const { data, error } = await supabase.rpc('create_household', { household_name: householdName.trim() });
    if (error) return Alert.alert('Could not create household', error.message);
    setHouseholdName('');
    await loadHouseholds();
    if (typeof data === 'string') setSelectedHousehold(data);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>GROSHAREY</Text>
            <Text style={styles.title}>Your households</Text>
          </View>
          <Pressable onPress={() => supabase.auth.signOut()}><Text style={styles.linkText}>Sign out</Text></Pressable>
        </View>

        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Household name" value={householdName} onChangeText={setHouseholdName} />
          <Pressable style={styles.button} onPress={createHousehold}><Text style={styles.buttonText}>Create</Text></Pressable>
        </View>

        <FlatList
          horizontal
          data={households}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.householdList}
          renderItem={({ item }) => (
            <Pressable onPress={() => setSelectedHousehold(item.id)} style={[styles.pill, selectedHousehold === item.id && styles.pillActive]}>
              <Text style={selectedHousehold === item.id ? styles.pillTextActive : styles.pillText}>{item.name}</Text>
            </Pressable>
          )}
        />

        {selectedHousehold ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Shared lists</Text>
              <Link href={{ pathname: '/household/[id]', params: { id: selectedHousehold } }} style={styles.linkText}>Manage household</Link>
            </View>
            <FlatList
              data={lists}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<Text style={styles.empty}>No lists yet. Create one from household management.</Text>}
              renderItem={({ item }) => (
                <Link href={{ pathname: '/list/[id]', params: { id: item.id } }} asChild>
                  <Pressable style={styles.card}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardText}>Open shared grocery list</Text>
                  </Pressable>
                </Link>
              )}
            />
          </View>
        ) : <Text style={styles.empty}>Create your first household to begin.</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' }, container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }, title: { fontSize: 30, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 }, input: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  button: { backgroundColor: '#173F35', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' }, buttonText: { color: '#FFF', fontWeight: '700' },
  householdList: { gap: 8, paddingVertical: 16 }, pill: { paddingHorizontal: 15, paddingVertical: 9, backgroundColor: '#E2E9E3', borderRadius: 999 },
  pillActive: { backgroundColor: '#173F35' }, pillText: { fontWeight: '700' }, pillTextActive: { color: '#FFF', fontWeight: '700' },
  section: { flex: 1 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 22, fontWeight: '800' }, linkText: { fontWeight: '700', color: '#173F35' },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginBottom: 10 }, cardTitle: { fontSize: 18, fontWeight: '800' }, cardText: { marginTop: 4 },
  empty: { paddingVertical: 24, textAlign: 'center' },
});
