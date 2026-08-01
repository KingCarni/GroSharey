import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
    void loadItems();
    void loadSession();
    const channel = supabase.channel(`items:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_items', filter: `list_id=eq.${id}` }, loadItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_sessions', filter: `list_id=eq.${id}` }, loadSession)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  async function loadItems() {
    const { data, error } = await supabase
      .from('grocery_items')
      .select('*')
      .eq('list_id', id)
      .is('deleted_at', null)
      .order('position')
      .order('created_at');
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

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(a.is_completed) - Number(b.is_completed)),
    [items],
  );

  const completedCount = items.filter((item) => item.is_completed).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLink}>‹ Back</Text>
        </Pressable>

        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>SHARED LIST</Text>
            <Text style={styles.title}>Groceries</Text>
            <Text style={styles.summary}>{completedCount} of {items.length} completed</Text>
          </View>
        </View>

        <Pressable style={[styles.shopButton, session && styles.finishButton]} onPress={session ? finishShopping : startShopping}>
          <Text style={styles.shopButtonText}>{session ? 'Finish shopping' : "I'm going shopping"}</Text>
        </Pressable>

        {session && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Shopping mode is live</Text>
            <Text style={styles.bannerText}>Household changes will appear here automatically.</Text>
          </View>
        )}

        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Add milk, bread, apples…"
            placeholderTextColor="#7B8983"
            value={name}
            onChangeText={setName}
            onSubmitEditing={addItem}
            returnKeyType="done"
          />
          <Pressable style={styles.addButton} onPress={addItem}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        <FlatList
          data={sortedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, sortedItems.length === 0 && styles.emptyList]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={(
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Your list is empty</Text>
              <Text style={styles.emptyText}>Add the first item above. Everyone in the household will see it.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable style={[styles.item, item.is_completed && styles.itemCompleted]} onPress={() => toggleItem(item)}>
              <View style={[styles.checkbox, item.is_completed && styles.checkboxDone]}>
                {item.is_completed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.itemBody}>
                <Text style={[styles.itemName, item.is_completed && styles.itemDone]}>{item.name}</Text>
                {!!item.notes && <Text style={styles.itemNotes}>{item.notes}</Text>}
              </View>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  backLink: { color: '#173F35', fontSize: 17, fontWeight: '800', marginBottom: 18 },
  header: { marginBottom: 16 },
  eyebrow: { color: '#6A7A73', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#102C25', fontSize: 34, fontWeight: '800', marginTop: 2 },
  summary: { color: '#66746E', marginTop: 4 },
  shopButton: { backgroundColor: '#173F35', paddingVertical: 15, borderRadius: 16, alignItems: 'center', marginBottom: 14 },
  finishButton: { backgroundColor: '#8B3D2E' },
  shopButtonText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  banner: { backgroundColor: '#E2E9E3', padding: 14, borderRadius: 14, marginBottom: 14 },
  bannerTitle: { color: '#173F35', fontWeight: '800', marginBottom: 2 },
  bannerText: { color: '#52665E' },
  row: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: '#FFF', borderColor: '#D6DED9', borderWidth: 1, borderRadius: 14, color: '#102C25', paddingHorizontal: 14, paddingVertical: 13 },
  addButton: { backgroundColor: '#173F35', borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' },
  addButtonText: { color: '#FFF', fontWeight: '800' },
  list: { paddingVertical: 16, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderColor: '#E2E8E4', borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 9 },
  itemCompleted: { backgroundColor: '#EDF1EE' },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#173F35', marginRight: 13, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: '#173F35' },
  checkmark: { color: '#FFF', fontSize: 16, fontWeight: '900', lineHeight: 18 },
  itemBody: { flex: 1 },
  itemName: { color: '#102C25', fontSize: 17, fontWeight: '700' },
  itemDone: { textDecorationLine: 'line-through', color: '#718078' },
  itemNotes: { color: '#6B7973', marginTop: 3 },
  emptyCard: { backgroundColor: '#E9EFEA', borderRadius: 18, padding: 24, alignItems: 'center' },
  emptyTitle: { color: '#173F35', fontSize: 18, fontWeight: '800', marginBottom: 5 },
  emptyText: { color: '#627069', textAlign: 'center', lineHeight: 20 },
});
