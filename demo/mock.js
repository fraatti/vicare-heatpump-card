// Minimal mock of hass for local previews of the card.
// ?model=<id> shows a snapshot of a real unit from demo/models.js (PyViCare test data), otherwise synthetic data.
(function () {
  const M = window.VHP_MODELS?.[new URLSearchParams(location.search).get("model")];
  if (M) {
    const now = Date.now(), states = {}, entities = {}, devices = {}, extra = {};
    const lang = new URLSearchParams(location.search).get("lang") || "en";
    const put = (id, v, u, ent) => {
      entities[id] = ent;
      states[id] = { entity_id: id, state: v === null || v === undefined ? "unavailable" : String(v), attributes: { unit_of_measurement: u || undefined, friendly_name: id }, last_changed: new Date(now - 45 * 60000).toISOString() };
    };
    M.devices.forEach((d, n) => {
      const dev = "dev" + (n + 1), slug = "unit" + (n + 1);
      devices[dev] = { id: dev, name: d.name, config_entries: ["ce1"] };
      for (const [k, [v, u]] of Object.entries(d.entities)) {
        const [dom, tk] = k.split(":");
        put(`${dom}.${slug}_${tk}`, v, u, { entity_id: `${dom}.${slug}_${tk}`, platform: "vicare", translation_key: tk, device_id: dev });
      }
    });
    for (const [role, [v, u]] of Object.entries(M.extra)) {
      const id = `sensor.api_${role}`;
      put(id, v, u, { entity_id: id, platform: "template" });
      extra[role] = id;
    }
    window.mockModel = { ...M, entities: extra };
    window.mockHass = {
      states, entities, devices, locale: { language: lang, number_format: "language" }, language: lang, config: { time_zone: "Europe/Helsinki" }, themes: { darkMode: false },
      // the snapshot stands still for the whole history
      callWS: async (msg) => {
        const a = Date.parse(msg.start_time), out = {};
        // a running compressor started 45 minutes ago
        for (const id of msg.entity_ids) if (states[id])
          out[id] = entities[id].translation_key === "compressor" && states[id].state === "on"
            ? [{ s: "off", lu: a / 1000 }, { s: "on", lu: (now - 45 * 60000) / 1000 }] : [{ s: states[id].state, lu: a / 1000 }];
        return out;
      },
    };
    return;
  }
  const dev = "dev1";
  const Q = new URLSearchParams(location.search), AIR = Q.get("source") === "air", PH = Q.get("phase");
  const R = {
    hot_gas_temperature: ["sensor", "°C"], hot_gas_pressure: ["sensor", "bar"], suction_gas_temperature: ["sensor", "°C"],
    suction_gas_pressure: ["sensor", "bar"], liquid_gas_temperature: ["sensor", "°C"], condenser_subcooling_temperature: ["sensor", "K"],
    evaporator_overheat_temperature: ["sensor", "K"], secondary_circuit_supply_temperature: ["sensor", "°C"],
    secondary_circuit_return_temperature: ["sensor", "°C"], primary_circuit_supply_temperature: ["sensor", "°C"],
    primary_circuit_return_temperature: ["sensor", "°C"], outside_temperature: ["sensor", "°C"], compressor: ["binary_sensor"],
    circulation_pump: ["binary_sensor"], domestic_hot_water_circulation_pump: ["binary_sensor"], compressor_phase: ["sensor"],
    domestic_hot_water_charging: ["binary_sensor"], dhw_storage_top_temperature: ["sensor", "°C"], cop_heating: ["sensor"],
    cop_dhw: ["sensor"], compressor_starts: ["sensor"],
    buffer_main_temperature: ["sensor", "°C"], supply_temperature: ["sensor", "°C"],
    heater_power: ["sensor", "kW"], mixer_position: ["sensor", "%"], circuit_pump_speed: ["sensor", "%"], fan_speed: ["sensor", "%"], compressor_modulation: ["sensor", "%"], eev_position: ["sensor", "%"], input_power: ["sensor", "W"],
  };
  if (AIR) delete R.primary_circuit_return_temperature; // an air source unit has no brine return
  // ?circuits=2: a second heating circuit. ViCare gives its entities the same translation key with an "_2"
  // suffix in the entity id (the third item is the translation key when it differs from the name).
  const TWO = Q.get("circuits") === "2";
  if (TWO) Object.assign(R, {
    supply_temperature_2: ["sensor", "°C", "supply_temperature"], circulation_pump_2: ["binary_sensor", undefined, "circulation_pump"],
    mixer_position_2: ["sensor", "%"], circuit_pump_speed_2: ["sensor", "%"],
  });
  const cyc = 90 * 60000, onFor = 50 * 60000;
  // ?cycle=<minutes>: where "now" is in the 90 minute cycle (4 min preparing, compressor on until 50 min)
  const OFS = Q.has("cycle") ? (((+Q.get("cycle") * 60000 - (Date.now() % cyc)) % cyc) + cyc) % cyc : 0;
  let at = (t) => {
    const ph = (((t + OFS) % cyc) + cyc) % cyc, on = ph > 4 * 60000 && ph < onFor, prep = ph <= 4 * 60000;
    const k = on ? Math.min(1, (ph - 4 * 60000) / 900000) : 0;
    const off = on ? 0 : Math.min(1, (ph - onFor) / 1800000);
    return {
      hot_gas_temperature: on ? 45 + 15 * k : 60 - 30 * off, hot_gas_pressure: on ? 17 + 4.3 * k : 13, suction_gas_temperature: on ? 3.1 : 6,
      suction_gas_pressure: on ? 7.8 : 13, liquid_gas_temperature: on ? 28.5 : 24, condenser_subcooling_temperature: on ? 6.7 : 0,
      evaporator_overheat_temperature: on ? 3.9 : 0, secondary_circuit_supply_temperature: on ? 25 + 8.2 * k : 33 - 8 * off,
      secondary_circuit_return_temperature: on ? 24.6 : 24.6 - off, primary_circuit_supply_temperature: on ? 4.5 : 5,
      primary_circuit_return_temperature: on ? 1.6 : 4.5, outside_temperature: -0.5, compressor: on ? "on" : "off",
      circulation_pump: "on", domestic_hot_water_circulation_pump: "off", compressor_phase: on ? "heating" : prep ? "preparing" : "pause",
      domestic_hot_water_charging: "off", dhw_storage_top_temperature: 45.9, cop_heating: 4.6, cop_dhw: 3.4, compressor_starts: 40654,
      buffer_main_temperature: on ? 31 + 3 * k : 33 - 3 * off, supply_temperature: 29.5, heater_power: on && k > 0.8 ? 3 : 0, mixer_position: 42, circuit_pump_speed: 68,
      fan_speed: on ? 45 : 0, compressor_modulation: on ? 40 + 35 * k : 0, eev_position: on ? 34 : 0, input_power: on ? -2350 - 300 * k : -18,
      // two circuits: radiators at about 45 °C, a mixed floor loop at about 31 °C
      ...(TWO ? { supply_temperature: 45.2, supply_temperature_2: 31.1, circulation_pump_2: "on", mixer_position_2: 27, circuit_pump_speed_2: 55 } : {}),
    };
  };
  // ?fault=hp|lp: a drifting pressure transmitter that reads far too low (hp: as in a Vitocal 333-G whose
  // high pressure sensor failed) or too high (lp) while the compressor runs
  const FAULT = Q.get("fault");
  if (FAULT === "hp" || FAULT === "lp") {
    const base = at;
    at = (t) => {
      const v = base(t), on = v.compressor === "on";
      if (FAULT === "hp") v.hot_gas_pressure = on ? 11 + (t / 60000 % 7) * 0.3 : 3;
      else v.suction_gas_pressure = on ? 12 : 3;
      return v;
    };
  }
  // ?phase=defrost|preparing_defrost|passive_defrost|cooling forces the current state
  const force = (v) => {
    if (!PH) return v;
    const run = PH !== "passive_defrost";
    Object.assign(v, { compressor_phase: PH, compressor: run ? "on" : "off", fan_speed: PH === "defrost" ? 0 : run ? 45 : 30, compressor_modulation: run ? (PH === "defrost" ? 90 : 72) : 0, eev_position: run ? (PH === "defrost" ? 100 : 34) : 0 });
    if (PH === "defrost") Object.assign(v, { secondary_circuit_supply_temperature: 21, secondary_circuit_return_temperature: 25.1, hot_gas_temperature: 52, suction_gas_temperature: 12 });
    if (PH === "cooling") Object.assign(v, { secondary_circuit_supply_temperature: 16, secondary_circuit_return_temperature: 20, hot_gas_temperature: 55 });
    return v;
  };
  const now = Date.now();
  const states = {}, entities = {}, keyOf = {};
  const v = force(at(now));
  for (const [tk, [d, u, key]] of Object.entries(R)) {
    const id = `${d}.cu401b_g_${tk}`;
    keyOf[id] = tk;
    // ?split=1: the refrigerant circuit belongs to a second device (outdoor unit) of the same account
    const d2 = Q.get("split") === "1" && /^(hot_gas|suction_gas|liquid_gas|condenser|evaporator|compressor|primary)/.test(tk) ? "dev2" : dev;
    entities[id] = { entity_id: id, platform: "vicare", translation_key: key || tk, device_id: d2 };
    const str = (x) => String(typeof x === "number" ? x.toFixed(1) : x);
    // last_changed: when the value last changed, looking back minute by minute (at most one cycle)
    let lc = now;
    while (lc > now - cyc && str(force(at(lc - 60000))[tk]) === str(v[tk])) lc -= 60000;
    states[id] = { entity_id: id, state: str(v[tk]), attributes: { unit_of_measurement: u, friendly_name: tk }, last_changed: new Date(lc).toISOString() };
  }
  // ?disabled=1: some sensors are disabled in the entity registry (as ViCare ships them)
  const disabled = [];
  if (Q.get("disabled") === "1")
    for (const tk of ["hot_gas_pressure", "condenser_subcooling_temperature", "evaporator_overheat_temperature"]) {
      const id = `sensor.cu401b_g_${tk}`;
      disabled.push({ entity_id: id, platform: "vicare", translation_key: tk, device_id: dev, disabled_by: "integration" });
      delete entities[id]; delete states[id];
    }
  window.mockHass = {
    user: { is_admin: true },
    states, entities, devices: { [dev]: { id: dev, name: "CU401B G", config_entries: ["ce1"] }, dev2: { id: "dev2", name: "Outdoor unit", config_entries: ["ce1"] } },
    locale: { language: new URLSearchParams(location.search).get("lang") || "en", number_format: "language" }, language: new URLSearchParams(location.search).get("lang") || "en", config: { time_zone: "Europe/Helsinki" },
    themes: { darkMode: false },
    callWS: async (msg) => {
      if (msg.type === "config/entity_registry/list") return [...Object.values(entities), ...disabled];
      if (msg.type === "config/entity_registry/update") return { entity_entry: { entity_id: msg.entity_id }, reload_delay: 30 };
      const a = Date.parse(msg.start_time), b = Date.parse(msg.end_time), out = {};
      for (const id of msg.entity_ids) {
        const tk = entities[id] && keyOf[id]; if (!tk) continue;
        const arr = [];
        for (let t = a; t <= b; t += 120000) { const x = at(t)[tk]; arr.push({ s: typeof x === "number" ? x.toFixed(1) : x, lu: t / 1000 }); }
        out[id] = arr;
      }
      return out;
    },
  };
})();
