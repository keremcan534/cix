// Otomatik mesajlaşma's numbers and texts (docs/OTOMATIK_MESAJ.md): the defaults the owners' spec gives (V2.0, 18 Nov
// 2026) and the Canlı ayarlar keys that change them (live-registry.mjs builds the entries). Pure, like event-rules.mjs:
// no database, so the app's tests and the registry can import it.

/** A streamer's 10 automatic messages when she hasn't written her own (Canlı ayarlar auto_templates_default). */
export const DEFAULT_TEMPLATES = [
  'Merhaba 😊 Günün nasıl geçiyor?',
  'Selam 🌸 Biraz sohbet etmek ister misin?',
  'Bugün seni mutlu eden bir şey oldu mu?',
  'Merhaba, yeni insanlarla tanışmayı seviyorum. Sen nasılsın?',
  'Selam 😊 Bugünün nasıl geçtiğini merak ettim.',
  'Merhaba, boş zamanlarında neler yapmayı seversin?',
  'Selam, biraz tanışalım mı?',
  'Merhaba 🌷 Bugün keyfin nasıl?',
  'Sence güzel bir sohbetin en önemli özelliği nedir?',
  'Selam 😊 Yeni insanlarla sohbet etmek güzel. Sen ne düşünüyorsun?',
];
/** The free conversation starts the system sends in a man's name (he can't change them). */
export const DEFAULT_OPENERS = ['Merhaba, nasılsın?', 'Selam 😊 Tanışabilir miyiz?', 'Bugün nasıl geçiyor?', 'Merhaba, biraz sohbet etmek ister misin?', 'Selam, burada ne zamandır varsın?'];
/** A streamer's quick replies. */
export const DEFAULT_QUICK = ['Merhaba 😊 İyiyim, sen nasılsın?', 'Selam 🌸 Tanıştığımıza sevindim.', 'Bugün güzel geçiyor. Senin günün nasıl?', 'Merhaba, biraz sohbet edelim 😊', 'Teşekkür ederim, sen neler yapıyorsun?'];
export const TEMPLATE_COUNT = 10;

/** One line per message; empty lines dropped, each at most `max` characters. */
export const linesOf = (text, max = 300) =>
  String(text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.slice(0, max));

/** The parts that can be switched off on their own (Canlı ayarlar auto_chat_off). */
export const AUTO_PARTS = ['streamer', 'opener', 'quick'];
export const AUTO_PART_LABEL = { streamer: 'Yayıncı otomatik mesajları', opener: 'Erkeklerin ücretsiz sohbet başlangıcı', quick: 'Hazır cevaplar' };
export const AUTO_PART_OFF = {
  streamer: 'Yayıncılar adına otomatik mesaj gitmez; şablonlar kayıtlı kalır.',
  opener: 'Erkekler adına ücretsiz sohbet başlangıcı gitmez.',
  quick: 'Hazır cevap düğmesi çalışmaz; yayıncılar yazarak cevap verir.',
};

/** SimilarClub Sistem's categories (system-notices.mjs); each one can be switched off (system_notices_off). */
export const NOTICE_CATEGORIES = ['voice_call', 'video_call', 'call_paid', 'message_summary', 'message_reward', 'pk', 'rocket', 'event_reward', 'bag_gift', 'bonus', 'performance', 'quota', 'bond'];
export const NOTICE_LABEL = {
  voice_call: 'Sesli arama kazancı',
  video_call: 'Görüntülü arama kazancı',
  call_paid: 'Görüşme işlem bilgisi (ödeyen)',
  message_summary: 'Günlük mesaj kazanç özeti',
  message_reward: 'Anlık mesaj kazancı (eşiği aşan)',
  pk: 'PK sonucu',
  rocket: 'Roket ödülü',
  event_reward: 'Etkinlik ödülü',
  bag_gift: 'Çanta hediyesi (çerçeve, giriş efekti, emoji)',
  bonus: 'Bonus ve görev ödülü',
  performance: 'Yayıncı performans uyarısı',
  quota: 'Otomatik mesaj ve hazır cevap hakkı',
  bond: 'Bağ bildirimleri',
};

/**
 * The numbers (Canlı ayarlar, group "Otomatik mesaj"): key → { field, label, default, bounds, unit, help, text }. The
 * reply window is money (it decides who gets the coins of a paid message), so its change asks twice.
 */
export const AUTO_CHAT = {
  auto_daily: { field: 'autoDaily', label: 'Yayıncının günlük otomatik mesaj hakkı', default: 10, bounds: { min: 0, max: 50, step: 1 }, unit: '', help: 'Her onaylı kadın yayıncı adına günde en çok bu kadar otomatik mesaj gider (Türkiye saatiyle 00.00’da yenilenir, devretmez).', text: (a, b) => `Yayıncı başına günlük otomatik mesaj ${a} → ${b}.` },
  quick_daily: { field: 'quickDaily', label: 'Yayıncının günlük hazır cevap hakkı', default: 10, bounds: { min: 0, max: 50, step: 1 }, unit: '', help: 'Yayıncının günde kullanabileceği hazır cevap. Otomatik mesaj hakkından ayrıdır.', text: (a, b) => `Günlük hazır cevap ${a} → ${b}.` },
  opener_daily: { field: 'openerDaily', label: 'Erkeğin günlük ücretsiz sohbet başlangıcı', default: 2, bounds: { min: 0, max: 20, step: 1 }, unit: '', help: 'Sistemin bir erkek adına günde en çok kaç ücretsiz sohbet başlangıcı göndereceği. 0: hiç.', text: (a, b) => `Erkek başına günlük ücretsiz başlangıç ${a} → ${b}.` },
  auto_gap_minutes: { field: 'autoGapMinutes', label: 'Yayıncının iki otomatik mesajı arası', default: 20, bounds: { min: 1, max: 720, step: 1 }, unit: ' dakika', help: 'Bir yayıncı adına iki otomatik mesaj arasında en az bu kadar dakika olur; haklar güne yayılır.', text: (a, b) => `Yayıncının otomatik mesajları arası ${a} → ${b} dakika.` },
  auto_man_daily: { field: 'autoManDaily', label: 'Bir erkeğe günde en çok otomatik mesaj', default: 3, bounds: { min: 0, max: 30, step: 1 }, unit: '', help: 'Bir erkek kullanıcı bütün yayıncılardan günde en çok bu kadar otomatik mesaj alır. Cevap vermeyenlerde aşağıdaki azaltma uygulanır.', text: (a, b) => `Erkek başına günlük otomatik mesaj ${a} → ${b}.` },
  auto_man_gap_minutes: { field: 'autoManGapMinutes', label: 'Bir erkeğe iki otomatik mesaj arası', default: 120, bounds: { min: 5, max: 2880, step: 5 }, unit: ' dakika', help: 'Aynı erkek kullanıcıya iki otomatik mesaj arasında en az bu kadar dakika olur.', text: (a, b) => `Bir erkeğe iki otomatik mesaj arası ${a} → ${b} dakika.` },
  auto_quiet_cut: { field: 'autoQuietCut', label: 'Cevap vermeyenlere azaltma', default: 50, bounds: { min: 0, max: 100, step: 5 }, unit: ' %', help: 'Otomatik mesajların beşte birinden azına cevap veren erkeğin günlük sınırı bu oranda düşer (100: hiç almaz). En az 3 mesaj almış olmalı.', text: (a, b) => `Cevap vermeyenlerin sınırı %${a} → %${b} azalır.` },
  auto_new_days: { field: 'autoNewDays', label: 'Yeni kullanıcı sayılma süresi', default: 7, bounds: { min: 0, max: 60, step: 1 }, unit: ' gün', help: 'Kaydından bu kadar gün geçmemiş erkek kullanıcı yeni sayılır ve öne alınır.', text: (a, b) => `Yeni kullanıcı süresi ${a} → ${b} gün.` },
  auto_new_weight: { field: 'autoNewWeight', label: 'Yeni kullanıcı önceliği', default: 40, bounds: { min: 0, max: 100, step: 1 }, unit: ' puan', help: 'Eşleştirmede yeni erkek kullanıcıya eklenen puan; hiç sohbet etmemişse bunun bir buçuk katı.', text: (a, b) => `Yeni kullanıcı önceliği ${a} → ${b} puan.` },
  auto_reply_weight: { field: 'autoReplyWeight', label: 'Cevap oranı ağırlığı', default: 30, bounds: { min: 0, max: 100, step: 1 }, unit: ' puan', help: 'Otomatik mesajlara cevap verme oranı (son 30 gün) bu puanla çarpılır; hiç almamış kişi yarı puan alır.', text: (a, b) => `Cevap oranı ağırlığı ${a} → ${b} puan.` },
  auto_online_weight: { field: 'autoOnlineWeight', label: 'Çevrimiçi önceliği', default: 20, bounds: { min: 0, max: 100, step: 1 }, unit: ' puan', help: 'Şu an çevrimiçi olan kullanıcıya eklenen puan.', text: (a, b) => `Çevrimiçi önceliği ${a} → ${b} puan.` },
  auto_streamer_coef: { field: 'autoStreamerCoef', label: 'Yayıncı dağıtım katsayısı', default: 50, bounds: { min: 0, max: 100, step: 5 }, unit: ' %', help: 'Sırada hızlı cevap veren yayıncı ne kadar öne geçer. 0: herkes eşit (rastgele), 100: yalnız performans. Yeni yayıncılar ortalama sayılır, dışlanmaz.', text: (a, b) => `Yayıncı dağıtım katsayısı %${a} → %${b}.` },
  auto_busy_pending: { field: 'autoBusyPending', label: 'Meşgul yayıncı: bekleyen mesaj', default: 3, bounds: { min: 1, max: 50, step: 1 }, unit: ' mesaj', help: 'Cevap bekleyen bu kadar ücretli mesajı olan yayıncı adına yeni otomatik mesaj gitmez.', text: (a, b) => `Meşgul yayıncı sınırı ${a} → ${b} bekleyen mesaj.` },
  auto_active_minutes: { field: 'autoActiveMinutes', label: 'Sohbetteki kullanıcıya ara', default: 10, bounds: { min: 0, max: 240, step: 1 }, unit: ' dakika', help: 'Son bu kadar dakikada mesaj yazmış kişiye yeni sohbet başlangıcı gitmez (aktif sohbetini bölmesin).', text: (a, b) => `Aktif sohbet arası ${a} → ${b} dakika.` },
  auto_online_minutes: { field: 'autoOnlineMinutes', label: 'Çevrimiçi sayılma', default: 15, bounds: { min: 5, max: 120, step: 1 }, unit: ' dakika', help: 'Son bu kadar dakikada uygulamayı kullanan kişi çevrimiçi sayılır. Otomatik mesaj yalnız çevrimiçi yayıncı adına gider.', text: (a, b) => `Çevrimiçi sayılma ${a} → ${b} dakika.` },
  template_max_chars: { field: 'templateMaxChars', label: 'Şablon en çok karakter', default: 200, bounds: { min: 20, max: 500, step: 10 }, unit: ' karakter', help: 'Yayıncının kendi yazdığı otomatik mesajın en çok uzunluğu.', text: (a, b) => `Şablon uzunluğu en çok ${a} → ${b} karakter.` },
  template_min_chars: { field: 'templateMinChars', label: 'Şablon en az karakter', default: 5, bounds: { min: 1, max: 50, step: 1 }, unit: ' karakter', help: 'Yayıncının kendi yazdığı otomatik mesajın en az uzunluğu.', text: (a, b) => `Şablon uzunluğu en az ${a} → ${b} karakter.` },
  reply_minutes: { field: 'replyMinutes', label: 'Mesaj cevap süresi (elmas için)', default: 5, bounds: { min: 0, max: 60, step: 1, money: true }, unit: ' dakika', help: 'Ücretli mesajın elması yayıncıya, ancak bu kadar dakika içinde cevap verirse geçer; cevap gelmezse jeton gönderene iade edilir. 0: kural kapalı, yayıncı mesaj gelir gelmez kazanır (eski hâl). Gönderilmiş mesaj kendi süresini korur.', text: (a, b) => (String(b) === '0' ? 'Cevap süresi kuralı kapanır: yayıncı ücretli mesajın elmasını hemen alır, iade olmaz.' : `Ücretli mesajın cevap süresi ${a} → ${b} dakika.`) },
  reply_grace_seconds: { field: 'replyGraceSeconds', label: 'Cevap süresi payı (ağ gecikmesi)', default: 10, bounds: { min: 0, max: 60, step: 1 }, unit: ' saniye', help: 'Süre bittikten sonra bu kadar saniye içinde sunucuya ulaşan cevap da zamanında sayılır (sunucunun saatiyle).', text: (a, b) => `Cevap süresi payı ${a} → ${b} saniye.` },
  message_notice_min: { field: 'messageNoticeMin', label: 'Anlık mesaj kazancı bildirimi: en az', default: 0, bounds: { min: 0, max: 1_000_000, step: 10 }, unit: ' elmas', help: 'Tek bir mesajdan en az bu kadar elmas kazanılınca SimilarClub Sistem hemen haber verir. 0: anlık bildirim yok, yalnız günlük özet (çok sayıda küçük bildirim olmasın).', text: (a, b) => (String(b) === '0' ? 'Mesaj kazancı yalnız günlük özetle bildirilir.' : `${b} elmas ve üstü mesaj kazancı hemen bildirilir (şu an: ${String(a) === '0' ? 'yalnız özet' : `${a} elmas`}).`) },
  reply_min_chars: { field: 'replyMinChars', label: 'Geçerli cevap en az karakter', default: 2, bounds: { min: 1, max: 20, step: 1 }, unit: ' karakter', help: 'Ödül için yayıncının cevabı en az bu kadar karakter olmalı (fotoğraf ve hazır cevap geçerli sayılır). Otomatik mesaj cevap sayılmaz.', text: (a, b) => `Geçerli cevap en az ${a} → ${b} karakter.` },
  perf_warn_rate: { field: 'perfWarnRate', label: 'Uyarı: 5 dakikada cevap oranı altı', default: 50, bounds: { min: 0, max: 100, step: 5 }, unit: ' %', help: 'Son günlerde ödüle uygun mesajlarının bu orandan azını zamanında cevaplayan yayıncıya SimilarClub Sistem’den uyarı gider. 0: uyarı yok.', text: (a, b) => `Gecikme uyarısı %${a} → %${b} altında.` },
  perf_warn_min: { field: 'perfWarnMin', label: 'Uyarı için en az mesaj', default: 10, bounds: { min: 1, max: 500, step: 1 }, unit: ' mesaj', help: 'Uyarı için o günlerde en az bu kadar ödüle uygun mesaj gelmiş olmalı.', text: (a, b) => `Uyarı için en az ${a} → ${b} mesaj.` },
  perf_warn_days: { field: 'perfWarnDays', label: 'Uyarıda bakılan gün', default: 3, bounds: { min: 1, max: 30, step: 1 }, unit: ' gün', help: 'Uyarı son bu kadar günün mesajlarına bakar.', text: (a, b) => `Uyarı son ${a} → ${b} güne bakar.` },
  perf_warn_gap_days: { field: 'perfWarnGapDays', label: 'İki uyarı arası', default: 3, bounds: { min: 1, max: 60, step: 1 }, unit: ' gün', help: 'Aynı yayıncıya iki uyarı arasında en az bu kadar gün olur. Son 14 günde uyarı almış yayıncıya ikinci, daha sert metin gider.', text: (a, b) => `İki uyarı arası ${a} → ${b} gün.` },
};

/** The texts (one message per line), Canlı ayarlar. */
export const AUTO_TEXTS = {
  auto_templates_default: { field: 'autoTemplatesDefault', label: 'Varsayılan otomatik mesajlar (10 satır)', default: DEFAULT_TEMPLATES.join('\n'), lines: TEMPLATE_COUNT, help: 'Her satır bir şablon, sırayla 1’den 10’a. Kendi şablonunu yazmamış yayıncının mesajları bunlardır. Eksik satırın yerine yerleşik metin kullanılır.' },
  auto_opener_pool: { field: 'autoOpenerPool', label: 'Erkeklerin ücretsiz sohbet başlangıçları', default: DEFAULT_OPENERS.join('\n'), lines: 20, help: 'Her satır bir başlangıç mesajı; sistem sırayla ve rastgele seçer. Erkek kullanıcı bunları değiştiremez.' },
  auto_quick_pool: { field: 'autoQuickPool', label: 'Hazır cevaplar', default: DEFAULT_QUICK.join('\n'), lines: 20, help: 'Her satır bir hazır cevap; yayıncı sohbette dokunarak seçer.' },
};

/**
 * The scored order of candidate men (auto-chat.mjs): new accounts first, then people who answer automatic messages,
 * then people on now, with a little chance so the same few aren't always picked. Pure, for the tests.
 */
export function manScore(m, s, random = Math.random) {
  const fresh = m.newUser ? s.autoNewWeight * (m.chatted ? 1 : 1.5) : 0;
  const rate = m.received > 0 ? m.replied / m.received : 0.5;
  return fresh + s.autoReplyWeight * rate + (m.online ? s.autoOnlineWeight : 0) + random() * 10;
}

/**
 * A streamer's place in the queue: her answers in 5 minutes (last 7 days; a new streamer with few messages counts as
 * average, so she is not left out) weighed by the coefficient, the rest chance.
 */
export function streamerScore(x, s, random = Math.random) {
  const rate = x.total >= 5 ? x.inTime / x.total : 0.5;
  const k = s.autoStreamerCoef / 100;
  return k * rate + (1 - k) * random();
}

/** How many automatic messages a man may still get today: the daily cap, cut for someone who rarely answers. */
export function manCap(m, s) {
  const quiet = m.received >= 3 && m.replied / m.received < 0.2;
  return quiet ? Math.floor((s.autoManDaily * (100 - s.autoQuietCut)) / 100) : s.autoManDaily;
}
