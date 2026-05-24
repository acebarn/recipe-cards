#let muted = rgb("#6f6a63")

// Wandelt **fett** aus dem Markdown-Quelltext in echten Fettdruck um.
#let render-md(s) = {
  let parts = s.split("**")
  for (i, part) in parts.enumerate() {
    if calc.rem(i, 2) == 1 { strong(part) } else { part }
  }
}

#let chip(label, value, bg) = box(
  fill: bg,
  inset: (x: 6pt, y: 3pt),
  radius: 4pt,
)[
  #text(size: 6.5pt, fill: muted)[#upper(label)]#h(4pt)#text(size: 8.5pt, weight: "medium")[#value]
]

// Ersten Buchstaben groß (grapheme-sicher).
#let cap(s) = if s.len() > 0 [#upper(s.clusters().first())#s.clusters().slice(1).join("")] else [#s]

// Abgerundete Pille für Zubehör-Einträge.
#let equip-pill(value, theme) = box(
  fill: rgb(theme.panelBg),
  inset: (x: 7pt, y: 3pt),
  radius: 1em,
)[#text(size: 7.5pt, fill: rgb(theme.panelHeading))[#cap(value)]]

// ---- Bauhaus-Geometrie ----
#let ink = rgb("#1c1c1c")
#let tri(size, fill, ang: 0deg) = rotate(ang, polygon.regular(vertices: 3, size: size, fill: fill))

// Quadratischer Aufzählungs-Marker (vertikal an die Textzeile angepasst).
#let sq-marker(fill) = box(baseline: 1pt, rect(width: 4.5pt, height: 4.5pt, fill: fill))

// Schritt-Nummer in gefülltem Kreis.
#let num-circle(n, fill) = box(baseline: 3.5pt, circle(
  radius: 7pt,
  fill: fill,
  inset: 0pt,
)[#align(center + horizon, text(fill: white, size: 8pt, weight: "bold")[#n])])

// Bauhaus-Trennlinie: Quadrat-Knoten links, Linie, Dreieck (Pfeil) rechts.
#let bauhaus-divider(accent) = grid(
  columns: (auto, 1fr, auto),
  align: horizon,
  column-gutter: 6pt,
  rect(width: 7pt, height: 7pt, fill: accent),
  line(length: 100%, stroke: 0.8pt + accent),
  tri(9pt, ink, ang: 90deg),
)

// Rundes Symbolbild bzw. getöntes Platzhalter-Badge.
#let badge(data, theme, size) = {
  if data.image != none {
    // Leichter Zentral-Zoom (1.18×) schiebt Rand-Artefakte aus dem runden Ausschnitt.
    box(
      width: size,
      height: size,
      clip: true,
      radius: 50%,
      stroke: 1.2pt + rgb(theme.accentSoft),
      place(
        center + horizon,
        image(data.image, width: size * 1.18, height: size * 1.18, fit: "cover"),
      ),
    )
  } else {
    box(
      width: size,
      height: size,
      radius: 50%,
      fill: rgb(theme.placeholderBg),
      stroke: 1pt + rgb(theme.accentSoft),
      align(center + horizon, text(
        size: size * 0.45,
        weight: "bold",
        fill: rgb(theme.accent),
      )[#upper(data.title.clusters().first())]),
    )
  }
}

// Badge mit Bauhaus-Akzenten (Dreieck dahinter, kleines Quadrat) – Akzente skalieren mit.
#let badge-accented(data, theme, size) = {
  let accent = rgb(theme.accent)
  box(width: size, height: size, {
    place(top + left, dx: -0.07 * size, dy: -0.07 * size, tri(0.4 * size, accent, ang: -18deg))
    place(bottom + right, dx: 0.07 * size, dy: 0.07 * size, rect(width: 0.17 * size, height: 0.17 * size, fill: ink))
    badge(data, theme, size)
  })
}

// Hintergrund Vorderseite: weiße Fläche mit blassen Formen + Konstruktionslinie.
#let front-bg(accent) = {
  place(bottom + right, dx: 42mm, dy: 40mm, circle(radius: 58mm, fill: accent.lighten(90%)))
  place(top + left, dx: -32mm, dy: -30mm, circle(radius: 48mm, stroke: 0.6pt + accent.lighten(62%)))
  place(bottom + left, dx: -18mm, dy: 20mm, tri(46mm, accent.lighten(86%), ang: 22deg))
  place(top + right, dx: 8mm, dy: 30mm, line(angle: 205deg, length: 95mm, stroke: (paint: accent.lighten(45%), thickness: 0.5pt, dash: "dashed")))
}

// Hintergrund Rückseite: dezenter Vollton-Wash + gespiegelte Formen (leicht anders als vorne).
#let back-bg(accent) = {
  rect(width: 100%, height: 100%, fill: accent.lighten(95%))
  place(bottom + left, dx: -42mm, dy: 40mm, circle(radius: 58mm, fill: accent.lighten(87%)))
  place(top + right, dx: 32mm, dy: -30mm, circle(radius: 48mm, stroke: 0.6pt + accent.lighten(58%)))
  place(bottom + right, dx: 18mm, dy: 20mm, tri(46mm, accent.lighten(84%), ang: -22deg))
  place(top + left, dx: -8mm, dy: 34mm, line(angle: -25deg, length: 95mm, stroke: (paint: accent.lighten(45%), thickness: 0.5pt, dash: "dashed")))
}

#let card(data) = {
  let theme = data.theme
  let accent = rgb(theme.accent)

  set page(
    paper: "a5",
    flipped: true, // Querformat
    margin: (x: 11mm, top: 8mm, bottom: 11mm),
    footer-descent: 4mm,
    // Vorder- und Rückseite unterscheiden sich gestalterisch (per Seitenzahl).
    background: context {
      if counter(page).get().first() == 1 { front-bg(accent) } else { back-bg(accent) }
    },
    footer: context {
      set text(size: 6.5pt, fill: muted)
      line(length: 100%, stroke: 0.4pt + rgb(theme.accentSoft))
      v(2pt)
      let front = counter(page).get().first() == 1
      grid(
        columns: (1fr, auto),
        text(style: "italic")[#data.title],
        [#(if front { "Vorderseite · Zutaten" } else { "Rückseite · Zubereitung" })],
      )
    },
  )
  set text(
    font: ("Futura", "Helvetica Neue", "Arial", "Apple Color Emoji"),
    size: 9pt,
    lang: "de",
    hyphenate: true,
  )
  set par(justify: false, leading: 0.5em)

  // ============================================================
  //  VORDERSEITE — Titel, Header-Content, Zutaten
  // ============================================================
  grid(
    columns: (1fr, auto),
    column-gutter: 16pt,
    align: (left + top, right + horizon),
    {
      // Akzentblock hinter dem Titel: kräftige Fläche, Knockout-Schrift in Weiß.
      // top-edge/bottom-edge an Versalhöhe bzw. Unterlänge: so wirkt das
      // symmetrische Padding optisch gleich (Oberkante Großbuchstaben ↔ Unterlänge p/g).
      block(fill: accent, inset: (x: 10pt, y: 7pt))[
        #text(
          size: 26pt,
          weight: "bold",
          fill: white,
          hyphenate: false,
          top-edge: "bounds",
          bottom-edge: "bounds",
        )[#data.title]
      ]
      v(4pt)
      {
        let chips = ()
        if data.category != none { chips.push(chip("Kategorie", data.category, rgb(theme.chipBg))) }
        if data.difficulty != none { chips.push(chip("Schwierigkeit", data.difficulty, rgb(theme.chipBg))) }
        if data.servings != none { chips.push(chip("Portionen", data.servings, rgb(theme.chipBg))) }
        for t in data.times { chips.push(chip(t.label, t.value, rgb(theme.chipBg))) }
        if chips.len() > 0 {
          set par(leading: 8pt)
          for c in chips [#c #h(4pt)]
        }
      }
      if data.equipment.len() > 0 {
        v(4pt)
        text(size: 6.5pt, fill: muted)[#upper("Zubehör")]
        v(2pt)
        set par(leading: 7pt)
        for e in data.equipment [#equip-pill(e, theme)#h(4pt)]
      }
    },
    badge-accented(data, theme, 44mm),
  )

  v(5pt)
  bauhaus-divider(accent)
  v(6pt)

  // Zutaten-Panel über volle Breite, zweispaltig.
  block(
    fill: rgb(theme.panelBg),
    inset: 9pt,
    radius: 6pt,
    width: 100%,
    {
      set text(fill: rgb(theme.panelText))
      text(size: 12pt, weight: "bold", fill: rgb(theme.panelHeading))[Zutaten]
      v(4pt)
      columns(2, gutter: 18pt)[
        #for (i, sec) in data.ingredients.enumerate() {
          if sec.name != none {
            if i > 0 { v(3pt) }
            text(size: 9.5pt, weight: "bold", fill: rgb(theme.panelHeading))[#sec.name]
            v(1pt)
          }
          set list(indent: 0pt, body-indent: 6pt, spacing: 3.5pt, marker: sq-marker(accent))
          for item in sec.items [- #item]
        }
      ]
    },
  )

  // ============================================================
  //  RÜCKSEITE — Zubereitung
  // ============================================================
  pagebreak()

  grid(
    columns: (1fr, auto),
    column-gutter: 12pt,
    align: (left + horizon, right + top),
    {
      text(size: 7pt, fill: muted)[#upper("Zubereitung")]
      v(2pt)
      text(size: 17pt, weight: "bold", fill: accent, hyphenate: false)[#data.title]
    },
    badge(data, theme, 20mm),
  )

  v(5pt)
  bauhaus-divider(accent)
  v(6pt)

  columns(2, gutter: 20pt)[
    #{
      set enum(indent: 0pt, body-indent: 10pt, spacing: 6pt, numbering: n => num-circle(n, accent))
      for step in data.steps [+ #render-md(step.text)]
    }
    #if data.notes.len() > 0 {
      v(6pt)
      block(
        width: 100%,
        fill: rgb(theme.noteBg),
        inset: 8pt,
        radius: 5pt,
        breakable: false, // als Ganzes umbrechen (in die nächste Spalte), nicht mitten im Kasten teilen
        {
          text(size: 9pt, weight: "bold", fill: accent)[Hinweise]
          v(3pt)
          set list(indent: 0pt, body-indent: 6pt, spacing: 3.5pt, marker: sq-marker(accent))
          for n in data.notes [- #n]
        },
      )
    }
  ]

  // Finale Seitenzahl als abfragbares Metadatum (für die Max-2-Seiten-Prüfung der CLI).
  context [#metadata(counter(page).final().first()) <pagecount>]
}
