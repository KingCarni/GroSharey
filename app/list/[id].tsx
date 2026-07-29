import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import type { GroceryItem, ShoppingSession } from '../../src/types/database';

export default function GroceryListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [name, setName] = useState('');
  const [session, setSession] = useState<ShoppingSession | null>(null);

  useEffect(() => {
    if (!id) return;
    loadItems();
    loadSession();
    const channel = supabase.channel(`items:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_items', filter: `list_id=eq.${id}` }, loadItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_sessions', filter: `list_id=eq.${id}` }, loadSession)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  async function loadItems() {
    const { data, error } = await supabase.from('grocery_items').select('*').eq('list_id', id).is('deleted_at', null).order('position').order('created_at');
    if (error) return Alert.alert('Could not load items', error.message);
    setItems(data ?? []);
  }

  async function loadSession() {
    const { data } = await supabase.from('shopping_sessions').select('*').eq('list_id', id).eq('status', 'active').maybeSingle();
    setSession(data ?? null);
  }

  async function addItem() {
    if (!name.trim()) return;
    const { error } = await supabase.from('grocery_items').insert({ list_id: id, name: name.trim(), position: items.length });
    if (error) return Alert.alert('Could not add item', error.message);
    setName('');
  }

  async function toggleItem(item: GroceryItem) {
    const { error } = await supabase.from('grocery_items').update({ is_completed: !item.is_completed }).eq('id', item.id);
    if (error) Alert.alert('Could not update item', error.message);
  }

  async function startShopping() {
    const { error } = await supabase.rpc('start_shopping_session', { shopping_list_id: id, store: null });
    if (error) return Alert.alert('Could not start shopping', error.message);
    await loadSession();
  }

  async function finishShopping() {
    if (!session) return;
    const { error } = await supabase.rpc('finish_shopping_session', { session_id: session.id });
    if (error) return Alert.alert('Could not finish shopping', error.message);
    await loadSession();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable>
        <View style={styles.header}>
          <Text style={styles.title}>Shared grocery list</Text>
          <Pressable style={[styles.shopButton, session && styles.finishButton]} onPress={session ? finishShopping : startShopping}>
            <Text style={styles.shopButtonText}>{session ? 'Finish shopping' : "I'm going shopping"}</Text>
          </Pressable>
        </View>
        {session && <Text style={styles.banner}>Shopping session is active. New items will appear live.</Text>}
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Add an item" value={name} onChangeText={setName} onSubmitEditing={addItem} />
          <Pressable style={styles.addButton} onPress={addItem}><Text style={styles.addButtonText}>Add</Text></Pressable>
        </View>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No items yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.item} onPress={() => toggleItem(item)}>
              <View style={[styles.checkbox, item.is_completed && styles.checkboxDone]} />
              <View style={styles.itemBody}>
                <Text style={[styles.itemName, item.is_completed && styles.itemDone]}>{item.name}</Text>
                {!!item.notes && <Text>{item.notes}</Text>}
              </View>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' }, container: { flex: 1, padding: 20 }, link: { fontWeight: '700', marginBottom: 12 },
  header: { gap: 12, marginBottom: 12 }, title: { fontSize: 30, fontWeight: '800' }, shopButton: { backgroundColor: '#173F35', padding: 14, borderRadius: 14, alignItems: 'center' },
  finishButton: { backgroundColor: '#8B3D2E' }, shopButtonText: { color: '#FFF', fontWeight: '800' }, banner: { backgroundColor: '#E2E9E3', padding: 12, borderRadius: 12, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 }, input: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  addButton: { backgroundColor: '#173F35', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' }, addButtonText: { color: '#FFF', fontWeight: '700' },
  list: { paddingVertical: 14 }, item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 15, marginBottom: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#173F35', marginRight: 12 }, checkboxDone: { backgroundColor: '#173F35' },
  itemBody: { flex: 1 }, itemName: { fontSize: 17, fontWeight: '700' }, itemDone: { textDecorationLine: 'line-through', opacity: 0.5 }, empty: { textAlign: 'center', padding: 24 },
});
