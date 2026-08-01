import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
    void loadHouseholds();
  }, [user]);

  useEffect(() => {
    if (!selectedHousehold) return;
    void loadLists(selectedHousehold);
    const channel = supabase
      .channel(`lists:${selectedHousehold}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grocery_lists', filter: `household_id=eq.${selectedHousehold}` },
        () => loadLists(selectedHousehold),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedHousehold]);

  async function loadHouseholds() {
    const { data, error } = await supabase.from('households').select('*').is('deleted_at', null).order('created_at');
    if (error) return Alert.alert('Could not load households', error.message);
    setHouseholds(data ?? []);
    if (!selectedHousehold && data?.[0]) setSelectedHousehold(data[0].id);
  }

  async function loadLists(householdId: string) {
    const { data, error } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('created_at');
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

  const selectedHouseholdName = useMemo(
    () => households.find((household) => household.id === selectedHousehold)?.name ?? '',
    [households, selectedHousehold],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Image source={require('../Assets/Favicon.png')} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.eyebrow}>GROSHAREY</Text>
              <Text style={styles.title}>Your households</Text>
            </View>
          </View>
          <Pressable onPress={() => supabase.auth.signOut()}>
            <Text style={styles.linkText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Household name"
            placeholderTextColor="#7B8983"
            value={householdName}
            onChangeText={setHouseholdName}
            onSubmitEditing={createHousehold}
            returnKeyType="done"
          />
          <Pressable style={styles.button} onPress={createHousehold}>
            <Text style={styles.buttonText}>Create</Text>
          </Pressable>
        </View>

        <FlatList
          horizontal
          data={households}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.householdList}
          showsHorizontalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.emptyInline}>No households yet.</Text>}
          renderItem={({ item }) => {
            const active = selectedHousehold === item.id;
            const listCount = active ? lists.length : 0;
            return (
              <Pressable onPress={() => setSelectedHousehold(item.id)} style={[styles.householdCard, active && styles.householdCardActive]}>
                <Text style={[styles.householdLabel, active && styles.householdLabelActive]}>HOUSEHOLD</Text>
                <Text style={[styles.householdName, active && styles.householdNameActive]} numberOfLines={2}>{item.name}</Text>
                <Text style={[styles.householdMeta, active && styles.householdMetaActive]}>
                  {active ? `${listCount} shared ${listCount === 1 ? 'list' : 'lists'}` : 'Tap to open'}
                </Text>
              </Pressable>
            );
          }}
        />

        {selectedHousehold ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>{selectedHouseholdName.toUpperCase()}</Text>
                <Text style={styles.sectionTitle}>Shared lists</Text>
              </View>
              <Link href={{ pathname: '/household/[id]', params: { id: selectedHousehold } }} style={styles.linkText}>
                Manage
              </Link>
            </View>
            <FlatList
              data={lists}
              keyExtractor={(item) => item.id}
              contentContainerStyle={lists.length === 0 ? styles.emptyListContainer : undefined}
              ListEmptyComponent={(
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No lists yet</Text>
                  <Text style={styles.emptyText}>Create one from household management.</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <Link href={{ pathname: '/list/[id]', params: { id: item.id } }} asChild>
                  <Pressable style={styles.card}>
                    <View style={styles.cardIcon}><Text style={styles.cardIconText}>🛒</Text></View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.cardText}>Open shared grocery list</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                </Link>
              )}
            />
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Create your first household</Text>
            <Text style={styles.emptyText}>Start by naming the household you share groceries with.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' },
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  logo: { width: 44, height: 44, borderRadius: 12 },
  eyebrow: { color: '#173F35', fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: '#102C25', fontSize: 30, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: '#FFF', borderColor: '#D6DED9', borderWidth: 1, borderRadius: 14, color: '#102C25', paddingHorizontal: 14, paddingVertical: 13 },
  button: { backgroundColor: '#173F35', borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' },
  buttonText: { color: '#FFF', fontWeight: '800' },
  householdList: { gap: 10, paddingVertical: 18 },
  householdCard: { width: 180, minHeight: 116, backgroundColor: '#E4EBE5', borderRadius: 20, padding: 16, justifyContent: 'space-between' },
  householdCardActive: { backgroundColor: '#173F35' },
  householdLabel: { color: '#597067', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  householdLabelActive: { color: '#CFE1D8' },
  householdName: { color: '#173F35', fontSize: 19, fontWeight: '800' },
  householdNameActive: { color: '#FFF' },
  householdMeta: { color: '#597067', fontSize: 13 },
  householdMetaActive: { color: '#DDEAE4' },
  section: { flex: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  sectionEyebrow: { color: '#6B7A74', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  sectionTitle: { color: '#102C25', fontSize: 24, fontWeight: '800' },
  linkText: { fontWeight: '800', color: '#173F35' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 18, padding: 16, marginBottom: 10, borderColor: '#E2E8E4', borderWidth: 1 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#E8EFEA', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardIconText: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitle: { color: '#102C25', fontSize: 18, fontWeight: '800' },
  cardText: { color: '#63716B', marginTop: 3 },
  chevron: { color: '#173F35', fontSize: 28, marginLeft: 8 },
  emptyListContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyCard: { backgroundColor: '#E9EFEA', borderRadius: 18, padding: 22, alignItems: 'center' },
  emptyTitle: { color: '#173F35', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  emptyText: { color: '#627069', textAlign: 'center', lineHeight: 20 },
  emptyInline: { color: '#627069', paddingVertical: 16 },
});
