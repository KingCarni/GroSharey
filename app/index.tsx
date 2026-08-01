import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [inviteCode, setInviteCode] = useState('');
  const [selectedHousehold, setSelectedHousehold] = useState<string | null>(null);

  const loadHouseholds = useCallback(async () => {
    const { data, error } = await supabase.from('households').select('*').is('deleted_at', null).order('created_at');
    if (error) return Alert.alert('Could not load households', error.message);
    setHouseholds(data ?? []);
    setSelectedHousehold((current) => current ?? data?.[0]?.id ?? null);
  }, []);

  const loadLists = useCallback(async (householdId: string) => {
    const { data, error } = await supabase.from('grocery_lists').select('*').eq('household_id', householdId).is('deleted_at', null).order('created_at');
    if (error) return Alert.alert('Could not load lists', error.message);
    setLists(data ?? []);
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadHouseholds();
    const channel = supabase
      .channel(`households:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_memberships', filter: `user_id=eq.${user.id}` }, loadHouseholds)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadHouseholds, user]);

  useEffect(() => {
    if (!selectedHousehold) return;
    void loadLists(selectedHousehold);
    const channel = supabase
      .channel(`lists:${selectedHousehold}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_lists', filter: `household_id=eq.${selectedHousehold}` }, () => loadLists(selectedHousehold))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadLists, selectedHousehold]);

  async function createHousehold() {
    if (!householdName.trim()) return;
    const { data, error } = await supabase.rpc('create_household', { household_name: householdName.trim() });
    if (error) return Alert.alert('Could not create household', error.message);
    setHouseholdName('');
    await loadHouseholds();
    if (typeof data === 'string') setSelectedHousehold(data);
  }

  async function joinHousehold() {
    if (!inviteCode.trim()) return;
    const { data, error } = await supabase.rpc('accept_household_invite', { invite_code: inviteCode.trim() });
    if (error) return Alert.alert('Could not join household', error.message);
    setInviteCode('');
    await loadHouseholds();
    if (typeof data === 'string') setSelectedHousehold(data);
    Alert.alert('Household joined', 'You now share lists and shopping updates with this household.');
  }

  const selectedName = useMemo(() => households.find((item) => item.id === selectedHousehold)?.name ?? '', [households, selectedHousehold]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Image source={require('../Assets/Favicon.png')} style={styles.logo} />
            <View><Text style={styles.eyebrow}>GROSHAREY</Text><Text style={styles.title}>Your households</Text></View>
          </View>
          <Pressable onPress={() => supabase.auth.signOut()}><Text style={styles.linkText}>Sign out</Text></Pressable>
        </View>

        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Household name" placeholderTextColor="#7B8983" value={householdName} onChangeText={setHouseholdName} onSubmitEditing={createHousehold} />
          <Pressable style={styles.button} onPress={createHousehold}><Text style={styles.buttonText}>Create</Text></Pressable>
        </View>
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Invite code" placeholderTextColor="#7B8983" autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode} onSubmitEditing={joinHousehold} />
          <Pressable style={styles.secondaryButton} onPress={joinHousehold}><Text style={styles.secondaryButtonText}>Join</Text></Pressable>
        </View>

        <FlatList horizontal data={households} keyExtractor={(item) => item.id} contentContainerStyle={styles.householdList} showsHorizontalScrollIndicator={false} renderItem={({ item }) => {
          const active = selectedHousehold === item.id;
          return <Pressable onPress={() => setSelectedHousehold(item.id)} style={[styles.householdCard, active && styles.householdCardActive]}>
            <Text style={[styles.householdLabel, active && styles.activeText]}>HOUSEHOLD</Text>
            <Text style={[styles.householdName, active && styles.activeText]}>{item.name}</Text>
            <Text style={[styles.householdMeta, active && styles.activeMeta]}>{active ? `${lists.length} shared ${lists.length === 1 ? 'list' : 'lists'}` : 'Tap to open'}</Text>
          </Pressable>;
        }} />

        {selectedHousehold ? <View style={styles.section}>
          <View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>{selectedName.toUpperCase()}</Text><Text style={styles.sectionTitle}>Shared lists</Text></View>
            <Link href={{ pathname: '/household/[id]', params: { id: selectedHousehold } }} style={styles.linkText}>Manage</Link></View>
          <FlatList data={lists} keyExtractor={(item) => item.id} ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>No lists yet</Text><Text style={styles.emptyText}>Create one from household management.</Text></View>} renderItem={({ item }) => (
            <Link href={{ pathname: '/list/[id]', params: { id: item.id } }} asChild><Pressable style={styles.card}><Text style={styles.cardIcon}>🛒</Text><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.cardText}>Open shared grocery list</Text></View><Text style={styles.chevron}>›</Text></Pressable></Link>
          )} />
        </View> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Create or join a household</Text><Text style={styles.emptyText}>Use an invite code from another GroSharey user to join theirs.</Text></View>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' }, container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }, logo: { width: 44, height: 44, borderRadius: 12 },
  eyebrow: { color: '#173F35', fontSize: 11, fontWeight: '900', letterSpacing: 1.8 }, title: { color: '#102C25', fontSize: 28, fontWeight: '800' }, linkText: { color: '#173F35', fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 }, input: { flex: 1, backgroundColor: '#FFF', borderColor: '#D6DED9', borderWidth: 1, borderRadius: 14, color: '#102C25', paddingHorizontal: 14, paddingVertical: 13 },
  button: { backgroundColor: '#173F35', borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' }, buttonText: { color: '#FFF', fontWeight: '800' }, secondaryButton: { borderColor: '#173F35', borderWidth: 1, borderRadius: 14, paddingHorizontal: 20, justifyContent: 'center' }, secondaryButtonText: { color: '#173F35', fontWeight: '800' },
  householdList: { gap: 10, paddingVertical: 10 }, householdCard: { width: 180, minHeight: 112, backgroundColor: '#E4EBE5', borderRadius: 20, padding: 16, justifyContent: 'space-between' }, householdCardActive: { backgroundColor: '#173F35' }, householdLabel: { color: '#597067', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, householdName: { color: '#173F35', fontSize: 19, fontWeight: '800' }, householdMeta: { color: '#597067', fontSize: 13 }, activeText: { color: '#FFF' }, activeMeta: { color: '#DDEAE4' },
  section: { flex: 1, marginTop: 8 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }, sectionEyebrow: { color: '#6B7A74', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 }, sectionTitle: { color: '#102C25', fontSize: 24, fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 18, padding: 16, marginBottom: 10, borderColor: '#E2E8E4', borderWidth: 1 }, cardIcon: { fontSize: 22, marginRight: 12 }, cardTitle: { color: '#102C25', fontSize: 18, fontWeight: '800' }, cardText: { color: '#63716B', marginTop: 3 }, chevron: { color: '#173F35', fontSize: 28 },
  emptyCard: { backgroundColor: '#E9EFEA', borderRadius: 18, padding: 22, alignItems: 'center' }, emptyTitle: { color: '#173F35', fontSize: 18, fontWeight: '800', marginBottom: 4 }, emptyText: { color: '#627069', textAlign: 'center', lineHeight: 20 },
});
