# Turns the legal texts in this folder (tr/*.md, en/*.md) into the website's pages, in the look of the site's own
# document pages (website/hesap-silme.html is the template): website/tr/<slug>.html, website/en/<slug>.html and the two
# lists of them, website/yasal.html (Turkish) and website/en/legal.html (English). It also points the "Yasal" column
# of every page's footer at them. The host and agency agreements (09, 10) and the internal checklist
# (00-README-kontrol-listesi.md) are never turned into pages: they are for the parties and the team, not the public.
# Usage (repo root): python docs/yasal/siteye-aktar.py
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "..", "website")

# Number, slug (the address), Turkish and English title. The slugs are the ones the legal pack suggests.
DOCS = [
    ("01", "privacy", "Gizlilik Politikası", "Privacy Policy"),
    ("02", "terms", "Kullanıcı Sözleşmesi", "Terms of Service"),
    ("03", "community-guidelines", "Topluluk Kuralları", "Community Guidelines"),
    ("04", "child-safety", "Çocuk Güvenliği ve CSAE Politikası", "Child Safety and CSAE Policy"),
    ("05", "delete-account", "Hesap ve Veri Silme Politikası", "Account and Data Deletion Policy"),
    ("06", "kvkk", "KVKK Aydınlatma Metni", "Turkish KVKK Privacy Notice"),
    ("07", "virtual-currency", "Jeton, Elmas ve Sanal Hediye Politikası", "Virtual Currency, Diamonds and Gifts Policy"),
    ("08", "refund-policy", "Ödeme ve İade Politikası", "Payment and Refund Policy"),
    ("11", "game-rules", "Oyun ve Ödül Kuralları", "Games and Rewards Rules"),
    ("12", "vip-terms", "VIP ve Abonelik Şartları", "VIP and Subscription Terms"),
    ("13", "copyright", "Telif Hakkı ve Fikri Mülkiyet Politikası", "Copyright and Intellectual Property Policy"),
    ("14", "cookies", "Çerez ve Benzer Teknolojiler Politikası", "Cookies and Similar Technologies Policy"),
]

UI = {
    "tr": {"eyebrow": "Yasal", "all": "Tüm yasal metinler", "other": "English", "other_lang": "en", "hub": "yasal.html"},
    "en": {"eyebrow": "Legal", "all": "All legal documents", "other": "Türkçe", "other_lang": "tr", "hub": "en/legal.html"},
}


def inline(text):
    """Escapes a line and keeps its **bold**, web addresses and e-mail addresses (as links)."""
    t = html.escape(text, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w/@.])(https://[\w./%?=&#-]+[\w/])", r'<a href="\1">\1</a>', t)
    t = re.sub(r"(?<![\w.])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)", r'<a href="mailto:\1">\1</a>', t)
    return t


def body(md):
    """The document's body as HTML, and its title and status line (shown above it, not in it)."""
    title, status, out, items = "", "", [], []

    def flush():
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>")
            items.clear()

    for line in md.splitlines():
        s = line.strip()
        if s.startswith("- "):
            items.append(s[2:])
            continue
        flush()
        if not s:
            continue
        if s.startswith("# "):
            title = s[2:].replace("SimilarClub — ", "")
        elif s.startswith("### "):
            out.append(f"<h3>{inline(s[4:])}</h3>")
        elif s.startswith("## "):
            out.append(f"<h2>{inline(s[3:])}</h2>")
        elif re.fullmatch(r"\*\*(.+)\*\*", s) and not status:
            status = s.strip("*")
        else:
            out.append(f"<p>{inline(s)}</p>")
    flush()
    return title, status, "\n          ".join(out)


def template():
    """website/hesap-silme.html cut round its document: what comes before the eyebrow and after </main>."""
    t = open(os.path.join(SITE, "hesap-silme.html"), encoding="utf-8").read()
    head = t[: t.index('<p class="eyebrow')]
    foot = t[t.index("    </main>") :]
    return head, foot


def relocate(chunk, depth):
    """Relative links of a page `depth` folders down (tr/, en/) point back up to the site's root."""
    if not depth:
        return chunk
    up = "../" * depth

    def fix(m):
        attr, url = m.group(1), m.group(2)
        if re.match(r"^(https?:|mailto:|tel:|#|/|data:)", url):
            return m.group(0)
        return f'{attr}="{up}{url[2:] if url.startswith("./") else url}"'

    return re.sub(r'\b(href|src)="([^"]*)"', fix, chunk)


# Parts of a document's status line ("Sürüm 1.0 • Taslak, yayımlamayın • Yürürlük: [ONAY TARİHİ]") that readers don't
# see: the owners chose to publish the texts without the draft label or the empty effective date (26-27 Nov 2026), so
# the page shows "Sürüm 1.0". Once the lawyer writes a real date in the .md, the "Yürürlük" part shows again.
HIDDEN_STATUS = ("Taslak", "Draft", "[ONAY TARİHİ]", "[APPROVAL DATE]")


def status_for_readers(status):
    return " • ".join(p for p in status.split(" • ") if not any(h in p for h in HIDDEN_STATUS))

YASAL_COLUMN = re.compile(r"(<h5>Yasal</h5>\s*<ul>)(.*?)(</ul>)", re.S)


def footer_links(depth):
    up = "../" * depth
    links = [
        (f"{up}tr/privacy.html", "Gizlilik politikası"),
        (f"{up}tr/terms.html", "Kullanım koşulları"),
        (f"{up}tr/community-guidelines.html", "Topluluk kuralları"),
        (f"{up}yasal.html", "Tüm yasal metinler"),
    ]
    return "".join(f'\n              <li><a href="{h}">{n}</a></li>' for h, n in links) + "\n            "


def with_footer(page, depth):
    return YASAL_COLUMN.sub(lambda m: m.group(1) + footer_links(depth) + m.group(3), page)


def page(lang, title, description, inner, depth, canonical):
    head, foot = template()
    head = head.replace('<html lang="tr"', f'<html lang="{lang}"')
    head = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)} · Similar Club</title>", head)
    head = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{html.escape(description)}">', head)
    head = head.replace("</head>", f'  <link rel="canonical" href="https://similarclub.online/{canonical}">\n</head>')
    return with_footer(relocate(head, depth) + inner + relocate(foot, depth), depth)


def doc_page(lang, num, slug, names):
    md = open(os.path.join(HERE, lang, f"{num}-{slug}.md"), encoding="utf-8").read()
    title, status, content = body(md)
    status = status_for_readers(status)
    ui = UI[lang]
    other = ui["other_lang"]
    words = title.split(" ")
    shown = html.escape(" ".join(words[:-1])) + (f" <em>{html.escape(words[-1])}</em>" if len(words) > 1 else html.escape(words[0]))
    inner = f"""<p class="eyebrow reveal">{ui['eyebrow']}</p>
        <h1 class="display reveal" style="--d:.08s">{shown}</h1>
        <p class="doc__meta reveal" style="--d:.16s">{html.escape(status)}</p>
        <p class="doc__meta reveal" style="--d:.2s"><a href="../{ui['hub']}">{ui['all']}</a> · <a href="../{other}/{slug}.html" hreflang="{other}" lang="{other}">{ui['other']}</a></p>
        <div class="doc__body reveal" style="--d:.24s">
          {content}
        </div>
      </div>
"""
    out = page(lang, title, f"Similar Club · {title}", inner, 1, f"{lang}/{slug}")
    path = os.path.join(SITE, lang, f"{slug}.html")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8", newline="\n").write(out)
    return title


def hub(lang):
    ui = UI[lang]
    depth = 0 if lang == "tr" else 1
    up = "../" * depth
    other = ui["other_lang"]
    items = "".join(f'\n            <li><a href="{up}{lang}/{slug}.html">{html.escape(tr if lang == "tr" else en)}</a></li>' for _, slug, tr, en in DOCS)
    if lang == "tr":
        h1, meta, note, switch = "Yasal <em>metinler</em>", "Similar Club · SIMILARCLUB LTD", "Yayıncı ve ajans sözleşmeleri taraflara ayrıca iletilir. Hesabını silmek için: ", f'<a href="en/legal.html" hreflang="en" lang="en">English</a>'
        delete = '<a href="hesap-silme.html">Hesap silme</a>.'
    else:
        h1, meta, note, switch = "Legal <em>documents</em>", "Similar Club · SIMILARCLUB LTD", "Host and agency agreements are provided to the parties separately. To delete your account: ", f'<a href="../yasal.html" hreflang="tr" lang="tr">Türkçe</a>'
        delete = '<a href="../hesap-silme.html">Account deletion</a> (in Turkish).'
    inner = f"""<p class="eyebrow reveal">{ui['eyebrow']}</p>
        <h1 class="display reveal" style="--d:.08s">{h1}</h1>
        <p class="doc__meta reveal" style="--d:.16s">{meta} · {switch}</p>
        <div class="doc__body reveal" style="--d:.24s">
          <ul>{items}
          </ul>
          <p>{note}{delete}</p>
        </div>
      </div>
"""
    title = "Yasal metinler" if lang == "tr" else "Legal documents"
    out = page(lang, title, "Similar Club yasal metinleri." if lang == "tr" else "Similar Club legal documents.", inner, depth, "yasal" if lang == "tr" else "en/legal")
    path = os.path.join(SITE, "yasal.html" if lang == "tr" else os.path.join("en", "legal.html"))
    open(path, "w", encoding="utf-8", newline="\n").write(out)


def main():
    for lang in ("tr", "en"):
        for num, slug, tr, en in DOCS:
            doc_page(lang, num, slug, (tr, en))
        hub(lang)
    # The footers of the site's own pages point at the same texts.
    for name in os.listdir(SITE):
        if name.endswith(".html") and name not in ("yasal.html",):
            p = os.path.join(SITE, name)
            t = open(p, encoding="utf-8", newline="").read()
            n = with_footer(t, 0)
            if n != t:
                open(p, "w", encoding="utf-8", newline="").write(n)
    print(f"{len(DOCS)} documents x 2 languages, 2 lists, footers updated")


if __name__ == "__main__":
    sys.exit(main())
