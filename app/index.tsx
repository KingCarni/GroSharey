import { Feather } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AppScreen,
  EmptyState,
  HouseholdCard,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  TextField,
} from '../src/components/ui';
import { useAuth } from '../src/lib/auth';
import { supabase } from '../src/lib/supabase';
import { colors, radii, spacing, type } from '../src/theme';
import type { GroceryList, Household } from '../src/types/database';

export default function HomeScreen() {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [selectedHousehold, setSelectedHousehold] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const loadHouseholds = useCallback(async () => {
    const { data, error } = await supabase
      .from('households')
      .select('*')
      .is('deleted_at', null)
      .order('created_at');
    if (error) {
      setInitialLoading(false);
      return Alert.alert('Could not load households', error.message);
    }
    setHouseholds(data ?? []);
    setSelectedHousehold((current) => current ?? data?.[0]?.id ?? null);
    setInitialLoading(false);
  }, []);

  const loadLists = useCallback(async (householdId: string) => {
    const { data, error } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('created_at');
    if (error) return Alert.alert('Could not load lists', error.message);
    setLists(data ?? []);
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadHouseholds();
    const channel = supabase
      .channel(`households:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_memberships', filter: `user_id=eq.${user.id}` },
        loadHouseholds,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadHouseholds, user]);

  useEffect(() => {
    if (!selectedHousehold) {
      setLists([]);
      return;
    }
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
  }, [loadLists, selectedHousehold]);

  async function createHousehold() {
    if (!householdName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.rpc('create_household', {
      household_name: householdName.trim(),
    });
    setCreating(false);
    if (error) return Alert.alert('Could not create household', error.message);
    setHouseholdName('');
    await loadHouseholds();
    if (typeof data === 'string') setSelectedHousehold(data);
  }

  async function joinHousehold() {
    if (!inviteCode.trim()) return;
    setJoining(true);
    const { data, error } = await supabase.rpc('accept_household_invite', {
      invite_code: inviteCode.trim(),
    });
    setJoining(false);
    if (error) return Alert.alert('Could not join household', error.message);
    setInviteCode('');
    await loadHouseholds();
    if (typeof data === 'string') setSelectedHousehold(data);
    Alert.alert('Household joined', 'You now share lists and shopping updates with this household.');
  }

  const selectedName = useMemo(
    () => households.find((item) => item.id === selectedHousehold)?.name ?? '',
    [households, selectedHousehold],
  );

  if (initialLoading) {
    return (
      <AppScreen>
        <LoadingState label="Loading your households" />
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll padded={false} contentContainerStyle={styles.scroll}>
      <View style={styles.headerRow}>
        <View style={styles.brand}>
          <Image
            source={require('../Assets/Favicon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.eyebrow}>GROSHAREY</Text>
            <Text style={styles.title}>Your households</Text>
          </View>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => supabase.auth.signOut()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          testID="sign-out-button"
        >
          <Feather name="log-out" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {households.length > 0 && (
        <FlatList
          horizontal
          data={households}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.householdList}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => {
            const active = selectedHousehold === item.id;
            return (
              <View style={{ marginRight: spacing.md }}>
                <HouseholdCard
                  name={item.name}
                  meta={active ? `${lists.length} shared ${lists.length === 1 ? 'list' : 'lists'}` : 'Tap to open'}
                  active={active}
                  onPress={() => setSelectedHousehold(item.id)}
                  testID={`household-card-${item.id}`}
                />
              </View>
            );
          }}
        />
      )}

      {selectedHousehold ? (
        <>
          <View style={styles.section}>
            <SectionHeader
              eyebrow={selectedName.toUpperCase()}
              title="Shared lists"
              trailing={
                <Link
                  href={{ pathname: '/household/[id]', params: { id: selectedHousehold } }}
                  style={styles.manageLink}
                >
                  Manage
                </Link>
              }
            />
            {lists.length === 0 ? (
              <EmptyState
                icon="shopping-cart"
                title="No lists yet"
                body="Create your first shared grocery list from household management."
              />
            ) : (
              lists.map((item) => (
                <Link
                  key={item.id}
                  href={{ pathname: '/list/[id]', params: { id: item.id } }}
                  asChild
                >
                  <Pressable
                    style={({ pressed }) => [styles.listCard, pressed && styles.listCardPressed]}
                    testID={`list-card-${item.id}`}
                  >
                    <View style={styles.listIcon}>
                      <Feather name="shopping-cart" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.listSub}>Open shared grocery list</Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.subtle} />
                  </Pressable>
                </Link>
              ))
            )}
          </View>

          <View style={styles.quickSection}>
            <SectionHeader eyebrow="HOUSEHOLD" title="Stay connected" />
            <View style={styles.quickGrid}>
              <Link href={{ pathname: '/household/[id]/chat', params: { id: selectedHousehold } }} asChild>
                <Pressable style={({ pressed }) => [styles.quickCard, pressed && styles.listCardPressed]}>
                  <View style={styles.quickIcon}>
                    <Feather name="message-circle" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.quickTitle}>Chat</Text>
                  <Text style={styles.quickSub}>Message everyone in this household</Text>
                  <Feather name="chevron-right" size={18} color={colors.subtle} />
                </Pressable>
              </Link>

              <Link href={{ pathname: '/household/[id]/receipts', params: { id: selectedHousehold } }} asChild>
                <Pressable style={({ pressed }) => [styles.quickCard, pressed && styles.listCardPressed]}>
                  <View style={styles.quickIcon}>
                    <Feather name="file-text" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.quickTitle}>Receipts</Text>
                  <Text style={styles.quickSub}>Capture, review and track spending</Text>
                  <Feather name="chevron-right" size={18} color={colors.subtle} />
                </Pressable>
              </Link>
            </View>
          </View>
        </>
      ) : (
        <EmptyState
          icon="users"
          title="Create or join a household"
          body="Use an invite code from another GroSharey user, or start a fresh household below."
          tone="warm"
        />
      )}

      <View style={styles.actionCard}>
        <SectionHeader eyebrow="HOUSEHOLD" title="Add or join a household" />
        <TextField
          placeholder="Household name"
          leftIcon="home"
          value={householdName}
          onChangeText={setHouseholdName}
          returnKeyType="done"
          onSubmitEditing={createHousehold}
          testID="new-household-input"
        />
        <PrimaryButton
          label="Create household"
          icon="plus"
          onPress={createHousehold}
          loading={creating}
          disabled={!householdName.trim()}
          testID="create-household-btn"
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextField
          placeholder="Invite code"
          leftIcon="key"
          autoCapitalize="characters"
          value={inviteCode}
          onChangeText={setInviteCode}
          returnKeyType="done"
          onSubmitEditing={joinHousehold}
          testID="join-household-input"
        />
        <SecondaryButton
          label="Join with invite code"
          icon="user-plus"
          variant="outline"
          onPress={joinHousehold}
          loading={joining}
          disabled={!inviteCode.trim()}
          testID="join-household-btn"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  logo: { width: 40, height: 40, borderRadius: radii.md },
  eyebrow: { ...type.eyebrow, color: colors.primary, marginBottom: 2 },
  title: { ...type.h1 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: { opacity: 0.7 },
  householdList: { paddingVertical: spacing.sm, paddingRight: spacing.xl },
  section: { marginTop: spacing.sm, marginBottom: spacing.xl },
  quickSection: { marginBottom: spacing.xl },
  manageLink: { ...type.button, color: colors.primary },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  dividerText: { ...type.caption, color: colors.subtle, letterSpacing: 1.5 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  listCardPressed: { opacity: 0.85 },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTitle: { ...type.h3, color: colors.ink, fontSize: 16 },
  listSub: { ...type.caption, marginTop: 2 },
  quickGrid: { gap: spacing.sm },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: { ...type.h3, color: colors.ink, minWidth: 74 },
  quickSub: { ...type.caption, flex: 1 },
});
