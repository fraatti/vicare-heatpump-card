# Changelog

All notable changes to the ViCare Heat Pump Card. Versions follow [semantic versioning](https://semver.org/).

## Unreleased

### Changed
- Example dashboard: the weekly charts follow one date picker (week, month, year, ‹ › to step back) instead of a fixed 365 days; the weekly table is full width below the charts and scrolls for older weeks.
- `heatpump_weekly.yaml` keeps 80 weeks instead of 104, so the list stays under Home Assistant's 16 kB attribute limit for the recorder.

## 1.6.0 – 2026-11-22

### Changed
- The diagram is better balanced and drawn larger: the right side is narrower (shorter ground loop with the brine pump and labels closer to the evaporator, "Brine circuit" under the loop, outdoor air above it; a narrower outdoor unit for air source), and the left margin is smaller. At the same card width the full view is about 9–10 % larger for ground source and 3 % for air source (mid view: 11 % and 3 %, phone view: 3 %).
- Two heating circuits are drawn taller (71 instead of 54 units each) and the full view is 16 units taller for them; the second circuit's mixing valve caption sits left of the valve motor.
- The full view is used from 0.6 px per drawing unit (was 0.58), so labels stay clear of each other at its narrowest. Fixed text overlaps at that width (buffer temperature and pump speed, brine return and evaporator captions) and the air source superheat caption touching the outdoor unit at about 860 px.

## 1.5.0 – 2026-11-22

### Added
- Input power of the unit from your own meter (role `power`, W or kW). Shown in the header next to the outdoor temperature and follows the history cursor; hidden when no entity is set. The sign is ignored, as sub-meters often report consumption as negative.

## 1.4.0 – 2026-11-22

### Added
- Second heating circuit. The options `heating_circuit_2` (`auto`, `none`, `floor`, `radiators`) and `mixer_2` draw it below the first circuit; `auto` draws it (as radiators) when the device has a second supply temperature sensor or circulation pump. Both circuits take their water from the same buffer outlet or supply pipe through a branch, and their returns join on a return manifold. A mixed circuit has its own mixing valve and pump, and with a buffer every circuit has its own pump.
- Each circuit is coloured by its own supply temperature (its own gradient and value), and its flow animation runs with its own pump.
- New roles `circ_supply_2` and `circ_pump_2` (found automatically: the second ViCare entity of the same kind, `…_2`), and `circ_pump_speed_2` and `mixer_2` for your own sensors.
- Circuit names `circuit_name` and `circuit_name_2`. With two circuits the default names are "Heating circuit 1" and "Heating circuit 2".
- Demo parameters `circuits=2`, `circuit2`, `mixer2`, `name1`, `name2`, and browser tests for two circuits.

### Unchanged
- The one-circuit layout is drawn exactly as before.

## 1.3.0 – 2026-11-22

### Changed
- Air source layout: the 4-way valve caption no longer crosses the outdoor unit, and the phone layout no longer has overlapping labels. Bottom labels are no longer clipped in the mid-width layout.
- README screenshots show the current card (ground and air source).

### Removed
- The `heatpump_dhw.yaml` example package (lift tc − t0 per hot water run) and its dashboard cards, as the lift was removed from the card in 1.2.0.

### Added
- Swedish and German. The new `language` option (`auto`, `en`, `fi`, `sv`, `de`) fixes the card's language; `auto` follows Home Assistant. The logbook script takes `--lang sv` or `--lang de`.
- Automated browser tests (`npm test`) that open the demo with every unit snapshot and operating phase, and a GitHub Actions workflow that runs them.

## 1.2.0 – 2026-11-22

### Removed
- The lift tc − t0 from the diagram and the health check, and the `max_lift` option. An old `max_lift` in a configuration is ignored.

## 1.1.0 – 2026-11-22

### Added
- Disabled sensors: for an administrator the card lists the disabled ViCare sensors it would use, with an *Enable* button and a link to the device page. Sensors the device does not have are listed separately.
- Message log for units without a logbook (Vitocal 250-A, 252-A, 200-A, 151-A, newer 222-S): `vicare_logbook.py` logs status, info, service and fault messages as they appear. Texts for about 1 850 message codes in `examples/vicare_codes.json` (from open3e, Apache-2.0).
- Defrost marker on the timeline; the legend shows only the kinds that occur.

## 1.0.0 – 2026-11-22

### Added
- Units without a high pressure sensor: the condensing temperature is estimated from the liquid line and the supply water and marked with ≈; the checks that depend on it are left out.
- Demo snapshots of real units from PyViCare's test data: Vitocal 250-A, 252-A, 222-S, 200-A (two ViCare devices) and 333-G.

### Fixed
- Split units whose system controller has no refrigerant sensors are combined with the outdoor unit. Gas boilers and ventilation units of the same account are left out.
- Superheat limits for air source units that measure the suction after an internal heat exchanger.
- Return pipe colour when there is no return sensor.

## 0.17.0 – 2026-11-22

### Added
- Air source health check: outdoor air against evaporation; hot gas limits for air source units and R32. No assessment during defrost and cooling, and none until operation has settled after a defrost.
- log p-h: source and supply temperature levels.
- Split units: missing sensors are taken from the other heat pump devices of the same ViCare account, or from `extra_devices`.

## 0.16.0 – 2026-11-22

### Added
- Compressor speed (% or rps), expansion valve opening and circulation pump speed. Flow animations and pumps run faster or slower with them.

## 0.15.0 – 2026-11-22

### Added
- Air source heat pumps (`source: air`): outdoor unit with the finned coil and the fan, a Viessmann-style 4-way valve, defrost (preparation, reverse cycle, passive) and cooling.

## 0.14.0 – 0.14.2 – 2026-11-22

### Added
- Buffer cylinder, mixing valve, radiators, diverter valve and flow-through heater symbols.
- Every sensor can be replaced with your own entity in the visual editor.
- Separate switches for the logbook text and the timeline markers.

### Fixed
- An unavailable heating circuit supply value is hidden; the mixing valve stays clear of the supply riser.

## 0.13.1 – 2026-11-21

- First version in this repository.
