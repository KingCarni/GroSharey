import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/lib/auth';
import { supabase } from '../../../src/lib/supabase';

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  profiles: { display_name: string | null } | null;
};

export default function HouseholdChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!id) return;
    void loadMessages();
    const channel = supabase
      .channel(`household-chat:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_messages', filter: `household_id=eq.${id}` }, loadMessages)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  async function loadMessages() {
    const { data, error } = await supabase
      .from('household_messages')
      .select('id, sender_id, body, created_at, profiles!household_messages_sender_id_fkey(display_name)')
      .eq('household_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) return Alert.alert('Could not load chat', error.message);
    setMessages((data ?? []) as unknown as Message[]);
  }

  async function sendMessage() {
    const text = body.trim();
    if (!text) return;
    const { error } = await supabase.from('household_messages').insert({ household_id: id, body: text });
    if (error) return Alert.alert('Could not send message', error.message);
    setBody('');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>Household chat</Text>
        <FlatList
          style={styles.list}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={messages.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello.</Text>}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.message, mine && styles.messageMine]}>
                <Text style={[styles.sender, mine && styles.textMine]}>{mine ? 'You' : item.profiles?.display_name ?? 'Household member'}</Text>
                <Text style={[styles.body, mine && styles.textMine]}>{item.body}</Text>
              </View>
            );
          }}
        />
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Message your household"
            placeholderTextColor="#78857F"
            value={body}
            onChangeText={setBody}
            onSubmitEditing={sendMessage}
          />
          <Pressable style={styles.send} onPress={sendMessage}><Text style={styles.sendText}>Send</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' }, container: { flex: 1, padding: 20 }, back: { color: '#173F35', fontWeight: '800' },
  title: { color: '#102C25', fontSize: 32, fontWeight: '800', marginVertical: 14 }, list: { flex: 1 }, listContent: { paddingVertical: 8 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' }, empty: { color: '#66746E', textAlign: 'center' },
  message: { alignSelf: 'flex-start', maxWidth: '82%', backgroundColor: '#FFF', borderRadius: 18, padding: 13, marginBottom: 10 },
  messageMine: { alignSelf: 'flex-end', backgroundColor: '#173F35' }, sender: { color: '#5D6B65', fontSize: 12, fontWeight: '800', marginBottom: 3 },
  body: { color: '#102C25', fontSize: 16, lineHeight: 21 }, textMine: { color: '#FFF' }, composer: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  input: { flex: 1, backgroundColor: '#FFF', borderColor: '#D6DED9', borderWidth: 1, borderRadius: 14, color: '#102C25', paddingHorizontal: 14, paddingVertical: 12 },
  send: { backgroundColor: '#173F35', borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' }, sendText: { color: '#FFF', fontWeight: '800' },
});
