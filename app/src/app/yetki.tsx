import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { ROOMS, USERS } from '@/data/mock';
import {
  PERMISSIONS,
  REGIONS,
  SCOPE_LABEL,
  maxPriority,
  permLabel,
  resolve,
  roleSpec,
  scopeName,
  userName,
  type PermissionKey,
  type RbacState,
  type Role,
  type Scope,
  type ScopeType,
} from '@/data/rbac';
import { pct } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

type Tab = 'roles' | 'assign' | 'check' | 'mod' | 'commission' | 'audit' | 'model';
const TABS: [Tab, string][] = [
  ['roles', 'Roller'],
  ['assign', 'Atamalar'],
  ['check', 'Yetki kontrolü'],
  ['mod', 'Moderasyon'],
  ['commission', 'Komisyon'],
  ['audit', 'Denetim'],
  ['model', 'Veri modeli'],
];
const PLATFORM: Scope = { type: 'platform' };
const clock = () => new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const rid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const ACTORS = ['me', 'u2', 'u5', 'u9'];
const SCOPE_TYPES: ScopeType[] = ['platform', 'region', 'agency', 'room'];

/** Log an attempt and return the decision for the acting admin. */
function guard(state: RbacState, actor: string, perm: PermissionKey, target: Scope, action: string, targetLabel: string) {
  const d = resolve(state, actor, perm, target);
  const entry = { id: rid(), at: clock(), actor: userName(actor), action, target: targetLabel, result: d.allowed ? ('Uygulandı' as const) : ('Reddedildi' as const), after: d.reason };
  return { d, entry };
}

export default function RoleCenter() {
  const { rbac, updateRbac } = useApp();
  const [tab, setTab] = useState<Tab>('roles');
  const [actor, setActor] = useState('me');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Rol ve Yetki Merkezi" />
      <View style={styles.actorBar}>
        <Ionicons name="person-circle-outline" size={18} color={colors.gold} />
        <Text style={styles.dim}>İşlem yapan:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {ACTORS.map((a) => (
            <Chip key={a} on={actor === a} label={`${userName(a)} · ${rbac.userRoles.filter((u) => u.userId === a).map((u) => rbac.roles.find((r) => r.id === u.roleId)?.name).join('+') || 'rolsüz'}`} onPress={() => setActor(a)} />
          ))}
        </ScrollView>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }} style={{ flexGrow: 0, flexShrink: 0, minHeight: 52 }}>
        {TABS.map(([k, l]) => (
          <Chip key={k} on={tab === k} label={l} onPress={() => setTab(k)} strong />
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {tab === 'roles' && <Roles rbac={rbac} update={updateRbac} actor={actor} />}
        {tab === 'assign' && <Assignments rbac={rbac} update={updateRbac} actor={actor} />}
        {tab === 'check' && <Checker rbac={rbac} />}
        {tab === 'mod' && <Moderation rbac={rbac} update={updateRbac} actor={actor} />}
        {tab === 'commission' && <Commissions rbac={rbac} update={updateRbac} actor={actor} />}
        {tab === 'audit' && <Audit rbac={rbac} />}
        {tab === 'model' && <DataModel />}
        <Text style={styles.note}>Bu, panel davranışını gösteren bir prototiptir; değişiklikler gerçek sunucuya kaydedilmez. Canlıda her kontrol sunucuda yapılır.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type Props = { rbac: RbacState; update: (fn: (s: RbacState) => RbacState) => void; actor: string };

// --- Roles -----------------------------------------------------------------------
function Roles({ rbac, update, actor }: Props) {
  const [sel, setSel] = useState<string>('bd');
  const role = rbac.roles.find((r) => r.id === sel);
  const [draft, setDraft] = useState<Role | null>(role ? { ...role } : null);
  const [newName, setNewName] = useState('');
  const [spec, setSpec] = useState<string | null>(null);

  const pick = (id: string) => {
    setSel(id);
    const r = rbac.roles.find((x) => x.id === id);
    setDraft(r ? { ...r, permissions: [...r.permissions], denies: [...r.denies], scopeTypes: [...r.scopeTypes] } : null);
  };
  const togglePerm = (k: PermissionKey) =>
    setDraft((d) => (d ? { ...d, permissions: d.permissions.includes(k) ? d.permissions.filter((x) => x !== k) : [...d.permissions, k], denies: d.denies.filter((x) => x !== k) } : d));
  const toggleDeny = (k: PermissionKey) =>
    setDraft((d) => (d ? { ...d, denies: d.denies.includes(k) ? d.denies.filter((x) => x !== k) : [...d.denies, k], permissions: d.permissions.filter((x) => x !== k) } : d));
  const toggleScope = (s: ScopeType) => setDraft((d) => (d ? { ...d, scopeTypes: d.scopeTypes.includes(s) ? d.scopeTypes.filter((x) => x !== s) : [...d.scopeTypes, s] } : d));

  const save = () => {
    if (!draft || !role) return;
    const { d, entry } = guard(rbac, actor, 'roles.edit', PLATFORM, 'Rol güncelleme', draft.name);
    let reason = d.allowed ? '' : d.reason;
    if (!reason && role.protected) reason = `${role.name} korumalı bir roldür; değiştirilemez.`;
    if (!reason && role.priority >= maxPriority(rbac, actor) && actor !== 'me') reason = 'Kendinden yüksek veya eşit öncelikli rolü düzenleyemezsin.';
    const missing = draft.permissions.filter((k) => !resolve(rbac, actor, k, PLATFORM).allowed);
    if (!reason && missing.length) reason = `Sahip olmadığın izni veremezsin: ${missing.map(permLabel).join(', ')}`;
    if (!reason && draft.scopeTypes.length === 0) reason = 'En az bir kapsam seçmelisin.';
    const logged = { ...entry, result: reason ? ('Reddedildi' as const) : ('Uygulandı' as const), before: `${role.permissions.length} izin · ${role.scopeTypes.join('/')}`, after: reason || `${draft.permissions.length} izin · ${draft.scopeTypes.join('/')} · öncelik ${draft.priority}` };
    update((s) => ({ ...s, roles: reason ? s.roles : s.roles.map((r) => (r.id === draft.id ? draft : r)), audit: [logged, ...s.audit] }));
    showAlert(reason ? 'Reddedildi' : 'Kaydedildi', reason || `${draft.name} güncellendi. Değişiklik denetim kaydına yazıldı.`);
  };
  const create = () => {
    const name = newName.trim();
    if (name.length < 2) return showAlert('Rol adı en az 2 karakter olmalı');
    const { d, entry } = guard(rbac, actor, 'roles.create', PLATFORM, 'Rol oluşturma', name);
    const role: Role = { id: `custom-${rid()}`, name, permissions: [], denies: [], scopeTypes: ['region'], priority: 30 };
    update((s) => ({ ...s, roles: d.allowed ? [...s.roles, role] : s.roles, audit: [entry, ...s.audit] }));
    if (!d.allowed) return showAlert('Reddedildi', d.reason);
    setNewName('');
    pick(role.id);
    setDraft(role);
  };
  const remove = () => {
    if (!role || role.system) return;
    const { d, entry } = guard(rbac, actor, 'roles.edit', PLATFORM, 'Rol silme', role.name);
    update((s) => ({ ...s, roles: d.allowed ? s.roles.filter((r) => r.id !== role.id) : s.roles, userRoles: d.allowed ? s.userRoles.filter((u) => u.roleId !== role.id) : s.userRoles, audit: [entry, ...s.audit] }));
    if (!d.allowed) return showAlert('Reddedildi', d.reason);
    pick('bd');
  };

  return (
    <>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="options-outline" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Rol ve Yetki Merkezi</Text>
            <Text style={styles.dim}>Roller, izinler, kapsamlar ve atamalar tek noktadan yönetilir.</Text>
          </View>
        </View>
        <Text style={styles.label}>Rol seç</Text>
        {rbac.roles.map((r) => (
          <Pressable key={r.id} style={styles.optRow} onPress={() => pick(r.id)} accessibilityLabel={`Rol ${r.name}`}>
            <Ionicons name={sel === r.id ? 'radio-button-on' : 'radio-button-off'} size={24} color={sel === r.id ? '#fff' : colors.textDim} />
            <Text style={styles.optText}>{r.name}</Text>
            <Text style={styles.dim}>
              {r.protected ? '🔒 ' : ''}öncelik {r.priority}
            </Text>
          </Pressable>
        ))}
        <View style={styles.optRow}>
          <Ionicons name="add-circle-outline" size={24} color={colors.textDim} />
          <TextInput value={newName} onChangeText={setNewName} placeholder="Yeni özel rol" placeholderTextColor={colors.textDim} style={[styles.input, { flex: 1 }]} />
          <Pressable style={styles.smallBtn} onPress={create}>
            <Text style={styles.smallBtnText}>Oluştur</Text>
          </Pressable>
        </View>
      </View>

      {draft && (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.h2, { flex: 1 }]}>İzinleri seç</Text>
            <Text style={styles.dim}>{draft.permissions.length} seçili</Text>
          </View>
          {PERMISSIONS.map((p) => {
            const on = draft.permissions.includes(p.key);
            const denied = draft.denies.includes(p.key);
            return (
              <View key={p.key} style={styles.optRow}>
                <Pressable onPress={() => togglePerm(p.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }} accessibilityLabel={`İzin ${p.label}`} disabled={draft.protected}>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? '#fff' : colors.textDim} />
                  <Text style={[styles.optText, denied && { color: colors.red, textDecorationLine: 'line-through' }]}>{p.label}</Text>
                </Pressable>
                {p.critical && <Text style={styles.critical}>Kritik</Text>}
                <Pressable onPress={() => toggleDeny(p.key)} hitSlop={6} disabled={draft.protected} accessibilityLabel={`Yasakla ${p.label}`}>
                  <Text style={{ fontSize: 16, opacity: denied ? 1 : 0.35 }}>⛔</Text>
                </Pressable>
              </View>
            );
          })}
          <Text style={styles.label}>Atanabilir kapsamlar</Text>
          <View style={styles.wrap}>
            {SCOPE_TYPES.map((s) => (
              <Chip key={s} on={draft.scopeTypes.includes(s)} label={SCOPE_LABEL[s]} onPress={() => !draft.protected && toggleScope(s)} />
            ))}
          </View>
          <View style={[styles.optRow, { justifyContent: 'space-between' }]}>
            <Text style={styles.optText}>Öncelik (çakışmada yüksek olan kazanır)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => !draft.protected && setDraft({ ...draft, priority: Math.max(1, draft.priority - 10) })}>
                <Ionicons name="remove-circle" size={26} color={colors.textDim} />
              </Pressable>
              <Text style={{ color: '#fff', fontWeight: '800', width: 34, textAlign: 'center' }}>{draft.priority}</Text>
              <Pressable onPress={() => !draft.protected && setDraft({ ...draft, priority: Math.min(99, draft.priority + 10) })}>
                <Ionicons name="add-circle" size={26} color={colors.primaryText} />
              </Pressable>
            </View>
          </View>
          <View style={styles.summary}>
            <Text style={styles.h2}>Seçim özeti</Text>
            <Text style={styles.sumText}>Rol: {draft.name}</Text>
            <Text style={styles.sumText}>İzin sayısı: {draft.permissions.length}</Text>
            <Text style={styles.sumText}>Yasaklar: {draft.denies.length ? draft.denies.map(permLabel).join(', ') : 'yok'}</Text>
            <Text style={styles.sumText}>Kapsamlar: {draft.scopeTypes.map((s) => SCOPE_LABEL[s]).join(', ') || '—'}</Text>
            <Text style={styles.dim}>Bu, panel davranışını gösteren bir prototiptir; değişiklikler gerçek sunucuya kaydedilmez.</Text>
          </View>
          <Pressable style={styles.primaryBtn} onPress={save} accessibilityLabel="Rolü kaydet">
            <Text style={styles.primaryText}>{draft.protected ? '🔒 Korumalı rol' : 'Kaydet'}</Text>
          </Pressable>
          <Pressable style={[styles.primaryBtn, { backgroundColor: '#fff' }]} onPress={() => setSpec(roleSpec(draft))} accessibilityLabel="Teknik şartname">
            <Text style={[styles.primaryText, { color: '#111' }]}>Seçimi teknik şartnameye dönüştür</Text>
          </Pressable>
          {!role?.system && (
            <Pressable onPress={remove} style={{ alignItems: 'center', padding: 6 }}>
              <Text style={{ color: colors.red, fontWeight: '700' }}>Rolü sil</Text>
            </Pressable>
          )}
        </View>
      )}
      <Modal visible={!!spec} transparent animationType="slide" onRequestClose={() => setSpec(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setSpec(null)} />
        <View style={styles.sheet}>
          <Text style={styles.h2}>Teknik şartname</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            <Text style={styles.mono}>{spec}</Text>
          </ScrollView>
          <Pressable style={styles.primaryBtn} onPress={() => spec && Share.share({ message: spec }).catch(() => {})}>
            <Text style={styles.primaryText}>Paylaş / kopyala</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

// --- Assignments (user_roles + role_scopes) ------------------------------------------
function ScopePicker({ types, value, onChange }: { types: ScopeType[]; value: Scope; onChange: (s: Scope) => void }) {
  const targets = value.type === 'region' ? REGIONS.map((r) => ({ id: r.id, name: r.name })) : value.type === 'agency' ? AGENCIES.map((a) => ({ id: a.id, name: a.name })) : value.type === 'room' ? ROOMS.map((r) => ({ id: r.id, name: r.title })) : [];
  return (
    <>
      <View style={styles.wrap}>
        {types.map((t) => (
          <Chip key={t} on={value.type === t} label={SCOPE_LABEL[t]} onPress={() => onChange(t === 'platform' ? { type: t } : { type: t, id: t === 'region' ? REGIONS[0].id : t === 'agency' ? AGENCIES[0].id : ROOMS[0].id })} />
        ))}
      </View>
      {targets.length > 0 && (
        <View style={styles.wrap}>
          {targets.map((x) => (
            <Chip key={x.id} on={value.id === x.id} label={x.name} onPress={() => onChange({ type: value.type, id: x.id })} />
          ))}
        </View>
      )}
    </>
  );
}

function Assignments({ rbac, update, actor }: Props) {
  const [user, setUser] = useState('u7');
  const [roleId, setRoleId] = useState('mod');
  const role = rbac.roles.find((r) => r.id === roleId) ?? rbac.roles[0];
  const [scope, setScope] = useState<Scope>({ type: 'region', id: 'marmara' });
  const validScope = role.scopeTypes.includes(scope.type) ? scope : { type: role.scopeTypes[0] } as Scope;

  const assign = () => {
    const { d, entry } = guard(rbac, actor, 'roles.edit', PLATFORM, 'Rol atama', `${userName(user)} → ${role.name} (${scopeName(validScope)})`);
    let reason = d.allowed ? '' : d.reason;
    if (!reason && user === actor) reason = 'Kendi rolünü değiştiremezsin (kendi kendine yetki yükseltme engeli).';
    if (!reason && role.priority > maxPriority(rbac, actor)) reason = 'Kendinden yüksek öncelikli rolü atayamazsın.';
    if (!reason && rbac.userRoles.some((u) => u.userId === user && u.roleId === role.id && scopeName(u.scope) === scopeName(validScope))) reason = 'Bu atama zaten var.';
    update((s) => ({
      ...s,
      userRoles: reason ? s.userRoles : [...s.userRoles, { id: rid(), userId: user, roleId: role.id, scope: validScope, grantedBy: userName(actor), at: clock() }],
      audit: [{ ...entry, result: reason ? 'Reddedildi' : 'Uygulandı', after: reason || 'Atama eklendi' }, ...s.audit],
    }));
    showAlert(reason ? 'Reddedildi' : 'Atandı', reason || `${userName(user)} artık ${role.name} (${scopeName(validScope)}).`);
  };
  const revoke = (id: string) => {
    const ur = rbac.userRoles.find((u) => u.id === id)!;
    const { d, entry } = guard(rbac, actor, 'roles.edit', PLATFORM, 'Rol kaldırma', `${userName(ur.userId)} · ${rbac.roles.find((r) => r.id === ur.roleId)?.name}`);
    const reason = !d.allowed ? d.reason : ur.userId === actor ? 'Kendi rolünü kaldıramazsın.' : '';
    update((s) => ({ ...s, userRoles: reason ? s.userRoles : s.userRoles.filter((u) => u.id !== id), audit: [{ ...entry, result: reason ? 'Reddedildi' : 'Uygulandı', after: reason || 'Atama kaldırıldı' }, ...s.audit] }));
    if (reason) showAlert('Reddedildi', reason);
  };
  const byUser = [...new Set(rbac.userRoles.map((u) => u.userId))];

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.h2}>Mevcut atamalar (user_roles)</Text>
        {byUser.map((uid) => (
          <View key={uid} style={{ gap: 4 }}>
            <Text style={[styles.optText, { fontWeight: '800' }]}>{userName(uid)}</Text>
            {rbac.userRoles
              .filter((u) => u.userId === uid)
              .map((u) => (
                <View key={u.id} style={styles.assignRow}>
                  <Text style={{ color: '#fff', flex: 1 }}>
                    {rbac.roles.find((r) => r.id === u.roleId)?.name} · {scopeName(u.scope)}
                  </Text>
                  <Text style={styles.dim}>{u.grantedBy}</Text>
                  <Pressable onPress={() => revoke(u.id)} hitSlop={6}>
                    <Ionicons name="close-circle" size={20} color={colors.red} />
                  </Pressable>
                </View>
              ))}
          </View>
        ))}
        <Text style={styles.dim}>Bir kullanıcı birden fazla role sahip olabilir. Etkin izinler, kapsamı hedefi kapsayan rollerin birleşimidir; yasaklar ve kritik işlem sınırları önce uygulanır.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>Rol ata</Text>
        <Text style={styles.label}>Kullanıcı</Text>
        <View style={styles.wrap}>
          {['me', ...USERS.slice(0, 9).map((u) => u.id)].map((id) => (
            <Chip key={id} on={user === id} label={userName(id)} onPress={() => setUser(id)} />
          ))}
        </View>
        <Text style={styles.label}>Rol</Text>
        <View style={styles.wrap}>
          {rbac.roles.map((r) => (
            <Chip key={r.id} on={roleId === r.id} label={r.name} onPress={() => setRoleId(r.id)} />
          ))}
        </View>
        <Text style={styles.label}>Kapsam (role_scopes: {role.scopeTypes.map((s) => SCOPE_LABEL[s]).join(', ')})</Text>
        <ScopePicker types={role.scopeTypes} value={validScope} onChange={setScope} />
        <Pressable style={styles.primaryBtn} onPress={assign} accessibilityLabel="Rolü ata">
          <Text style={styles.primaryText}>Ata</Text>
        </Pressable>
      </View>
    </>
  );
}

// --- Effective permission checker ---------------------------------------------------------
function Checker({ rbac }: { rbac: RbacState }) {
  const [user, setUser] = useState('u2');
  const [perm, setPerm] = useState<PermissionKey>('users.ban');
  const [scope, setScope] = useState<Scope>({ type: 'room', id: 'r1' });
  const d = resolve(rbac, user, perm, scope);
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Bu kullanıcı bu işlemi yapabilir mi?</Text>
      <View style={styles.wrap}>
        {ACTORS.concat(['u7']).map((id) => (
          <Chip key={id} on={user === id} label={userName(id)} onPress={() => setUser(id)} />
        ))}
      </View>
      <View style={styles.wrap}>
        {PERMISSIONS.map((p) => (
          <Chip key={p.key} on={perm === p.key} label={p.label} onPress={() => setPerm(p.key)} />
        ))}
      </View>
      <Text style={styles.label}>Hedef</Text>
      <ScopePicker types={SCOPE_TYPES} value={scope} onChange={setScope} />
      <View style={[styles.summary, { borderColor: d.allowed ? colors.green : colors.red, borderWidth: 1 }]}>
        <Text style={{ color: d.allowed ? colors.green : colors.red, fontWeight: '900', fontSize: 18 }}>{d.allowed ? '✓ İZİNLİ' : '✕ REDDEDİLDİ'}</Text>
        <Text style={styles.sumText}>{d.reason}</Text>
      </View>
      <Text style={styles.dim}>Öncelik kuralı: 1) açık yasak her zaman kazanır · 2) kritik işlemlerde yalnızca gereken kapsamdaki yetki sayılır · 3) kapsamı hedefi kapsayan en yüksek öncelikli izin · 4) eşleşme yoksa reddet.</Text>
    </View>
  );
}

// --- Moderation actions ----------------------------------------------------------------------
function Moderation({ rbac, update, actor }: Props) {
  const [target, setTarget] = useState('u6');
  const [action, setAction] = useState<'Susturma' | 'Ban' | 'Uyarı'>('Susturma');
  const [scope, setScope] = useState<Scope>({ type: 'room', id: 'r1' });
  const [duration, setDuration] = useState('24 sa');
  const [reason, setReason] = useState('');
  const apply = () => {
    if (reason.trim().length < 3) return showAlert('Gerekçe gerekli', 'Moderasyon işlemleri gerekçe ile kaydedilir.');
    const perm: PermissionKey = action === 'Ban' ? 'users.ban' : 'users.mute';
    const d = resolve(rbac, actor, perm, scope);
    const self = target === actor;
    const ok = d.allowed && !self;
    update((s) => ({
      ...s,
      moderation: [{ id: rid(), at: clock(), actor: userName(actor), action, userId: target, scope, reason: reason.trim(), duration: action === 'Uyarı' ? '—' : duration, result: ok ? 'Uygulandı' : 'Reddedildi', note: self ? 'Kendine işlem yapılamaz' : d.reason }, ...s.moderation],
    }));
    setReason('');
    showAlert(ok ? `${action} uygulandı` : 'Reddedildi', self ? 'Kendine moderasyon işlemi uygulayamazsın.' : d.reason);
  };
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.h2}>Moderasyon işlemi</Text>
        <View style={styles.wrap}>
          {USERS.slice(0, 10).map((u) => (
            <Chip key={u.id} on={target === u.id} label={u.name} onPress={() => setTarget(u.id)} />
          ))}
        </View>
        <View style={styles.wrap}>
          {(['Susturma', 'Ban', 'Uyarı'] as const).map((a) => (
            <Chip key={a} on={action === a} label={a} onPress={() => setAction(a)} />
          ))}
        </View>
        <Text style={styles.label}>Kapsam</Text>
        <ScopePicker types={SCOPE_TYPES} value={scope} onChange={setScope} />
        {action !== 'Uyarı' && (
          <View style={styles.wrap}>
            {['1 sa', '24 sa', '7 gün', 'Kalıcı'].map((x) => (
              <Chip key={x} on={duration === x} label={x} onPress={() => setDuration(x)} />
            ))}
          </View>
        )}
        <TextInput value={reason} onChangeText={setReason} placeholder="Gerekçe (zorunlu)" placeholderTextColor={colors.textDim} style={styles.input} />
        <Pressable style={styles.primaryBtn} onPress={apply} accessibilityLabel="Moderasyon uygula">
          <Text style={styles.primaryText}>Uygula</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>moderation_actions</Text>
        {rbac.moderation.length === 0 && <Text style={styles.dim}>Henüz kayıt yok.</Text>}
        {rbac.moderation.map((m) => (
          <Text key={m.id} style={[styles.dim, { color: m.result === 'Uygulandı' ? '#fff' : colors.red }]}>
            {m.at} · {m.actor} → {userName(m.userId)} · {m.action} {m.duration} · {scopeName(m.scope)} · “{m.reason}” · {m.result}
          </Text>
        ))}
      </View>
    </>
  );
}

// --- Commission rules (BD + agency revenue share) -----------------------------------------------
function Commissions({ rbac, update, actor }: Props) {
  const { setRule } = useApp();
  const change = (id: string, delta: number) => {
    const rule = rbac.commissions.find((c) => c.id === id)!;
    const next = Math.round(Math.min(0.9, Math.max(0, rule.rate + delta)) * 100) / 100;
    const { d, entry } = guard(rbac, actor, 'commission.rate.edit', PLATFORM, 'Komisyon oranı', `${rule.name}: ${pct(rule.rate)} → ${pct(next)}`);
    update((s) => ({
      ...s,
      commissions: d.allowed ? s.commissions.map((c) => (c.id === id ? { ...c, rate: next, version: c.version + 1, effective: clock() } : c)) : s.commissions,
      audit: [entry, ...s.audit],
    }));
    if (!d.allowed) return showAlert('Reddedildi', d.reason);
    setRule(rule.party === 'agency' ? 'agencyCommission' : 'bdCommission', next);
  };
  const agency = rbac.commissions.find((c) => c.party === 'agency')!;
  const bd = rbac.commissions.find((c) => c.party === 'bd')!;
  const streamer = 100_000;
  const agencyCut = Math.round(streamer * agency.rate);
  const bdCut = Math.round((streamer + agencyCut) * bd.rate);
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.h2}>commission_rules</Text>
        {rbac.commissions.map((c) => (
          <View key={c.id} style={styles.assignRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {c.name} · {pct(c.rate)}
              </Text>
              <Text style={styles.dim}>
                {c.basis} · v{c.version} · {c.effective}
              </Text>
            </View>
            <Pressable onPress={() => change(c.id, -0.01)} accessibilityLabel={`${c.name} azalt`}>
              <Ionicons name="remove-circle" size={26} color={colors.textDim} />
            </Pressable>
            <Pressable onPress={() => change(c.id, 0.01)} accessibilityLabel={`${c.name} artır`}>
              <Ionicons name="add-circle" size={26} color={colors.primaryText} />
            </Pressable>
          </View>
        ))}
        <Text style={styles.dim}>Oran değişikliği kritik işlemdir: yalnızca platform kapsamında “Komisyon oranı değiştirme” izni olanlar yapabilir, yeni sürüm oluşturur ve geçmiş hak edişler eski sürümle kalır.</Text>
      </View>
      <View style={styles.summary}>
        <Text style={styles.h2}>Örnek</Text>
        <Text style={styles.sumText}>Yayıncı: 💎 {streamer.toLocaleString('tr-TR')} (kesinti yok)</Text>
        <Text style={styles.sumText}>
          Ajans ({pct(agency.rate)}): 💎 {agencyCut.toLocaleString('tr-TR')}
        </Text>
        <Text style={styles.sumText}>
          BD ({pct(bd.rate)} × yayıncı+ajans): 💎 {bdCut.toLocaleString('tr-TR')}
        </Text>
        <Text style={styles.sumText}>Platform toplam maliyet: 💎 {(streamer + agencyCut + bdCut).toLocaleString('tr-TR')}</Text>
      </View>
    </>
  );
}

function Audit({ rbac }: { rbac: RbacState }) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>permission_audit_logs</Text>
      {rbac.audit.length === 0 && <Text style={styles.dim}>Henüz kayıt yok. Rol, izin, atama ve komisyon değişiklikleri (reddedilen denemeler dahil) burada görünür.</Text>}
      {rbac.audit.map((a) => (
        <View key={a.id} style={{ gap: 2, paddingVertical: 4 }}>
          <Text style={{ color: a.result === 'Uygulandı' ? '#fff' : colors.red, fontWeight: '700' }}>
            {a.result === 'Uygulandı' ? '✓' : '✕'} {a.action} · {a.target}
          </Text>
          <Text style={styles.dim}>
            {a.at} · {a.actor}
            {a.before ? ` · önce: ${a.before}` : ''} · {a.after}
          </Text>
        </View>
      ))}
    </View>
  );
}

const TABLES: [string, string, string][] = [
  ['roles', 'id, name, priority, protected, created_by, created_at', 'Rol tanımları; panelden eklenir/düzenlenir.'],
  ['role_permissions', 'role_id, permission_key, effect (allow|deny)', 'Rolün izinleri ve açık yasakları.'],
  ['role_scopes', 'role_id, scope_type (platform|region|agency|room)', 'Rolün atanabileceği kapsam türleri.'],
  ['user_roles', 'id, user_id, role_id, scope_type, scope_id, granted_by, granted_at, expires_at', 'Kullanıcılara atanmış roller; bir kullanıcının birden fazla rolü olabilir.'],
  ['permission_audit_logs', 'id, actor_id, action, target, before_json, after_json, result, reason, ip, at', 'Yetki değişikliklerinin değiştirilemez geçmişi (reddedilenler dahil).'],
  ['moderation_actions', 'id, actor_id, user_id, action (mute|ban|unban|warn), scope_type, scope_id, reason, duration, expires_at, result, at', 'Ban, susturma vb. işlemlerin kaydı; itiraz akışına bağlanır.'],
  ['commission_rules', 'id, party (agency|bd), rate, basis, version, effective_from, created_by', 'BD ve ajans gelir paylaşımı kuralları; sürümlüdür.'],
  ['permissions (kod)', 'key, label, group, critical, min_scope', 'İşlem türleri kataloğu: yeni işlem türü yazılım desteği gerektirir.'],
];
function DataModel() {
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.h2}>Veri modeli</Text>
        {TABLES.map(([t, f, d]) => (
          <View key={t} style={{ gap: 2, paddingVertical: 4 }}>
            <Text style={{ color: colors.gold, fontWeight: '800' }}>{t}</Text>
            <Text style={styles.mono}>{f}</Text>
            <Text style={styles.dim}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={styles.summary}>
        <Text style={styles.h2}>Esnek ama güvenli</Text>
        <Text style={styles.sumText}>• Yeni rol, izin kombinasyonu, kapsam ve atama panelden eklenir; kod değişmez.</Text>
        <Text style={styles.sumText}>• Daha önce hiç olmayan yeni bir işlem türü eklenirse, o işlemin yazılımda desteklenmesi ve sunucuda kontrol edilmesi gerekir.</Text>
        <Text style={styles.sumText}>• Kritik işlemler (ban, komisyon, rol değişikliği, finans raporu) gerekçe ister ve denetim kaydına yazılır.</Text>
        <Text style={styles.sumText}>• Kimse kendi rolünü değiştiremez, sahip olmadığı izni veremez, kendinden yüksek öncelikli rolü düzenleyemez; Super Admin korumalıdır.</Text>
      </View>
    </>
  );
}

function Chip({ on, label, onPress, strong }: { on: boolean; label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && { backgroundColor: strong ? '#fff' : colors.primary }]} accessibilityLabel={label}>
      <Text style={[styles.chipText, on && strong && { color: '#111' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actorBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 44 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 10 },
  h1: { color: '#fff', fontSize: 20, fontWeight: '900' },
  h2: { color: '#fff', fontSize: 17, fontWeight: '800' },
  label: { color: colors.textDim, fontWeight: '700', marginTop: 4 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  note: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  optText: { color: '#fff', fontSize: 16, flexShrink: 1 },
  critical: { color: colors.gold, fontSize: 11, fontWeight: '800', borderWidth: 1, borderColor: colors.gold, borderRadius: 6, paddingHorizontal: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 12, color: '#fff', paddingHorizontal: 12, paddingVertical: 9 },
  smallBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  summary: { backgroundColor: colors.cardAlt, borderRadius: 16, padding: 14, gap: 6 },
  sumText: { color: '#fff', fontSize: 14 },
  primaryBtn: { backgroundColor: '#18181B', borderRadius: 999, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 10, padding: 8 },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 10, paddingBottom: 30 },
  mono: { color: '#E4E4E7', fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
});
