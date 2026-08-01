import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { ComponentProps, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AppHeader,
  AppScreen,
  EmptyState,
  LoadingState,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  TextField,
} from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { colors, radii, spacing, type } from '../../src/theme';
import type { GroceryList } from '../../src/types/database';

type Invite = { id: string; code: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };
type Member = { id: string; role: 'owner' | 'member'; profiles: { display_name: string | null } | null };
type FeatherName = ComponentProps<typeof Feather>['name'];

export default function HouseholdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [listName, setListName] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);

  const loadHousehold = useCallback(async () => {
    if (!id) return;
    const [listResult, memberResult, inviteResult] = await Promise.all([
      supabase.from('grocery_lists').select('*').eq('household_id', id).is('deleted_at', null).order('created_at'),
      supabase
        .from('household_memberships')
        .select('id, role, profiles(display_name)')
        .eq('household_id', id)
        .eq('status', 'active')
        .order('created_at'),
      supabase
        .from('household_invites')
        .select('id, code, expires_at, accepted_at, revoked_at')
        .eq('household_id', id)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false }),
    ]);
    const error = listResult.error ?? memberResult.error ?? inviteResult.error;
    if (error) {
      setInitialLoading(false);
      return Alert.alert('Could not load household', error.message);
    }
    setLists(listResult.data ?? []);
    setMembers((memberResult.data ?? []) as unknown as Member[]);
    setInvites(inviteResult.data ?? []);
    setInitialLoading(false);
  }, [id]);

  useEffect(() => {
    void loadHousehold();
    if (!id) return;
    const channel = supabase.channel(`household:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_lists', filter: `household_id=eq.${id}` }, loadHousehold)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_memberships', filter: `household_id=eq.${id}` }, loadHousehold)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_invites', filter: `household_id=eq.${id}` }, loadHousehold)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, loadHousehold]);

  async function createList() {
    if (!listName.trim()) return;
    setCreatingList(true);
    const { error } = await supabase.from('grocery_lists').insert({ household_id: id, name: listName.trim() });
    setCreatingList(false);
    if (error) return Alert.alert('Could not create list', error.message);
    setListName('');
  }

  async function createInvite() {
    setCreatingInvite(true);
    const { data, error } = await supabase.rpc('create_household_invite', { target_household_id: id });
    setCreatingInvite(false);
    if (error) return Alert.alert('Could not create invite', error.message);
    const code = typeof data === 'string' ? data : null;
    setInviteCode(code);
    await loadHousehold();
    if (code) await Share.share({ message: `Join my GroSharey household with invite code: ${code}` });
  }

  async function shareInvite(code: string) {
    await Share.share({ message: `Join my GroSharey household with invite code: ${code}` });
  }

  async function copyInvite(code: string) {
    await Clipboard.setStringAsync(code);
    Alert.alert('Invite copied', `${code} is on your clipboard.`);
  }

  if (initialLoading) {
    return (
      <AppScreen>
        <LoadingState label="Loading household" />
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll padded={false} contentContainerStyle={styles.scroll}>
      <AppHeader
        title="Manage household"
        eyebrow="SETTINGS"
        subtitle="Members, invites and shared lists for this household."
        onBack={() => router.back()}
      />

      <View style={styles.tiles}>
        <FeatureTile
          icon="message-circle"
          label="Chat"
          href={{ pathname: '/household/[id]/chat', params: { id } }}
        />
        <FeatureTile
          icon="file-text"
          label="Receipts"
          href={{ pathname: '/household/[id]/receipts', params: { id } }}
        />
        <FeatureTile
          icon="bar-chart-2"
          label="Analytics"
          href={{ pathname: '/household/[id]/analytics', params: { id } }}
        />
      </View>

      <Panel>
        <SectionHeader
          eyebrow="MEMBERS"
          title="People in this household"
          trailing={<Text style={styles.metaSmall}>{members.length} active</Text>}
        />
        {members.length === 0 ? (
          <Text style={styles.muted}>No active members yet.</Text>
        ) : (
          members.map((member, i) => (
            <View
              key={member.id}
              style={[styles.memberRow, i > 0 && styles.memberRowBordered]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(member.profiles?.display_name?.trim().charAt(0) ?? '?').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>
                  {member.profiles?.display_name || 'GroSharey member'}
                </Text>
                <Text style={styles.memberRole}>
                  {member.role === 'owner' ? 'Owner' : 'Member'}
                </Text>
              </View>
              {member.role === 'owner' && (
                <View style={styles.rolePill}>
                  <Feather name="star" size={11} color={colors.accentInk} />
                  <Text style={styles.rolePillText}>Owner</Text>
                </View>
              )}
            </View>
          ))
        )}
      </Panel>

      <Panel>
        <SectionHeader eyebrow="INVITES" title="Invite someone" />
        <Text style={[type.body, { marginBottom: spacing.md }]}>
          Codes expire after seven days and can be used once.
        </Text>
        <PrimaryButton
          label="Create and share invite"
          icon="plus"
          loading={creatingInvite}
          onPress={createInvite}
          testID="create-invite-btn"
        />

        {!!inviteCode && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>NEW INVITE CODE</Text>
            <Text style={styles.codeValue} selectable>{inviteCode}</Text>
            <View style={styles.codeActions}>
              <SecondaryButton
                label="Copy"
                icon="copy"
                variant="soft"
                onPress={() => copyInvite(inviteCode)}
                fullWidth={false}
              />
              <SecondaryButton
                label="Share"
                icon="share-2"
                variant="soft"
                onPress={() => shareInvite(inviteCode)}
                fullWidth={false}
                style={{ marginLeft: spacing.sm }}
              />
            </View>
          </View>
        )}

        {invites.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.subsection}>ACTIVE INVITES</Text>
            {invites.map((invite) => (
              <View key={invite.id} style={styles.inviteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteCode} selectable>{invite.code}</Text>
                  <Text style={styles.metaSmall}>
                    Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </Text>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={() => copyInvite(invite.code)}
                  style={styles.iconAction}
                  accessibilityLabel="Copy invite code"
                >
                  <Feather name="copy" size={16} color={colors.primary} />
                </Pressable>
                <Pressable
                  hitSlop={10}
                  onPress={() => shareInvite(invite.code)}
                  style={styles.iconAction}
                  accessibilityLabel="Share invite code"
                >
                  <Feather name="share-2" size={16} color={colors.primary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Panel>

      <Panel>
        <SectionHeader eyebrow="LISTS" title="Create a new list" />
        <TextField
          placeholder="Weekly groceries"
          leftIcon="edit-3"
          value={listName}
          onChangeText={setListName}
          onSubmitEditing={createList}
          returnKeyType="done"
        />
        <PrimaryButton
          label="Create list"
          icon="plus"
          loading={creatingList}
          disabled={!listName.trim()}
          onPress={createList}
          testID="create-list-btn"
        />
      </Panel>

      <View style={styles.section}>
        <SectionHeader eyebrow="SHARED" title="Shared lists" />
        {lists.length === 0 ? (
          <EmptyState
            icon="shopping-cart"
            title="No shared lists yet"
            body="Create a list above and everyone in the household can start adding items."
          />
        ) : (
          <FlatList
            data={lists}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Link href={{ pathname: '/list/[id]', params: { id: item.id } }} asChild>
                <Pressable
                  style={({ pressed }) => [styles.listCard, pressed && styles.listPressed]}
                >
                  <View style={styles.listIcon}>
                    <Feather name="shopping-cart" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
                  <Feather name="chevron-right" size={20} color={colors.subtle} />
                </Pressable>
              </Link>
            )}
          />
        )}
      </View>
    </AppScreen>
  );
}

function FeatureTile({
  icon,
  label,
  href,
}: {
  icon: FeatherName;
  label: string;
  href: Parameters<typeof Link>[0]['href'];
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      >
        <View style={styles.tileIcon}>
          <Feather name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={styles.tileLabel}>{label}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  tiles: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  tilePressed: { opacity: 0.75 },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  tileLabel: { ...type.button, color: colors.primary, fontSize: 13 },

  metaSmall: { ...type.caption },
  muted: { ...type.body, color: colors.muted },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  memberRowBordered: { borderTopWidth: 1, borderTopColor: colors.hairline },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.h3, color: colors.primary, fontSize: 15 },
  memberName: { ...type.bodyStrong, color: colors.ink },
  memberRole: { ...type.caption },

  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  rolePillText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: colors.accentInk,
    letterSpacing: 0.3,
  },

  subsection: {
    ...type.eyebrow,
    color: colors.muted,
    marginBottom: spacing.sm,
  },

  codeCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.bgWarm,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairlineWarm,
  },
  codeLabel: { ...type.eyebrow, color: colors.accentInk },
  codeValue: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
    letterSpacing: 4,
    color: colors.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  codeActions: { flexDirection: 'row' },

  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  inviteCode: {
    ...type.bodyStrong,
    fontFamily: 'Fraunces_600SemiBold',
    letterSpacing: 2,
    fontSize: 17,
    color: colors.ink,
  },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { marginTop: spacing.sm },
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
  listPressed: { opacity: 0.85 },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listName: { ...type.h3, flex: 1, color: colors.ink, fontSize: 16 },
});
