# ViCare Heat Pump Card

A Home Assistant Lovelace card for Viessmann heat pumps (ground and air source) connected through the built-in **ViCare** integration. It draws the refrigerant circuit the way the heat pump's own service display does, lets you scrub and play back the history, and shows the operating point in a **log p-h diagram** with an indicative health check.

*Suomenkielinen ohje on alempana.*

![Card: ground source heat pump](images/card.png)

![Card: air source heat pump in hot water mode](images/air-source.png)

## Features

- **Refrigerant circuit**: hot gas and suction gas (temperature and pressure), liquid line, condensing (tc) and evaporating (t0) temperatures, subcooling, superheat, heating water and brine temperatures. Pipes are coloured by temperature and moving dots show the flow while the pumps and the compressor run.
- **Heat exchangers**: the condenser shows desuperheating, condensing and subcooled liquid, the evaporator boiling and superheating. The zone heights follow the measured superheat and subcooling.
- **Heating circuit, hot water cylinder and brine loop** on wide cards: floor heating loop (or radiators), the cylinder with its coil and a stratification estimate from the single top sensor, the brine pump and loop. A DHW circulation pump is drawn only if its history shows that it has run.
- **Air source heat pumps**: an outdoor unit with the finned coil and the fan instead of the brine loop, and a 4-way valve. In defrost (and active cooling) the valve reverses the cycle: the hot gas goes to the outdoor coil, the fan stops and the heat is taken from the water. Preparing defrost and passive defrost (fan only) are shown too.
- **Speeds**: compressor % or rps, expansion valve opening, fan, brine and circulation pump speeds are shown when available, and the flow animations and pumps run faster or slower with them.
- **Operating state**: heating, hot water, preparing, pause, defrost or off.
- **Trends**: temperatures and pressures with a band for every run. Drag across the chart or use the slider to see the circuit at any moment, step a day back or forward, play the history (1, 2 or 5 min/s) or enlarge the charts to read every value at the cursor.
- **Units without a high pressure sensor** (e.g. Vitocal 250-A, 252-A, 200-A, 222-S): the condensing temperature is estimated from the liquid line and the supply water and marked with ≈; the checks that depend on it are left out.
- **log p-h diagram** with the cycle points, the source and supply temperature levels, a point table and a health check (superheat, subcooling, hot gas temperature, approaches, ΔT, lift tc − t0 against the controller's limit). Air source units are checked against outdoor air; defrost and cooling are not assessed, and the check waits for operation to settle after a defrost.
- **Logbook** (optional): the heat pump's own event log, kept in a CSV file and shown in the card and on the timeline. Vitotronic 200 (WO1C) units (Vitocal 300-G, 333-G, older 200-S/222-S) have a real logbook. Newer units (Vitocal 250-A, 252-A, 200-A, 151-A, newer 222-S) have none; for them the script logs the status, info, service and fault messages (S.125 heating, S.128 defrost, S.115 valve to hot water …) as they appear, with the unit's own time stamps.
- **Disabled sensors**: most refrigerant sensors of the ViCare integration are disabled by default. For an administrator the card lists the disabled ones it would use and enables them with one button.
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
| `extra_devices` | – | More ViCare devices whose sensors are used, e.g. the outdoor unit of a split system. Other heat pump devices of the same ViCare account are used automatically for sensors the main device lacks |
| `title` | "Heat pump" | Card title |
| `refrigerant` | `R410A` | Used for tc, t0 and the log p-h diagram; check the rating plate |
| `hours` | `24` | Trend length |
| `max_lift` | `62` | Lift limit (K) used by the health check |
| `source` | `auto` | Heat source: `ground` (brine loop) or `air` (outdoor unit). `auto` picks air when there is no brine return sensor and no brine pump |
| `heating_circuit` | `floor` | `floor` (floor heating loop) or `radiators` |
| `buffer` | `auto` | Buffer cylinder between the heat pump and the heating circuit: `auto` (drawn if a buffer temperature sensor exists), `yes`, `no` |
| `mixer` | `false` | Mixing valve (shunt) in the heating circuit |
| `heater` | `auto` | Electric flow-through heater after the condenser: `auto` (drawn if the `heater` sensor is set), `yes`, `no` |
| `show_logbook` / `log_markers` | `true` | Logbook text list / logbook markers on the timeline |
| `cold_water` | `10` | Cold mains water temperature for the cylinder estimate |
| `show_trend`, `show_info`, `show_logbook` | `true` | Parts of the card |
| `steady_minutes` | `10` | Minutes from compressor start before the health check |
| `entities` | – | Use your own entity for any role, e.g. `entities: { hot_gas_p: sensor.my_pressure }`. Also in the visual editor under *Sensors*. The card works without the ViCare integration when the roles are set here. |

Roles: `hot_gas_t`, `hot_gas_p`, `suction_t`, `suction_p`, `liquid_t`, `subcooling`, `superheat`, `eev`, `compressor`, `comp_speed`, `phase`, `starts`, `sec_supply`, `sec_return`, `circ_pump`, `circ_pump_speed`, `dhw_charging`, `dhw_top`, `dhw_circ`, `buffer_t`, `circ_supply`, `mixer`, `heater`, `pri_supply`, `pri_return`, `pri_pump`, `fan`, `outside`, `cop_heating`, `cop_dhw`, `cop_total`. `comp_speed` is found automatically on inverter units (`compressor_modulation`); your own sensor may give rps instead. `circ_pump_speed`, `mixer`, `heater`, `fan` (fan speed %) and `eev` (expansion valve opening %) are not provided by the ViCare integration; point them to your own sensors if you have them.

Most refrigerant circuit sensors of the ViCare integration are **disabled by default**. The card lists them under the diagram; an administrator can enable them there with *Enable* (Home Assistant reloads the integration about 30 seconds later). Or open the device page, choose *+ N entities not shown* and enable them there. Sensors the device does not have are listed separately.

## Optional extras (`examples/`)

Copy the packages to `/config/packages` (`homeassistant: packages: !include_dir_named packages` in `configuration.yaml`). The entity IDs are those of a Vitocal 333-G (`cu401b_g_*`); change them for your unit.

| File | What it does |
|---|---|
| `packages/heatpump_tc_t0.yaml` | tc and t0 as sensors (history and statistics) |
| `packages/heatpump_dhw.yaml` | Lift tc − t0 and the highest lift and pressure of every hot water run |
| `packages/heatpump_weekly.yaml` | Weekly means during runs, run lengths and runtimes, kept in long-term statistics |
| `packages/heatpump_logbook.yaml` + `vicare_logbook.py` | Keeps the device logbook (`/config/vicare_logbook.csv`) and notifies about unusual entries. On units without a logbook it logs the device messages instead (fault and service messages are notified, also when they clear). Uses the ViCare integration's own token, which is never printed or stored; 48 API calls a day. Message times are taken as UTC and shown in Home Assistant's time zone |
| `heatpump-dashboard.yaml` | Example dashboard with the card, the packages and history views |

## Development

`demo/index.html` shows the card without Home Assistant. It has a synthetic Vitocal 333-G with a 24-hour history (`demo/mock.js`) and snapshots of real units from [PyViCare](https://github.com/openviess/PyViCare)'s test data (Apache-2.0): Vitocal 250-A, 252-A, 222-S, 200-A (two ViCare devices) and 333-G. `tools/make_demo_models.py` rebuilds `demo/models.js` from those files. Open the page directly or through any local web server; URL parameters: `model`, `lang`, `source`, `phase`, `buffer`, `mixer`, `circuit`, `heater`, `split`.

## Limitations

- ViCare is cloud polled; values change every minute or two and short "unavailable" gaps are bridged.
- History goes back as far as the recorder keeps it (10 days by default).
- The health check limits are general guidance for ground and air source heat pumps, not manufacturer values, and it is no substitute for service.
- Tested in use with a Vitocal 333-G (CU401B_G, R410A); air source models only with the API snapshots above. Feedback from other models is welcome; please attach your ViCare diagnostics file to an issue.

Refrigerant properties were generated with [CoolProp](http://www.coolprop.org/).

---

## Suomeksi

Kortti näyttää Viessmann-lämpöpumpun kylmäainepiirin samaan tapaan kuin laitteen oma huoltonäyttö. Siinä on lisäksi lattialämmitys, käyttövesivaraaja ja liuospiiri, trendit, historian kelaus ja toisto sekä log p-h -piirros, jossa on suuntaa antava arvio toiminnasta. Kortti käyttää ViCare-integraation omia tietoja ja tunnistaa anturit itse.

**Asennus**
1. HACS → ⋮ → *Custom repositories* → tämän repositorion osoite, tyyppi *Dashboard*. Tai kopioi `dist/vicare-heatpump-card.js` kansioon `/config/www/` ja lisää resurssi `/local/vicare-heatpump-card.js?v=1` (JavaScript-moduuli).
2. Ota käyttöön kylmäainepiirin anturit (kuumakaasu, imukaasu, nestelinja, alijäähdytys, tulistus). Kortti luettelee käytöstä poistetut anturit, ja ylläpitäjä voi ottaa ne käyttöön kortin *Ota käyttöön* -napista. Laitteelta puuttuvat anturit kortti listaa erikseen.
3. Lisää kortti kortinvalitsimesta (*ViCare Heat Pump Card*).

**Käyttö**
- Raahaa kuvaajaa tai liukusäädintä, niin kaavio näyttää valitun hetken. ‹ ja › vaihtavat päivää, ▶ toistaa historiaa, ⤢ suurentaa kuvaajat ja näyttää lukemat kohdistimen kohdalla, *Nyt* palaa nykyhetkeen.
- *log p-h* avaa kiertoprosessin piirroksen ja arvion, kun kompressori on käynyt vähintään 10 minuuttia.

**Mallit ilman korkeapaineanturia** (esim. Vitocal 250-A, 252-A, 200-A, 222-S): lauhtumislämpötila arvioidaan nestelinjan ja menoveden lämpötilasta ja merkitään ≈-merkillä; siitä riippuvat kohdat jätetään arviosta pois.

**Ilma-vesilämpöpumppu.** Asetuksella `source: air` (tai automaattisesti, jos liuoksen paluuanturia ja liuospumppua ei ole) liuospiirin tilalle piirretään ulkoyksikkö, lamellipatteri, puhallin ja 4-tieventtiili. Sulatuksessa venttiili kääntää kierron: kuumakaasu menee ulkoyksikön patteriin, puhallin pysähtyy ja lämpö otetaan vedestä.

**Nopeudet.** Kompressorin nopeus (% tai rps), paisuntaventtiilin avaus, puhaltimen sekä liuos- ja kiertovesipumpun nopeus näytetään, jos anturi on, ja virtausanimaatiot nopeutuvat tai hidastuvat niiden mukaan.

**Lämmönjako.** Asetuksissa valitaan lattialämmitys tai patterit, puskurivaraaja (`buffer`), shuntti (`mixer`) ja sähkövastus (`heater`). Osiosta *Anturit* jokaisen arvon voi vaihtaa omaan entiteettiin, myös ilman ViCare-integraatiota.

**Lisäosat** (`examples/`): tc/t0-anturit, käyttövesijaksojen nostokorkeus, viikkotilastot, tapahtumaloki ja valmis kojelauta. Tapahtumaloki toimii Vitotronic 200 (WO1C) -koneissa (300-G, 333-G, vanhemmat 200-S/222-S) laitteen omasta lokista; uudemmissa (250-A, 252-A, 200-A, 151-A) skripti kirjaa laitteen tila-, info-, huolto- ja vikaviestit (esim. S.125 lämmitys, S.128 sulatus) niiden ilmestyessä. Entiteetti-ID:t ovat Vitocal 333-G:n; vaihda ne omaan laitteeseen sopiviksi.

Split-mallin sisä- ja ulkoyksikkö näkyvät ViCaressa kahtena laitteena; kortti yhdistää niiden anturit itse, tai ulkoyksikön voi valita asetuksesta *Muut laitteet*.

Arvion rajat ovat yleisiä ohjearvoja maa- ja ilmalämpöpumpuille, eivät valmistajan arvoja, eikä arvio korvaa huoltoa.

## License

MIT
