// Gender chip and agency / kabile pills shared by the Profil tab and the user profile screen.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { AGENCIES, ROLE_LABEL, agencyOf, type AgencyRole } from '@/data/agency';
import { findKabile, KABILE_ROUTES } from '@/data/kabile';
import type { User } from '@/data/mock';
import { familyOf } from '@/data/profile';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

export const FEMALE_FILL = semantic.socialFill;
export const MALE_FILL = '#0369A1';

/** Profile spec §2-A: a hidden gender shows only the age to others; the owner still sees it, marked as hidden. */
export function GenderChip({ user, owner }: { user: User; owner?: boolean }) {
  const hidden = user.showGender === false;
  if (!user.gender || (hidden && !owner)) {
    return (
      <View style={[styles.chip, { backgroundColor: colors.cardAlt }]} accessibilityLabel={`${user.age} yaş`}>
        <Text style={styles.chipText}>{user.age}</Text>
      </View>
    );
  }
  const female = user.gender === 'Kadın';
  return (
    <View
      style={[styles.chip, { backgroundColor: female ? FEMALE_FILL : MALE_FILL }, hidden && styles.hiddenChip]}
      accessibilityLabel={`${user.gender}, ${user.age} yaş${hidden ? ', gizli: yalnızca sen görüyorsun' : ''}`}
    >
      <Ionicons name={female ? 'female' : 'male'} size={12} color="#fff" />
      <Text style={styles.chipText}>
        {user.gender} · {user.age}
      </Text>
      {hidden && <Ionicons name="eye-off" size={12} color="#fff" />}
    </View>
  );
}

export type Affiliation = { emoji: string; name: string; sub: string; href?: Href };

/**
 * The agency and kabile a user belongs to. Mine come from the store; others' from their public profile.
 * href is set only when the page it opens shows that same agency / kabile (or lets me join it).
 */
export function useAffiliations(user: User): { agency: Affiliation | null; kabile: Affiliation | null } {
  const { agencyId, agencyRole, ownedAgency, familyId } = useApp();
  const isMe = user.id === 'me';

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
  return { agency, kabile };
}

// Assistants are an internal agency role; publicly they are hosts like everyone else.
const publicRole = (r: AgencyRole) => (r === 'owner' ? ROLE_LABEL.owner : ROLE_LABEL.member);

/** Compact pills under the name. Empty affiliations are hidden for others; the owner gets a soft "join" prompt. */
export function AffiliationPills({ user }: { user: User }) {
  const { agency, kabile } = useAffiliations(user);
  const isMe = user.id === 'me';
  if (!agency && !kabile && !isMe) return null;
  return (
    <View style={styles.pills}>
      {agency ? (
        <Pill icon="business" label={agency.name} emoji={agency.emoji} a11y={`Ajans: ${agency.name}, ${agency.sub}`} href={agency.href} />
      ) : (
        isMe && <Pill icon="business" label="Ajans yok · Katıl" empty a11y="Ajans: yok. Ajansa katıl" href="/ajans" />
      )}
      {kabile ? (
        <Pill icon="people" label={kabile.name} emoji={kabile.emoji} a11y={`Kabile: ${kabile.name}, ${kabile.sub}`} href={kabile.href} />
      ) : (
        isMe && <Pill icon="people" label="Kabile yok · Katıl" empty a11y="Kabile: yok. Kabileye katıl" href={KABILE_ROUTES.profile} />
      )}
    </View>
  );
}

function Pill({ icon, emoji, label, a11y, href, empty }: { icon: keyof typeof Ionicons.glyphMap; emoji?: string; label: string; a11y: string; href?: Href; empty?: boolean }) {
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

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  hiddenChip: { opacity: 0.6 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  emptyPill: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
