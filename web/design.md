# RootLens public website design

This file records the shared visual system for the RootLens public pages. The site explains an operating model to workplaces and research teams; it should read as a maintained professional resource rather than a promotional template.

## Reader and purpose

- Participating workplaces need to understand what they will do, what they can review, and when payment conditions are fixed.
- Data buyers need to judge available signals, formats, and provenance.
- Both audiences need a direct account of how consent, approval, processing, and provision relate.

The interface should help each reader find the relevant facts and make an informed decision without being pushed through repeated calls to action.

## Genre

Plain institutional editorial. The tone is direct, practical, and visibly maintained by people who do the work.

## Macrostructure

The reference is the structural clarity of Material Cultures: a simple name and navigation row, a white page ground, black hairline rules, content-led columns, and rectangular information rows. RootLens does not reproduce that site's imagery or page details.

- Home: one compact statement of the work, centred Background and Business sections, then three unnumbered navigation choices.
- Contribute: navigation followed directly by full-width accordion rows, then the footer. No standalone hero, summary strip, or closing CTA.
- Buy: compact introduction, factual summary, then bordered sections in reading order.
- Data policy: a three-part overview followed by the same three stages in detail.
- Footer: a plain colophon and legal navigation.

Sections occupy the page width. Columns are introduced only when the content is parallel or benefits from comparison.

## Colour

- White is the shared page ground.
- Text, rules, and controls are black; pale neutral grey is reserved for interaction states.
- Wheat and grass remain available as brand colours, but appear only when a specific piece of information benefits from the distinction.

All surfaces are flat. Do not use gradients, translucency, glass effects, grain, shadows, or decorative colour blooms.

## Typography

- Noto Sans JP is the public site's primary face for Japanese and Latin text.
- Geist is available for supporting Latin text; Geist Mono is reserved for compact identifiers or metadata.
- Headings use the same sans-serif family as the body. Hierarchy comes from size, weight, spacing, and rules rather than a display typeface.
- Long headings must wrap naturally. Do not force poster-like line breaks.

## Shape and rules

- Corners are square.
- Black one-pixel rules define rows and columns.
- Cards do not float above the page. A grouped set is one bordered region divided internally.
- Icons are used only when they communicate an action. Text arrows are sufficient for ordinary links.

## Motion and interaction

- The public information pages are static.
- Links may change their flat background on hover and must show a visible keyboard focus ring.
- Do not animate entry, scrolling, marquees, cards, images, or decorative elements.
- The mobile navigation opens and closes without spatial animation.

## Calls to action

The three audience entrances are navigation, not promotional cards. Contact and download actions appear as compact underlined text links at the point where they become useful. Do not repeat large CTA panels.

## Media

Use a photograph only when it documents an actual RootLens device, workplace, interface, or delivered dataset. Do not add stock imagery, generated illustrations, or decorative collage to fill a region.

## Performance

- Prefer server-rendered text and CSS layout.
- Keep the four main pages free of animation libraries and decorative media downloads.
- Share navigation, footer, tokens, and information-page styles.
- Legacy sample-viewer styles remain isolated from the four main public pages.

## Exports

### CSS

The canonical CSS token export is [`tokens.css`](tokens.css).

### Tailwind v4 mapping

```css
@theme {
  --color-wheat: var(--color-wheat);
  --color-grass: var(--color-grass);
  --color-paper: var(--color-paper);
  --color-ink: var(--color-ink);
  --font-sans: var(--font-body);
  --font-mono: var(--font-label);
  --spacing-page: var(--page-gutter);
}
```

### DTCG mapping

```json
{
  "color": {
    "wheat": { "$value": "#efd17b", "$type": "color" },
    "wheatSoft": { "$value": "#f8e8b7", "$type": "color" },
    "grass": { "$value": "#a8c968", "$type": "color" },
    "grassSoft": { "$value": "#dce9b9", "$type": "color" },
    "ink": { "$value": "#111111", "$type": "color" }
  },
  "dimension": {
    "pageGutter": { "$value": "clamp(1rem, 3vw, 2.5rem)", "$type": "dimension" },
    "rule": { "$value": "1px", "$type": "dimension" }
  }
}
```
