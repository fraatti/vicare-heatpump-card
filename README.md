# ViCare Heat Pump Card

A Home Assistant Lovelace card for Viessmann heat pumps connected through the built-in **ViCare** integration. It draws the refrigerant circuit the way the heat pump's own service display does, lets you scrub and play back the history, and shows the operating point in a **log p-h diagram** with an indicative health check.

*Suomenkielinen ohje on alempana.*

![Card](images/card.png)

## Features

- **Refrigerant circuit**: hot gas and suction gas (temperature and pressure), liquid line, condensing (tc) and evaporating (t0) temperatures, subcooling, superheat, heating water and brine temperatures. Pipes are coloured by temperature and moving dots show the flow while the pumps and the compressor run.
- **Heat exchangers**: the condenser shows desuperheating, condensing and subcooled liquid, the evaporator boiling and superheating. The zone heights follow the measured superheat and subcooling.
- **Heating circuit, hot water cylinder and brine loop** on wide cards: floor heating loop (or radiators), the cylinder with its coil and a stratification estimate from the single top sensor, the brine pump and loop. A DHW circulation pump is drawn only if its history shows that it has run.
- **Operating state**: heating, hot water, preparing, pause, defrost or off.
- **Trends**: temperatures and pressures with a band for every run. Drag across the chart or use the slider to see the circuit at any moment, step a day back or forward, play the history (1, 2 or 5 min/s) or enlarge the charts to read every value at the cursor.
- **log p-h diagram** with the cycle points, a point table and a health check (superheat, subcooling, hot gas temperature, approaches, ΔT, lift tc − t0 against the controller's limit).
- **Logbook** (optional): the heat pump's own event log, kept in a CSV file and shown in the card and on the timeline.
- No entity IDs to set up: entities are found from the ViCare integration's own sensor keys. Finnish and English, light and dark themes, phone layout.

## Installation

### HACS (custom repository)

1. HACS → ⋮ → *Custom repositories* → add this repository's URL, type **Dashboard**.
2. Install **ViCare Heat Pump Card** and reload the browser.

### Manual

1. Copy `dist/vicare-heatpump-card.js` to `/config/www/vicare-heatpump-card.js`.
2. Settings → Dashboards → ⋮ → *Resources* → *Add resource*: URL `/local/vicare-heatpump-card.js?v=1`, type *JavaScript module*. Raise the `v` number after every update.
3. Reload the browser.

## Configuration

```yaml
type: custom:vicare-heatpump-card
refrigerant: R410A       # R410A, R32, R290, R134a, R407C
hours: 24                # 6, 24 or 48; the buttons change it on the fly
max_lift: 62             # refrigerant controller limit for tc - t0 (Vitotronic 200 WO1C parameter 5080)
```

| Option | Default | Description |
|---|---|---|
| `device_id` | first ViCare heat pump | Device to show |
| `title` | "Heat pump" | Card title |
| `refrigerant` | `R410A` | Used for tc, t0 and the log p-h diagram; check the rating plate |
| `hours` | `24` | Trend length |
| `max_lift` | `62` | Lift limit (K) used by the health check |
| `heating_circuit` | `floor` | `floor` or `radiators` (label only) |
| `cold_water` | `10` | Cold mains water temperature for the cylinder estimate |
| `show_trend`, `show_info`, `show_logbook` | `true` | Parts of the card |
| `steady_minutes` | `10` | Minutes from compressor start before the health check |
| `entities` | – | Override single roles, e.g. `entities: { hot_gas_p: sensor.my_pressure }` |

Most refrigerant circuit sensors of the ViCare integration are **disabled by default**. Open the device page, choose *+ N entities not shown* and enable at least hot gas and suction gas temperature and pressure, liquid gas temperature, condenser subcooling and evaporator overheat. The card lists the sensors it is missing.

## Optional extras (`examples/`)

Copy the packages to `/config/packages` (`homeassistant: packages: !include_dir_named packages` in `configuration.yaml`). The entity IDs are those of a Vitocal 333-G (`cu401b_g_*`); change them for your unit.

| File | What it does |
|---|---|
| `packages/heatpump_tc_t0.yaml` | tc and t0 as sensors (history and statistics) |
| `packages/heatpump_dhw.yaml` | Lift tc − t0 and the highest lift and pressure of every hot water run |
| `packages/heatpump_weekly.yaml` | Weekly means during runs, run lengths and runtimes, kept in long-term statistics |
| `packages/heatpump_logbook.yaml` + `vicare_logbook.py` | Keeps the device logbook (`/config/vicare_logbook.csv`) and notifies about unusual entries. Uses the ViCare integration's own token, which is never printed or stored; 48 API calls a day |
| `heatpump-dashboard.yaml` | Example dashboard with the card, the packages and history views |

## Development

`demo/index.html` shows the card with synthetic data (`demo/mock.js`) without Home Assistant; open it through any local web server.

## Limitations

- ViCare is cloud polled; values change every minute or two and short "unavailable" gaps are bridged.
- History goes back as far as the recorder keeps it (10 days by default).
- The health check limits are general guidance for ground source heat pumps, not manufacturer values, and it is no substitute for service.
- Tested with a Vitocal 333-G (CU401B_G, R410A). Feedback from other models is welcome; please attach your ViCare diagnostics file to an issue.

Refrigerant properties were generated with [CoolProp](http://www.coolprop.org/).

---

## Suomeksi

Kortti näyttää Viessmann-lämpöpumpun kylmäainepiirin samaan tapaan kuin laitteen oma huoltonäyttö. Siinä on lisäksi lattialämmitys, käyttövesivaraaja ja liuospiiri, trendit, historian kelaus ja toisto sekä log p-h -piirros, jossa on suuntaa antava arvio toiminnasta. Kortti käyttää ViCare-integraation omia tietoja ja tunnistaa anturit itse.

**Asennus**
1. HACS → ⋮ → *Custom repositories* → tämän repositorion osoite, tyyppi *Dashboard*. Tai kopioi `dist/vicare-heatpump-card.js` kansioon `/config/www/` ja lisää resurssi `/local/vicare-heatpump-card.js?v=1` (JavaScript-moduuli).
2. Ota ViCare-laitteen sivulta käyttöön kylmäainepiirin anturit (kuumakaasu, imukaasu, nestelinja, alijäähdytys, tulistus). Kortti kertoo, mitkä puuttuvat.
3. Lisää kortti kortinvalitsimesta (*ViCare Heat Pump Card*).

**Käyttö**
- Raahaa kuvaajaa tai liukusäädintä, niin kaavio näyttää valitun hetken. ‹ ja › vaihtavat päivää, ▶ toistaa historiaa, ⤢ suurentaa kuvaajat ja näyttää lukemat kohdistimen kohdalla, *Nyt* palaa nykyhetkeen.
- *log p-h* avaa kiertoprosessin piirroksen ja arvion, kun kompressori on käynyt vähintään 10 minuuttia.

**Lisäosat** (`examples/`): tc/t0-anturit, käyttövesijaksojen nostokorkeus, viikkotilastot, tapahtumaloki ja valmis kojelauta. Entiteetti-ID:t ovat Vitocal 333-G:n; vaihda ne omaan laitteeseen sopiviksi.

Arvion rajat ovat yleisiä ohjearvoja maalämpöpumpuille, eivät valmistajan arvoja, eikä arvio korvaa huoltoa.

## License

MIT
