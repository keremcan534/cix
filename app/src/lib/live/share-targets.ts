// Odayı paylaş › Aileye paylaş / Ajansta paylaş: my family's chat and my agency's chat group, read when the share sheet
// opens, and sending the room's invite line there (lib/room-social roomShareText; the chats show "Odaya git" under it,
// components/room-share-chip). Each place once per room visit; a failure says why and can be tried again.
import { useEffect, useState } from 'react';

import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import * as agencyChat from '@/lib/live/agency-chat';
import * as familyLive from '@/lib/live/family';

type Place = { id: string; name: string } | null;
type Sent = { family: boolean; agency: boolean };

/** Where I can share the room (null: I have no family / no agency group, or it isn't known), and the senders. */
export function useShareTargets(roomId: string, open: boolean, text: () => string) {
  const [family, setFamily] = useState<Place>(null);
  const [agency, setAgency] = useState<Place>(null);
  const [sent, setSent] = useState<Sent>({ family: false, agency: false });
  const [busy, setBusy] = useState<Sent>({ family: false, agency: false });
  // A new room starts with nothing sent.
  const [seenRoom, setSeenRoom] = useState(roomId);
  if (seenRoom !== roomId) {
    setSeenRoom(roomId);
    setSent({ family: false, agency: false });
  }
  useEffect(() => {
    if (!open) return;
    let live = true;
    familyLive
      .family()
      .then((d) => live && setFamily(d.family ? { id: d.family.id, name: d.family.name } : null))
      .catch(() => {});
    agencyChat
      .groups()
      .then((g) => live && setAgency(g[0] ? { id: g[0].id, name: g[0].name } : null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);

  const send = async (where: keyof Sent) => {
    if (busy[where] || sent[where]) return;
    setBusy((b) => ({ ...b, [where]: true }));
    try {
      if (where === 'family') await familyLive.say(text());
      else if (agency) await agencyChat.say(agency.id, text());
      setSent((x) => ({ ...x, [where]: true }));
    } catch (e) {
      showAlert(where === 'family' ? 'Aileye gönderilemedi' : 'Ajans sohbetine gönderilemedi', message(e));
    } finally {
      setBusy((b) => ({ ...b, [where]: false }));
    }
  };
  return {
    family: family && { name: family.name, sent: sent.family, busy: busy.family, onSend: () => void send('family') },
    agency: agency && { name: agency.name, sent: sent.agency, busy: busy.agency, onSend: () => void send('agency') },
  };
}
