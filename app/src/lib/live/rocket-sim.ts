// Development only: Canlı Yörünge's rounds played on this device, for looking at the live screen in the web preview
// without a server (open the game with `?rocketsim` in the address; lib/live/rocket-live setRocketSim). A few made-up
// players put fuel on board and leave at their targets; the round runs as the server's does (fuel → ignition → climb →
// crash → the next one). No coins move and nothing is sent anywhere. Never switched on in a release build.
import type { RocketMine, RocketSeat, RocketView } from '@/lib/api';
import type { RocketSim, RocketState } from '@/lib/live/rocket-live';
import { multAt, RATE } from '@/lib/rocket-live';

const BET_MS = 8000;
const IGNITE_MS = 1200;
const DONE_MS = 3500;
const NAMES = ['Elif', 'Mert', 'Zeynep', 'Kaan', 'Ayşe', 'Emre', 'Deniz'];
const ME = 999;

export function makeRocketSim(): RocketSim {
  let patch: (p: Partial<RocketState>) => void = () => {};
  let round = 0;
  let phase: 'bet' | 'fly' | 'done' = 'bet';
  let betUntil = 0;
  let launchAt = 0;
  let crash = 100;
  let seats: RocketSeat[] = [];
  let mine: RocketMine | null = null;
  let history: number[] = [];
  let v = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const view = (): RocketView => ({
    v: ++v,
    now: Date.now(),
    rate: RATE,
    round: { id: round, phase, ret: 97, betUntil, launchAt: phase === 'bet' ? null : launchAt, crash: phase === 'done' ? crash : null, players: seats.length, fuel: seats.reduce((a, s) => a + s.b, 0) },
    players: seats,
    last: history.slice(0, 20),
  });
  const send = () => patch({ status: 'ready', view: view(), history, mine });

  const newRound = () => {
    round += 1;
    phase = 'bet';
    betUntil = Date.now() + BET_MS;
    // P(crash ≥ x) = 0.97 / x: most rounds fly a while, a few go far.
    crash = Math.max(100, Math.min(100_000, Math.floor(97 / Math.max(0.001, Math.random()))));
    seats = [];
    mine = null;
    send();
  };

  const tick = () => {
    const now = Date.now();
    if (phase === 'bet') {
      // The others put fuel on board now and then while the countdown runs.
      if (seats.length < NAMES.length + 1 && Math.random() < 0.12) {
        const name = NAMES[seats.filter((s) => s.k !== ME).length % NAMES.length];
        const bet = [100, 500, 1000, 5000][Math.floor(Math.random() * 4)];
        seats = [...seats, { k: seats.length + 1, n: name, b: bet, a: [120, 150, 200, 300, 500][Math.floor(Math.random() * 5)], c: null, p: 0 }];
        send();
      }
      if (now >= betUntil) {
        phase = 'fly';
        launchAt = now + IGNITE_MS;
        send();
      }
      return;
    }
    if (phase === 'fly') {
      const x = multAt(now - launchAt, RATE);
      if (x >= crash) {
        phase = 'done';
        history = [crash, ...history].slice(0, 100);
        send();
        setTimeout(newRound, DONE_MS);
        return;
      }
      let changed = false;
      seats = seats.map((s) => {
        if (s.c === null && s.a !== null && x >= s.a) {
          changed = true;
          return { ...s, c: s.a, p: Math.floor((s.b * s.a) / 100) };
        }
        return s;
      });
      if (mine && mine.cashed === null && mine.auto !== null && x >= mine.auto) {
        mine = { ...mine, cashed: mine.auto, payout: Math.floor((mine.onBoard * mine.auto) / 100), onBoard: 0 };
        changed = true;
      }
      if (changed) send();
    }
  };

  return {
    open(set: (p: Partial<RocketState>) => void) {
      patch = set;
      patch({
        offset: 0,
        game: { active: true, allowed: true, needLevel: 2, bets: [100, 500, 1000, 5000, 10000, 50000], maxFuel: 1_000_000, dailyLimit: 0, playedToday: 0 },
        note: null,
        busy: false,
      });
      newRound();
      timer = setInterval(tick, 100);
      return () => {
        if (timer) clearInterval(timer);
        timer = null;
      };
    },
    fuel(bet, auto) {
      if (phase !== 'bet') return false;
      mine = mine ? { ...mine, fuel: mine.fuel + bet, onBoard: mine.onBoard + bet } : { k: ME, fuel: bet, onBoard: bet, auto, cashed: null, payout: 0 };
      const seat: RocketSeat = { k: ME, n: 'Sen', b: mine.fuel, a: mine.auto, c: null, p: 0 };
      seats = seats.some((s) => s.k === ME) ? seats.map((s) => (s.k === ME ? seat : s)) : [...seats, seat];
      send();
      return true;
    },
    escape() {
      if (phase !== 'fly' || !mine || mine.cashed !== null || Date.now() < launchAt) return null;
      const x = multAt(Date.now() - launchAt, RATE);
      const payout = Math.floor((mine.onBoard * x) / 100);
      mine = { ...mine, cashed: x, payout, onBoard: 0 };
      seats = seats.map((s) => (s.k === ME ? { ...s, c: x, p: payout } : s));
      send();
      return { x, payout };
    },
  };
}
