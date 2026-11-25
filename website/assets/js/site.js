// Similar Club website: small progressive enhancements. The page reads fine without this file.
(() => {
  'use strict';

  // Store links. Fill these in when the app is live; the "Çok yakında" buttons turn into real links.
  // Example: play: 'https://play.google.com/store/apps/details?id=com.similarclub.app'
  const STORE_LINKS = {
    play: '',
    apple: '',
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---------------------------------------------------------------- store buttons
  document.querySelectorAll('.store[data-store]').forEach((el) => {
    const url = STORE_LINKS[el.dataset.store];
    if (!url) return;
    const a = document.createElement('a');
    a.className = el.className;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = el.innerHTML;
    const soon = a.querySelector('[data-soon]');
    if (soon) soon.textContent = 'Hemen indir';
    el.replaceWith(a);
  });

  // ---------------------------------------------------------------- year
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  // ---------------------------------------------------------------- nav
  const nav = document.getElementById('nav');
  const menu = document.getElementById('menu');
  const toggle = nav && nav.querySelector('.nav__toggle');
  const onScroll = () => { if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 12); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setMenu = (open) => {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    menu.classList.toggle('is-open', open);
    nav.classList.toggle('menu-open', open);
  };
  if (toggle) toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  if (menu) menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // Highlight the section in view.
  const links = menu ? [...menu.querySelectorAll('a[href^="#"]')] : [];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + entry.target.id)));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  // ---------------------------------------------------------------- reveal on scroll
  // With reduced motion the CSS turns this into a plain fade.
  const reveals = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  }

  // ---------------------------------------------------------------- moving background
  // The blurred photo follows the mouse (computers), the phone's tilt (Android; iPhone would show a permission
  // prompt, so it is skipped there) and scrolling (all phones). One animation loop that stops once everything has
  // settled, and only `transform` changes: the phone moves an already-blurred picture, it never re-blurs.
  const photo = document.getElementById('bgPhoto');
  const drifters = finePointer && !reduceMotion ? [...document.querySelectorAll('[data-drift]')] : [];
  const layers = finePointer && !reduceMotion ? [...document.querySelectorAll('.mark__layer[data-depth]')] : [];
  const AMP = reduceMotion ? 16 : 24; // px the photo travels with the mouse at the edge or the phone fully tilted
  const SCROLL_MAX = reduceMotion ? 12 : 36; // px the photo rises over the whole page
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  let tx = 0, ty = 0, cx = 0, cy = 0, ts = 0, cs = 0, raf = 0;

  const tick = () => {
    cx += (tx - cx) * 0.07;
    cy += (ty - cy) * 0.07;
    cs += (ts - cs) * 0.12;
    if (photo) photo.style.transform = `translate3d(${(-cx * AMP).toFixed(2)}px, ${(-cy * AMP - cs).toFixed(2)}px, 0) scale(1.02)`;
    drifters.forEach((el) => {
      const k = parseFloat(el.dataset.drift) || 1;
      el.style.transform = `translate3d(${(cx * 40 * k).toFixed(2)}px, ${(cy * 40 * k).toFixed(2)}px, 0)`;
    });
    layers.forEach((el) => {
      const d = parseFloat(el.dataset.depth) || 0;
      el.style.transform = `translate3d(${(cx * d).toFixed(2)}px, ${(cy * d).toFixed(2)}px, 0)`;
    });
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) + Math.abs(ts - cs) > 0.002 ? requestAnimationFrame(tick) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  if (finePointer) {
    window.addEventListener('pointermove', (e) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      kick();
    }, { passive: true });
  }

  if (photo) {
    const onScrollBg = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      ts = max > 0 ? (window.scrollY / max) * SCROLL_MAX : 0;
      kick();
    };
    window.addEventListener('scroll', onScrollBg, { passive: true });
    onScrollBg();
  }

  const gyroNeedsPrompt = window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function';
  if (photo && !finePointer && window.DeviceOrientationEvent && !gyroNeedsPrompt) {
    let base = null;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      const sideways = Math.abs(angle) === 90;
      const lr = sideways ? e.beta * Math.sign(angle) : e.gamma; // left / right tilt
      const fb = sideways ? -e.gamma * Math.sign(angle) : e.beta; // front / back tilt
      if (base === null) base = fb;
      base += (fb - base) * 0.015; // slowly re-centre on however the phone is being held
      const nx = Math.round(clamp(lr / 22) * 100) / 100;
      const ny = Math.round(clamp((fb - base) / 22) * 100) / 100;
      if (nx === tx && ny === ty) return;
      tx = nx; ty = ny;
      kick();
    }, { passive: true });
  }

  // ---------------------------------------------------------------- tilt cards
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.tilt').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  // ---------------------------------------------------------------- live room demo (runs only while visible; CSS keeps it to fades under reduced motion)
  const phone = document.querySelector('.phone');
  if (!phone) return;
  const seats = [...phone.querySelectorAll('.seat')].filter((s) => s.querySelector('.seat__av'));
  const chat = document.getElementById('chat');
  const toast = document.getElementById('giftToast');
  const burst = document.getElementById('giftBurst');
  const count = document.getElementById('roomCount');

  const lines = [
    ['41', 'Kaan', 'Ses çok net, tebrikler'],
    ['27', 'Zeynep', 'Sıradaki şarkı benden 🎶'],
    ['55', 'Arda', 'PK saat kaçta?'],
    ['12', 'Deniz', 'Ece bu akşam harika'],
    ['33', 'Mert', 'Aileye hoş geldin Selin'],
    ['19', 'Selin', 'Teşekkürler 🤍'],
    ['48', 'Kaan', 'Mikrofona çıkabilir miyim?'],
  ];
  const gifts = [
    ['hediye-anka-kusu', 'Deniz', 'Ece', 'Anka Kuşu'],
    ['hediye-gul', 'Mert', 'Selin', 'Gül'],
    ['hediye-elmas', 'Zeynep', 'Ece', 'Elmas'],
    ['hediye-kristal-saray', 'Arda', 'Ece', 'Kristal Saray'],
  ];
  let lineIx = 0, giftIx = 0, step = 0, timer = 0;

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const speak = () => {
    seats.forEach((s) => s.classList.remove('is-speaking'));
    const pick = seats.filter(() => Math.random() < 0.34);
    (pick.length ? pick : [seats[0]]).slice(0, 2).forEach((s) => s.classList.add('is-speaking'));
  };
  const say = () => {
    const [lv, who, text] = lines[lineIx++ % lines.length];
    const p = document.createElement('p');
    p.innerHTML = `<span class="lv">${esc(lv)}</span><b>${esc(who)}</b>${esc(text)}`;
    chat.appendChild(p);
    while (chat.children.length > 4) chat.removeChild(chat.firstElementChild);
  };
  const gift = () => {
    const [img, from, to, name] = gifts[giftIx++ % gifts.length];
    const src = `assets/img/${img}.webp`;
    toast.querySelector('img').src = src;
    toast.querySelector('span').innerHTML = `<b>${esc(from)}</b> → ${esc(to)}<br><small>${esc(name)} ×1</small>`;
    burst.src = src;
    [toast, burst].forEach((el) => { el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on'); });
  };
  const loop = () => {
    step++;
    speak();
    if (step % 2 === 0) say();
    if (step % 5 === 1) gift();
    if (count && step % 3 === 0) count.textContent = String(120 + Math.floor(Math.random() * 18));
  };

  const vis = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !timer) { loop(); timer = setInterval(loop, 1700); }
    if (!entry.isIntersecting && timer) { clearInterval(timer); timer = 0; }
  }, { threshold: 0.2 });
  vis.observe(phone);
})();
