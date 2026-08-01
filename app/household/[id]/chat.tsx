import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  AppHeader,
  AppScreen,
  EmptyState,
  LoadingState,
  MessageBubble,
  TextField,
} from '../../../src/components/ui';
import { useAuth } from '../../../src/lib/auth';
import { supabase } from '../../../src/lib/supabase';
import { colors, radii, spacing } from '../../../src/theme';

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
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function initial() {
      await loadMessages();
      if (!cancelled) setInitialLoading(false);
    }
    void initial();
    const channel = supabase
      .channel(`household-chat:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_messages', filter: `household_id=eq.${id}` }, loadMessages)
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto scroll to newest message whenever the list changes.
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [messages]);

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
    setSending(true);
    const { error } = await supabase
      .from('household_messages')
      .insert({ household_id: id, body: text });
    setSending(false);
    if (error) return Alert.alert('Could not send message', error.message);
    setBody('');
  }

  if (initialLoading) {
    return (
      <AppScreen>
        <LoadingState label="Loading chat" />
      </AppScreen>
    );
  }

  return (
    <AppScreen keyboard padded={false}>
      <View style={styles.header}>
        <AppHeader
          title="Household chat"
          eyebrow="TALK IT OVER"
          onBack={() => router.back()}
          compact
        />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={
          messages.length === 0 ? styles.emptyList : styles.listContent
        }
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
        ListEmptyComponent={
          <EmptyState
            icon="message-circle"
            title="No messages yet"
            body="Say hello to your household — everyone will see it instantly."
          />
        }
        renderItem={({ item, index }) => {
          const mine = item.sender_id === user?.id;
          const prev = index > 0 ? messages[index - 1] : null;
          const showSender = !prev || prev.sender_id !== item.sender_id;
          return (
            <MessageBubble
              body={item.body}
              mine={mine}
              senderLabel={mine ? 'You' : item.profiles?.display_name ?? 'Household member'}
              showSender={showSender}
              timestamp={new Date(item.created_at).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
            />
          );
        }}
      />

      <View style={styles.composer}>
        <TextField
          containerStyle={styles.composerInput}
          placeholder="Message your household"
          value={body}
          onChangeText={setBody}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          multiline
        />
        <Pressable
          onPress={sendMessage}
          disabled={sending || !body.trim()}
          hitSlop={6}
          style={({ pressed }) => [
            styles.sendButton,
            (sending || !body.trim()) && styles.sendDisabled,
            pressed && !sending && styles.sendPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          testID="send-message-btn"
        >
          <Feather name="send" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
  },
  composerInput: { flex: 1, marginBottom: 0 },
  sendButton: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPressed: { backgroundColor: colors.primaryDark },
  sendDisabled: { opacity: 0.5 },
});
