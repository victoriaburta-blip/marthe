# Marthe

Eine kleine Lern-App (PWA) für Mathe-Theorie auf Abitur-Niveau – im Duolingo-Stil:
kurze tägliche Sessions mit Multiple-Choice-Fragen, Leitner-System und Streak.
Reines HTML/CSS/JavaScript, kein Framework, kein Backend, keine Tracker.

Auf der Startseite wählt man: **Analysis, Geometrie, Stochastik** oder **Gemischt**.
Aktuell ist nur **Geometrie** freigeschaltet; die anderen zeigen „Diese Seite wird
noch bearbeitet“.

## Ordnerstruktur

```
mathe-karten/
├── index.html          App (Startseite, Thema, Session, Ergebnis, Export/Import)
├── cards/
│   ├── geometrie.json  Lernkarten Geometrie (aktiv)
│   └── analysis.json   Lernkarten Analysis/Ableitungen (noch nicht freigeschaltet)
├── manifest.json       PWA-Manifest (Name, Farben, Icons)
├── sw.js               Service Worker (Offline-Cache)
├── impressum.html      Platzhalter, selbst ausfüllen
├── datenschutz.html    Platzhalter, selbst ausfüllen
├── css/style.css       Design (Farben ganz oben in :root)
├── js/
│   ├── storage.js      Lernstand, Leitner-Boxen, Streak, Export/Import
│   └── app.js          Oberfläche, Themenliste (TOPICS) und Ablauf
├── icons/              App-Icon Mars (PNG + SVG)
├── fonts/              Schrift Poppins (lokal, SIL Open Font License)
├── img/                Abbildungen zu Fragen (Spat, Pyramide, Lage- und Abstandsskizzen)
└── vendor/katex/       KaTeX 0.16.11 (lokal, inkl. Schriften, MIT-Lizenz)
```

## Lokal starten

Die App muss über einen kleinen Webserver laufen (nicht per Doppelklick auf
`index.html`), weil die Karten per `fetch` geladen werden und Service Worker
nur über `http://localhost` oder HTTPS funktionieren.

Im Ordner `mathe-karten`:

```bash
python -m http.server 8000
```

Dann im Browser <http://localhost:8000> öffnen.
Alternativ mit Node.js: `npx serve .`

## Kostenlos veröffentlichen

### Netlify

1. Auf <https://app.netlify.com/drop> gehen.
2. Den Ordner `mathe-karten` per Drag & Drop in das Fenster ziehen.
3. Fertig – Netlify zeigt dir eine HTTPS-Adresse. Unter *Site configuration*
   kannst du den Namen ändern (z. B. `marthe.netlify.app`).

### GitHub Pages

1. Neues Repository auf GitHub anlegen und den **Inhalt** von `mathe-karten`
   hochladen (so dass `index.html` im Hauptverzeichnis liegt).
2. *Settings → Pages → Build and deployment*: Source „Deploy from a branch“,
   Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ca. einer Minute ist die App unter
   `https://<benutzername>.github.io/<repo-name>/` erreichbar.

Alle Pfade sind relativ, die App funktioniert daher auch in einem Unterordner.

## Installieren auf dem Handy

- **Android (Chrome):** Seite öffnen → Menü ⋮ → „App installieren“.
- **iPhone (Safari):** Seite öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.

## Kapitel

Jedes Thema hat Kapitel. Sie stehen oben in der Karten-Datei, z. B. in
`cards/geometrie.json`:

```json
"chapters": [
  { "id": "vektoren", "name": "Vektoren" },
  { "id": "geraden", "name": "Geraden" }
]
```

Die Reihenfolge hier ist die Reihenfolge in der App. Darunter erscheint immer
automatisch **„Alle Kapitel“** (fragt alle Kapitel gemischt ab). Ein Tipp auf ein
Kapitel startet sofort eine Session. Kapitel ohne Fragen zeigen „noch keine Fragen“.

## Fragen hinzufügen (Multiple Choice)

In der passenden Datei in `cards/` einen Eintrag ergänzen:

```json
{
  "id": "ger-01",
  "chapter": "geraden",
  "question": "Wie berechnet man den Mittelpunkt $M$ der Strecke $\\overline{AB}$?",
  "options": [
    "$\\vec m = \\vec b - \\vec a$",
    "$\\vec m = \\frac{1}{2}\\left(\\vec a + \\vec b\\right)$",
    "$\\vec m = \\vec a + \\vec b$",
    "$\\vec m = 2\\left(\\vec a + \\vec b\\right)$"
  ],
  "correct": 1,
  "hint": "Der Mittelwert der Koordinaten.",
  "explanation": "Optional: wird nach dem Beantworten angezeigt."
}
```

- `chapter`: die `id` des Kapitels, zu dem die Frage gehört. Soll eine Frage in
  mehreren Kapiteln vorkommen, eine Liste angeben, z. B.
  `"chapter": ["geraden", "lage"]`. Unter „Alle Kapitel“ erscheint sie trotzdem nur einmal.
- `options`: genau **4** Antworten. Die App mischt die Reihenfolge bei jeder Anzeige.
- `image` (optional): Bild zur Frage, z. B. `"img/spat.svg"`, mit `imageAlt` als
  kurzer Bildbeschreibung. Neue Bilder in `img/` ablegen und in `sw.js` bei
  `PRECACHE` eintragen, damit sie offline verfügbar sind.
- `correct`: Position der richtigen Antwort in `options`, **gezählt ab 0**
  (0 = erste, 1 = zweite, 2 = dritte, 3 = vierte).
- `hint` (Tipp) und `explanation` (Erklärung nach dem Beantworten) sind optional –
  weglassen oder `null`.
- `id` muss über **alle** Themen eindeutig sein (Präfix `vek-`, `ger-`, `ebe-` …)
  und darf später **nicht geändert** werden – der Lernstand hängt an der id.
- Formeln: `$…$` im Fließtext, `$$…$$` für abgesetzte Formeln (KaTeX-Syntax).
  In JSON muss jeder Backslash verdoppelt werden: `\\frac`, `\\vec`.
- `\n` erzeugt einen Zeilenumbruch.
- Fragen, die nicht diesem Format entsprechen, werden von der App ignoriert.
  (`cards/analysis.json` enthält noch die alten Karteikarten zu Ableitungen
  im Frage/Antwort-Format – als Material zum Umschreiben.)

## Ein Thema freischalten

1. Karten-Datei anlegen, z. B. `cards/stochastik.json` (gleiches Format wie
   `geometrie.json`).
2. In `js/app.js` ganz oben in `TOPICS` beim Thema `ready: true` setzen.
   „Gemischt“ lädt automatisch die Karten aller drei Themen.
3. Neue Datei in `sw.js` in die Liste `PRECACHE` eintragen.
4. In `sw.js` die Versionsnummer erhöhen (z. B. `marthe-v17` → `marthe-v18`), damit
   installierte Apps alles neu laden. Das gilt nach **jeder** Änderung an den
   App-Dateien.

## Wie die App lernt

- **Session:** startet mit der Wahl eines Kapitels und enthält **alle** Fragen dieses
  Kapitels mit je 4 Antworten. Die Reihenfolge ist jedes Mal anders als in der letzten
  Session (auch die erste Frage). Ein Tipp kann eingeblendet werden.
- **Zwei Versuche:** Nach einer falschen Antwort darf man noch einmal wählen;
  nach dem zweiten Fehler wird die richtige Antwort markiert.
- **Zum Wiederholen:** Jede Frage, die mindestens einmal falsch beantwortet wurde,
  landet in dieser Liste. Am Ende der Session wird sie angezeigt, und man wählt
  „Diese Fragen wiederholen“ oder „Session beenden“. Wird eine Frage später beim
  ersten Versuch richtig beantwortet, verschwindet sie aus der Liste.
- **Leitner-System mit 3 Boxen:** Neue Fragen starten in Box 1.
  Beim ersten Versuch richtig → eine Box höher; sonst → zurück in Box 1.
  Box 1 kommt jede Session dran, Box 2 jede 2., Box 3 jede 4. Session.
  Die Boxen werden im Hintergrund mitgeführt, aber derzeit nicht angezeigt und
  nicht zur Auswahl der Fragen genutzt (eine Session enthält immer alle Fragen).
- **Streak** (gilt themenübergreifend): steigt um 1, wenn an einem neuen Tag eine
  Session abgeschlossen wird; fällt auf 0, wenn ein ganzer Tag ausgelassen wurde.

## Design

Zwei Farben, Schrift immer weiß:
Blau `#36648B` / SteelBlue4 (Hintergrund, Themen-Kacheln, Kapitel, Antworten) und
Orange `#CD4F39` (Kachel „Gemischt“, „Alle Kapitel“, Buttons, richtige Antwort,
Fortschritt, Hervorhebungen). Beide stehen als `--blue` und `--orange` oben in
`css/style.css`.

**Grundschrift:** *Poppins* in den Stärken 400, 600, 700 und 800. Die Dateien liegen in
`fonts/` und werden lokal geladen (keine Verbindung zu Google Fonts). Lizenz:
SIL Open Font License, siehe `fonts/Poppins-OFL.txt`.

**Schrift des App-Namens:** „Marthe“ ist in *BankGothic Medium* gesetzt
(Regel `.brand-name` in `css/style.css`). Die Schrift ist kommerziell und daher
nicht mitgeliefert. Sie erscheint, wenn sie auf dem Gerät installiert ist, oder
für alle Nutzer, wenn du eine Webfont-Datei mit gültiger Web-Lizenz als
`fonts/bankgothic-md.woff2` ablegst (dann auch in `sw.js` bei `PRECACHE`
eintragen). Ohne Datei wird eine Systemschrift in Kapitälchen als Ersatz gezeigt.

## Datenschutz

- Keine Konten, keine Namen, keine E-Mail-Adressen.
- Der Lernstand liegt nur im `localStorage` des Geräts.
- Keine Cookies, keine Analyse, keine externen Schriften oder CDNs
  (eine Content-Security-Policy in `index.html` blockiert fremde Server zusätzlich).
- Gerätewechsel über *Fortschritt exportieren / importieren*: Code kopieren,
  auf dem neuen Gerät einfügen.
