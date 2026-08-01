import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import type { GroceryList } from '../../src/types/database';

type Invite = { id: string; code: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };
type Member = { id: string; role: 'owner' | 'member'; profiles: { display_name: string | null } | null };

export default function HouseholdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [listName, setListName] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const loadHousehold = useCallback(async () => {
    if (!id) return;
    const [listResult, memberResult, inviteResult] = await Promise.all([
      supabase.from('grocery_lists').select('*').eq('household_id', id).is('deleted_at', null).order('created_at'),
      supabase.from('household_memberships').select('id, role, profiles(display_name)').eq('household_id', id).eq('status', 'active').order('created_at'),
      supabase.from('household_invites').select('id, code, expires_at, accepted_at, revoked_at').eq('household_id', id).is('accepted_at', null).is('revoked_at', null).order('created_at', { ascending: false }),
    ]);
    const error = listResult.error ?? memberResult.error ?? inviteResult.error;
    if (error) return Alert.alert('Could not load household', error.message);
    setLists(listResult.data ?? []);
    setMembers((memberResult.data ?? []) as unknown as Member[]);
    setInvites(inviteResult.data ?? []);
  }, [id]);

  useEffect(() => {
    void loadHousehold();
    if (!id) return;
    const channel = supabase.channel(`household:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_lists', filter: `household_id=eq.${id}` }, loadHousehold)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_memberships', filter: `household_id=eq.${id}` }, loadHousehold)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_invites', filter: `household_id=eq.${id}` }, loadHousehold)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, loadHousehold]);

  async function createList() {
    if (!listName.trim()) return;
    const { error } = await supabase.from('grocery_lists').insert({ household_id: id, name: listName.trim() });
    if (error) return Alert.alert('Could not create list', error.message);
    setListName('');
  }

  async function createInvite() {
    const { data, error } = await supabase.rpc('create_household_invite', { target_household_id: id });
    if (error) return Alert.alert('Could not create invite', error.message);
    const code = typeof data === 'string' ? data : null;
    setInviteCode(code);
    await loadHousehold();
    if (code) await Share.share({ message: `Join my GroSharey household with invite code: ${code}` });
  }

  async function shareInvite(code: string) {
    await Share.share({ message: `Join my GroSharey household with invite code: ${code}` });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={<>
          <Pressable onPress={() => router.back()}><Text style={styles.link}>‹ Back</Text></Pressable>
          <Text style={styles.title}>Manage household</Text>
          <View style={styles.panel}>
            <View style={styles.panelHeader}><Text style={styles.sectionTitle}>Members</Text><Text style={styles.meta}>{members.length} active</Text></View>
            {members.map((member) => <View key={member.id} style={styles.memberRow}><Text style={styles.memberName}>{member.profiles?.display_name || 'GroSharey member'}</Text><Text style={styles.role}>{member.role}</Text></View>)}
          </View>
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Invite someone</Text>
            <Text style={styles.help}>Codes expire after seven days and can be used once.</Text>
            <Pressable style={styles.button} onPress={createInvite}><Text style={styles.buttonText}>Create and share invite</Text></Pressable>
            {!!inviteCode && <Text style={styles.code}>{inviteCode}</Text>}
            {invites.map((invite) => <Pressable key={invite.id} style={styles.inviteRow} onPress={() => shareInvite(invite.code)}><View><Text style={styles.inviteCode}>{invite.code}</Text><Text style={styles.meta}>Expires {new Date(invite.expires_at).toLocaleDateString()}</Text></View><Text style={styles.link}>Share</Text></Pressable>)}
          </View>
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Create a list</Text>
            <View style={styles.row}><TextInput style={styles.input} placeholder="Weekly groceries" placeholderTextColor="#7B8983" value={listName} onChangeText={setListName} onSubmitEditing={createList} /><Pressable style={styles.button} onPress={createList}><Text style={styles.buttonText}>Create</Text></Pressable></View>
          </View>
          <Text style={styles.listHeading}>Shared lists</Text>
        </>}
        ListEmptyComponent={<Text style={styles.empty}>No lists yet.</Text>}
        renderItem={({ item }) => <Link href={{ pathname: '/list/[id]', params: { id: item.id } }} asChild><Pressable style={styles.card}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.chevron}>›</Text></Pressable></Link>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' }, container: { padding: 20, paddingBottom: 40 }, link: { color: '#173F35', fontWeight: '800', marginBottom: 12 }, title: { color: '#102C25', fontSize: 30, fontWeight: '800', marginBottom: 16 },
  panel: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, marginBottom: 12, borderColor: '#E2E8E4', borderWidth: 1 }, panelHeader: { flexDirection: 'row', justifyContent: 'space-between' }, sectionTitle: { color: '#102C25', fontSize: 18, fontWeight: '800', marginBottom: 8 }, help: { color: '#627069', marginBottom: 12 }, meta: { color: '#718078', fontSize: 12 },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopColor: '#EDF1EE', borderTopWidth: 1 }, memberName: { color: '#102C25', fontWeight: '700' }, role: { color: '#597067', textTransform: 'capitalize' },
  row: { flexDirection: 'row', gap: 10 }, input: { flex: 1, backgroundColor: '#F4F7F2', color: '#102C25', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }, button: { backgroundColor: '#173F35', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#FFF', fontWeight: '800' },
  code: { marginTop: 12, fontSize: 24, fontWeight: '900', letterSpacing: 2, textAlign: 'center', color: '#173F35' }, inviteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopColor: '#EDF1EE', borderTopWidth: 1 }, inviteCode: { color: '#173F35', fontSize: 17, fontWeight: '900', letterSpacing: 1.5 },
  listHeading: { color: '#102C25', fontSize: 22, fontWeight: '800', marginVertical: 10 }, card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 8 }, cardTitle: { color: '#102C25', fontSize: 17, fontWeight: '800' }, chevron: { color: '#173F35', fontSize: 26 }, empty: { color: '#627069', textAlign: 'center', padding: 24 },
});
