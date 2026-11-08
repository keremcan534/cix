// Gender chip and agency / Aile pills shared by the Profil tab and the user profile screen.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { AGENCIES, ROLE_LABEL, agencyOf, type AgencyRole } from '@/data/agency';
import { findKabile, KABILE_ROUTES } from '@/data/kabile';
import type { User } from '@/data/mock';
import { familyOf } from '@/data/profile';
import { shownStaffBadge } from '@/data/rbac';
import { liveMode, toServer } from '@/lib/live';
import { useStaffRole } from '@/lib/live/admin';
import { ROLE_NAME } from '@/lib/live/family';
import { useMyServerAgency } from '@/lib/live/me-stats';
import { useTies } from '@/lib/live/profile';
import { AGENCY_ROLE_TEXT } from '@/lib/me-view';
import { useApp } from '@/store';
import { makeStyles, themes, useTheme } from '@/theme';

// Gender fills carry white text and are the same in both schemes.
export const FEMALE_FILL = themes.dark.semantic.socialFill;
export const MALE_FILL = '#0369A1';

/**
 * Profile spec §2-A: a hidden gender shows only the age to others; the owner still sees it, marked as hidden.
 * The gender is the symbol on its colour (female red, male blue), never the word. An age of 0 is an age nobody
 * entered yet (a new live account): it is left out, not shown as "0".
 */
export function GenderChip({ user, owner }: { user: User; owner?: boolean }) {
  const styles = useStyles();
  const hidden = user.showGender === false;
  const age = user.age > 0 ? user.age : null;
  if (!user.gender || (hidden && !owner)) {
    if (age === null) return null;
    return (
      <View style={[styles.chip, styles.ageChip]} accessibilityLabel={`${age} yaş`}>
        <Text style={[styles.chipText, styles.ageChipText]}>{age}</Text>
      </View>
    );
  }
  const female = user.gender === 'Kadın';
  return (
    <View
      style={[styles.chip, { backgroundColor: female ? FEMALE_FILL : MALE_FILL }, hidden && styles.hiddenChip]}
      accessibilityLabel={`${user.gender}${age === null ? '' : `, ${age} yaş`}${hidden ? ', gizli: yalnızca sen görüyorsun' : ''}`}
    >
      <Ionicons name={female ? 'female' : 'male'} size={12} color="#fff" />
      {age !== null && <Text style={styles.chipText}>{age}</Text>}
      {hidden && <Ionicons name="eye-off" size={12} color="#fff" />}
    </View>
  );
}

export type Affiliation = { emoji?: string; name: string; sub: string; href?: Href };

/**
 * The agency and kabile a user belongs to. Mine come from the store; others' from their public profile.
 * href is set only when the page it opens shows that same agency / kabile (or lets me join it).
 *
 * Live mode: my agency is the server's (lib/live/me-stats, the answer /ajans shows), someone else's agency and
 * anyone's Aile the server's answer for their profile (lib/live/profile useTies); `known` false until they are in.
 */
export function useAffiliations(user: User): { agency: Affiliation | null; kabile: Affiliation | null; known: boolean } {
  const { agencyId, agencyRole, ownedAgency, familyId } = useApp();
  const isMe = user.id === 'me';
  const live = liveMode();
  const server = useMyServerAgency(isMe && live);
  const ties = useTies(live ? toServer(user.id) : null);
  const mineTies = useTies(live && !isMe ? toServer('me') : null);

  if (live) {
    const a = ties?.agency;
    const agency: Affiliation | null = isMe
      ? server
        ? { emoji: '🏢', name: server.name, sub: AGENCY_ROLE_TEXT[server.role], href: '/ajans' }
        : null
      : a
        ? { emoji: '🏢', name: a.name, sub: 'Yayıncı' }
        : null;
    const f = ties?.family;
    // /aile shows my own family; someone else's opens as a preview there (with join), unless it is mine too.
    const kabile: Affiliation | null = f ? { name: f.name, sub: ROLE_NAME[f.role], href: isMe || mineTies?.family?.id === f.id ? '/aile' : `/aile?id=${f.id}` } : null;
    return { agency, kabile, known: (isMe ? server !== undefined : true) && ties !== undefined };
  }

  let agency: Affiliation | null = null;
  if (isMe) {
    if (agencyId === 'own' && ownedAgency) agency = { emoji: '🏢', name: ownedAgency.name, sub: ROLE_LABEL.owner, href: '/ajans' };
    else {
      const a = AGENCIES.find((x) => x.id === agencyId);
      if (a) agency = { emoji: a.logo, name: a.name, sub: ROLE_LABEL[agencyRole ?? 'member'], href: '/ajans' };
    }
  } else {
    const m = agencyOf(user.id);
    if (m) agency = { emoji: m.agency.logo, name: m.agency.name, sub: publicRole(m.role), href: m.agency.id === agencyId ? '/ajans' : undefined };
  }

  const mine = findKabile(familyId);
  const k = isMe ? mine : familyOf(user.id);
  const kabile: Affiliation | null = k && {
    emoji: k.emoji,
    name: k.name,
    sub: [
      'level' in k ? `Lv.${k.level}` : null,
      `${k.members} üye`,
      !isMe && k.leaderId === user.id ? 'Lider' : null,
    ]
      .filter(Boolean)
      .join(' · '),
    // /aile shows my own kabile, or the kabile list when I have none.
    href: isMe || !mine || mine.id === k.id ? KABILE_ROUTES.profile : undefined,
  };
  return { agency, kabile, known: true };
}

/** The staff badge on a profile: in live mode only my own, from my server role; in the demo the local roles. */
export function useStaffBadge(userId: string) {
  const { rbac } = useApp();
  const role = useStaffRole();
  return shownStaffBadge(rbac, userId, liveMode(), role);
}

// Assistants are an internal agency role; publicly they are hosts like everyone else.
const publicRole = (r: AgencyRole) => (r === 'owner' ? ROLE_LABEL.owner : ROLE_LABEL.member);

/** Compact pills under the name. Empty affiliations are hidden for others; the owner gets a soft "join" prompt. */
export function AffiliationPills({ user }: { user: User }) {
  const styles = useStyles();
  const { agency, kabile, known } = useAffiliations(user);
  const isMe = user.id === 'me';
  if (!agency && !kabile && (!isMe || !known)) return null;
  return (
    <View style={styles.pills}>
      {agency ? (
        <Pill icon="business" label={agency.name} emoji={agency.emoji} a11y={`Ajans: ${agency.name}, ${agency.sub}`} href={agency.href} />
      ) : (
        isMe && known && <Pill icon="business" label="Ajans yok · Katıl" empty a11y="Ajans: yok. Ajansa katıl" href="/ajans" />
      )}
      {kabile ? (
        <Pill icon="people" label={kabile.name} emoji={kabile.emoji} a11y={`Aile: ${kabile.name}, ${kabile.sub}`} href={kabile.href} />
      ) : (
        isMe && known && <Pill icon="people" label="Aile yok · Katıl" empty a11y="Aile: yok. Bir aileye katıl" href={KABILE_ROUTES.profile} />
      )}
    </View>
  );
}

function Pill({ icon, emoji, label, a11y, href, empty }: { icon: keyof typeof Ionicons.glyphMap; emoji?: string; label: string; a11y: string; href?: Href; empty?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.pill, empty && styles.emptyPill]}
      onPress={href ? () => router.push(href) : undefined}
      disabled={!href}
      hitSlop={4}
      accessibilityRole={href ? 'button' : undefined}
      accessibilityLabel={a11y}
    >
      <Ionicons name={icon} size={12} color={empty ? colors.textDim : colors.primaryText} />
      {emoji && <Text style={{ fontSize: 12 }}>{emoji}</Text>}
      <Text style={[styles.pillText, empty && { color: colors.textDim, fontWeight: '600' }]} numberOfLines={1}>
        {label}
      </Text>
      {href && !empty && <Ionicons name="chevron-forward" size={12} color={colors.textDim} />}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  hiddenChip: { opacity: 0.6 },
  ageChip: { backgroundColor: colors.cardAlt },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  ageChipText: { color: colors.text },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  emptyPill: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  pillText: { color: colors.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
}));
