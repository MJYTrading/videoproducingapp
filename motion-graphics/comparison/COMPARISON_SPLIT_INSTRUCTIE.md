# Motion Graphic Instructie: Comparison Split

## Wat is het?
Twee kanten naast elkaar gescheiden door een divider met VS-badge. Elke kant heeft een eigen kleur, heading en punten. Optionele conclusie-balk onderaan.

## Wanneer gebruiken?
Wanneer **twee opties, standpunten of entiteiten** tegenover elkaar gezet worden:
- Voor vs Tegen
- Product A vs Product B
- Land A vs Land B
- Optie 1 vs Optie 2

## Wanneer NIET gebruiken?
- Meer dan 2 opties → gebruik Listicle Grid of Stat Bars
- Puur numerieke vergelijking → gebruik Stat Bars
- Trend/verloop → gebruik Line Graph

## Parameters

```json
{
    "type": "comparison_split",
    "data": {
        "title": "KERNENERGIE IN NEDERLAND",
        "left": {
            "heading": "VOORSTANDERS",
            "color": "#44cc88",
            "logo_path": "/pad/naar/logo.png",
            "points": ["CO2-neutraal", "Stabiele energievoorziening"]
        },
        "right": {
            "heading": "TEGENSTANDERS",
            "color": "#ff4444",
            "logo_path": "/pad/naar/logo.png",
            "points": ["Kernafval probleem", "Hoge bouwkosten"]
        },
        "conclusion": "Kabinet besluit in 2025 over twee nieuwe centrales",
        "source": "Bron: Rijksoverheid.nl, 2024",
        "duration": 5.0,
        "stagger_delay": 0.25
    }
}
```

### Velden per kant (left/right)
| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `heading` | Ja | Naam/titel van deze kant |
| `color` | Ja | Hex kleurcode — moet context-relevant zijn |
| `points` | Ja | Lijst van punten (strings), 1-10 per kant |
| `logo_path` | Nee | Pad naar logo, verschijnt naast heading |

### Overige velden
| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `title` | Nee | Titel bovenaan |
| `conclusion` | Nee | Conclusie-balk onderaan (verschijnt als laatste) |
| `source` | Nee | Bronvermelding rechtsonder |
| `duration` | Nee | Totale duur (default: 5.0) |
| `stagger_delay` | Nee | Vertraging tussen punten (default: 0.25) |

### Timing
| Punten per kant | stagger_delay | duration |
|-----------------|---------------|----------|
| 2-3 | 0.3 | 4.0 |
| 4-5 | 0.25 | 5.0 |
| 6-8 | 0.2 | 6.0 |
| 9-10 | 0.15 | 7.0 |

## ⚠️ BELANGRIJK: Kleuren moeten context-relevant zijn

### Standaard voor/tegen
| Kant | Kleur | Code |
|------|-------|------|
| Voorstanders / Positief | Groen | `#44cc88` |
| Tegenstanders / Negatief | Rood | `#ff4444` |

### Bij merkvergelijking: gebruik merkkleuren
| Vergelijking | Links | Rechts |
|-------------|-------|--------|
| iPhone vs Android | `#A2AAAD` (Apple grijs) | `#3DDC84` (Android groen) |
| Netflix vs Disney+ | `#E50914` (Netflix rood) | `#113CCF` (Disney blauw) |
| Facebook vs TikTok | `#1877F2` (FB blauw) | `#EE1D52` (TikTok rood) |

### Bij landen: gebruik vlagkleuren
| Vergelijking | Links | Rechts |
|-------------|-------|--------|
| Nederland vs België | `#FF6600` (NL oranje) | `#FDDA24` (BE geel) |
| EU vs VS | `#003399` (EU blauw) | `#B31942` (VS rood) |

### Bij politiek: gebruik partijkleuren
Zie kleurentabel in STAT_BARS_INSTRUCTIE.md

### Logo's
- Bij merkvergelijkingen: ALTIJD logo's meegeven via `logo_path`
- Bij voor/tegen: geen logo's nodig
- Bij landen: eventueel vlag-icoon als logo

## Voorbeelden

### Voorbeeld 1: Voor vs Tegen
```json
{
    "title": "KERNENERGIE IN NEDERLAND",
    "left": {
        "heading": "VOORSTANDERS",
        "color": "#44cc88",
        "points": ["CO2-neutraal", "Stabiele energievoorziening", "Minder afhankelijk van gas", "Veel energie per reactor"]
    },
    "right": {
        "heading": "TEGENSTANDERS",
        "color": "#ff4444",
        "points": ["Kernafval probleem", "Hoge bouwkosten", "Risico op rampen", "Lange bouwtijd (10+ jaar)"]
    },
    "conclusion": "Kabinet besluit in 2025 over twee nieuwe centrales",
    "source": "Bron: Rijksoverheid.nl, 2024"
}
```

### Voorbeeld 2: Merkvergelijking
```json
{
    "left": {
        "heading": "NETFLIX",
        "color": "#E50914",
        "logo_path": "/path/to/netflix_logo.png",
        "points": ["Grootste bibliotheek", "Sterkere originals", "Hogere prijs"]
    },
    "right": {
        "heading": "DISNEY+",
        "color": "#113CCF",
        "logo_path": "/path/to/disney_logo.png",
        "points": ["Familiecontent", "Marvel/Star Wars", "Goedkoper abonnement"]
    },
    "source": "Bron: Streaming Observer, 2024"
}
```

## Gedrag
- **Divider** groeit vanuit het midden met VS-badge
- **Headings** schuiven in van links/rechts
- **Logo** (optioneel) verschijnt naast heading
- **Punten** verschijnen gestaffeld, links en rechts gelijktijdig
- **Conclusie** verschijnt als laatste (optioneel)
- **Bron** rechtsonder in grijs
- Dynamische font sizes voor 1-10 punten per kant
