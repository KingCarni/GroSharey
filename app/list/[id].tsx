import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AppHeader,
  AppScreen,
  EmptyState,
  GroceryItemRow,
  LoadingState,
  PrimaryButton,
  TextField,
} from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { colors, radii, spacing, type } from '../../src/theme';
import type { GroceryItem, ShoppingSession } from '../../src/types/database';

export default function GroceryListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [name, setName] = useState('');
  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function initial() {
      await Promise.all([loadItems(), loadSession()]);
      if (!cancelled) setInitialLoading(false);
    }
    void initial();
    const channel = supabase.channel(`items:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_items', filter: `list_id=eq.${id}` }, loadItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_sessions', filter: `list_id=eq.${id}` }, loadSession)
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const { data } = await supabase
      .from('shopping_sessions')
      .select('*')
      .eq('list_id', id)
      .eq('status', 'active')
      .maybeSingle();
    setSession(data ?? null);
  }

  async function addItem() {
    if (!name.trim()) return;
    setAdding(true);
    const { error } = await supabase
      .from('grocery_items')
      .insert({ list_id: id, name: name.trim(), position: items.length });
    setAdding(false);
    if (error) return Alert.alert('Could not add item', error.message);
    setName('');
  }

  async function toggleItem(item: GroceryItem) {
    const { error } = await supabase
      .from('grocery_items')
      .update({ is_completed: !item.is_completed })
      .eq('id', item.id);
    if (error) Alert.alert('Could not update item', error.message);
  }

  async function startShopping() {
    setSessionBusy(true);
    const { error } = await supabase.rpc('start_shopping_session', {
      shopping_list_id: id,
      store: null,
    });
    setSessionBusy(false);
    if (error) return Alert.alert('Could not start shopping', error.message);
    await loadSession();
  }

  async function finishShopping() {
    if (!session) return;
    setSessionBusy(true);
    const { error } = await supabase.rpc('finish_shopping_session', {
      session_id: session.id,
    });
    setSessionBusy(false);
    if (error) return Alert.alert('Could not finish shopping', error.message);
    await loadSession();
  }

  // Active items on top, completed pushed to the bottom while preserving stored order.
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(a.is_completed) - Number(b.is_completed)),
    [items],
  );

  const completedCount = items.filter((item) => item.is_completed).length;
  const progress = items.length ? completedCount / items.length : 0;

  if (initialLoading) {
    return (
      <AppScreen>
        <LoadingState label="Loading list" />
      </AppScreen>
    );
  }

  return (
    <AppScreen keyboard padded={false}>
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <AppHeader
            title="Groceries"
            eyebrow="SHARED LIST"
            onBack={() => router.back()}
            compact
          />
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {completedCount}/{items.length}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={session ? finishShopping : startShopping}
          disabled={sessionBusy}
          style={({ pressed }) => [
            styles.shopButton,
            session ? styles.shopButtonActive : styles.shopButtonIdle,
            pressed && styles.shopButtonPressed,
            sessionBusy && { opacity: 0.6 },
          ]}
          testID={session ? 'finish-shopping-btn' : 'start-shopping-btn'}
        >
          <Feather
            name={session ? 'check-circle' : 'shopping-bag'}
            size={18}
            color={colors.onPrimary}
          />
          <View style={styles.shopButtonText}>
            <Text style={styles.shopTitle}>
              {session ? 'Finish shopping' : "I\u2019m going shopping"}
            </Text>
            <Text style={styles.shopSub}>
              {session
                ? 'Wrap up this trip and sync totals'
                : 'Notify your household you\u2019re on the way'}
            </Text>
          </View>
          <Feather
            name={session ? 'x-circle' : 'arrow-right'}
            size={18}
            color={colors.onPrimary}
          />
        </Pressable>

        <View style={styles.addRow}>
          <TextField
            containerStyle={styles.addField}
            placeholder="Add milk, bread, apples…"
            leftIcon="plus"
            value={name}
            onChangeText={setName}
            onSubmitEditing={addItem}
            returnKeyType="done"
            testID="add-item-input"
          />
          <PrimaryButton
            label="Add"
            onPress={addItem}
            loading={adding}
            disabled={!name.trim()}
            fullWidth={false}
            style={styles.addButton}
            testID="add-item-btn"
          />
        </View>

        <FlatList
          data={sortedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            sortedItems.length === 0 && styles.emptyList,
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard"
              title="Your list is empty"
              body="Add the first item above. Everyone in the household will see it in real time."
            />
          }
          renderItem={({ item }) => (
            <GroceryItemRow
              item={item}
              onToggle={toggleItem}
              testID={`grocery-item-${item.id}`}
            />
          )}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  headerBlock: { marginBottom: spacing.md },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressLabel: {
    ...type.caption,
    color: colors.muted,
    fontFamily: 'Manrope_600SemiBold',
  },

  shopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  shopButtonIdle: { backgroundColor: colors.primary },
  shopButtonActive: { backgroundColor: colors.accent },
  shopButtonPressed: { opacity: 0.9 },
  shopButtonText: { flex: 1 },
  shopTitle: {
    ...type.h3,
    color: colors.onPrimary,
    fontSize: 16,
  },
  shopSub: {
    ...type.bodySmall,
    color: 'rgba(247,244,234,0.75)',
    marginTop: 2,
  },

  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  addField: { flex: 1, marginBottom: 0 },
  addButton: {
    minHeight: 52,
    borderRadius: radii.lg,
    marginTop: 0,
  },

  list: { paddingVertical: spacing.md, paddingBottom: spacing.xxxl },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
});
