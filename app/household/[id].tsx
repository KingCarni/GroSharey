import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import type { GroceryList } from '../../src/types/database';

export default function HouseholdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [listName, setListName] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadLists();
  }, [id]);

  async function loadLists() {
    const { data, error } = await supabase.from('grocery_lists').select('*').eq('household_id', id).is('deleted_at', null).order('created_at');
    if (error) return Alert.alert('Could not load lists', error.message);
    setLists(data ?? []);
  }

  async function createList() {
    if (!listName.trim()) return;
    const { error } = await supabase.from('grocery_lists').insert({ household_id: id, name: listName.trim() });
    if (error) return Alert.alert('Could not create list', error.message);
    setListName('');
    await loadLists();
  }

  async function createInvite() {
    const { data, error } = await supabase.rpc('create_household_invite', { target_household_id: id });
    if (error) return Alert.alert('Could not create invite', error.message);
    setInviteCode(typeof data === 'string' ? data : null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable>
        <Text style={styles.title}>Manage household</Text>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Invite someone</Text>
          <Pressable style={styles.button} onPress={createInvite}><Text style={styles.buttonText}>Generate invite code</Text></Pressable>
          {!!inviteCode && <Text style={styles.code}>{inviteCode}</Text>}
        </View>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Create a list</Text>
          <View style={styles.row}>
            <TextInput style={styles.input} placeholder="Weekly groceries" value={listName} onChangeText={setListName} />
            <Pressable style={styles.button} onPress={createList}><Text style={styles.buttonText}>Create</Text></Pressable>
          </View>
        </View>
        <FlatList
          data={lists}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/list/[id]', params: { id: item.id } }} asChild>
              <Pressable style={styles.card}><Text style={styles.cardTitle}>{item.name}</Text></Pressable>
            </Link>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' }, container: { flex: 1, padding: 20 }, link: { fontWeight: '700', marginBottom: 12 },
  title: { fontSize: 30, fontWeight: '800', marginBottom: 16 }, panel: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 10 }, row: { flexDirection: 'row', gap: 10 }, input: { flex: 1, backgroundColor: '#F4F7F2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  button: { backgroundColor: '#173F35', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#FFF', fontWeight: '700' },
  code: { marginTop: 12, fontSize: 24, fontWeight: '800', letterSpacing: 2, textAlign: 'center' }, card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 8 }, cardTitle: { fontSize: 17, fontWeight: '800' },
});
