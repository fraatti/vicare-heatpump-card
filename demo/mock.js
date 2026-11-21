// Minimal mock of hass for local previews of the card (synthetic data).
(function () {
  const dev = "dev1";
  const R = {
    hot_gas_temperature: ["sensor", "°C"], hot_gas_pressure: ["sensor", "bar"], suction_gas_temperature: ["sensor", "°C"],
    suction_gas_pressure: ["sensor", "bar"], liquid_gas_temperature: ["sensor", "°C"], condenser_subcooling_temperature: ["sensor", "K"],
    evaporator_overheat_temperature: ["sensor", "K"], secondary_circuit_supply_temperature: ["sensor", "°C"],
    secondary_circuit_return_temperature: ["sensor", "°C"], primary_circuit_supply_temperature: ["sensor", "°C"],
    primary_circuit_return_temperature: ["sensor", "°C"], outside_temperature: ["sensor", "°C"], compressor: ["binary_sensor"],
    circulation_pump: ["binary_sensor"], domestic_hot_water_circulation_pump: ["binary_sensor"], compressor_phase: ["sensor"],
    domestic_hot_water_charging: ["binary_sensor"], dhw_storage_top_temperature: ["sensor", "°C"], cop_heating: ["sensor"],
    cop_dhw: ["sensor"], compressor_starts: ["sensor"],
  };
  const cyc = 90 * 60000, onFor = 50 * 60000;
  const at = (t) => {
    const ph = ((t % cyc) + cyc) % cyc, on = ph > 4 * 60000 && ph < onFor, prep = ph <= 4 * 60000;
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
    };
  };
  const now = Date.now();
  const states = {}, entities = {};
  const v = at(now);
  for (const [tk, [d, u]] of Object.entries(R)) {
    const id = `${d}.cu401b_g_${tk}`;
    entities[id] = { entity_id: id, platform: "vicare", translation_key: tk, device_id: dev };
    states[id] = { entity_id: id, state: String(typeof v[tk] === "number" ? v[tk].toFixed(1) : v[tk]), attributes: { unit_of_measurement: u, friendly_name: tk }, last_changed: new Date(now).toISOString() };
  }
  window.mockHass = {
    states, entities, devices: { [dev]: { id: dev, name: "CU401B G" } },
    locale: { language: new URLSearchParams(location.search).get("lang") || "en", number_format: "language" }, language: new URLSearchParams(location.search).get("lang") || "en", config: { time_zone: "Europe/Helsinki" },
    themes: { darkMode: false },
    callWS: async (msg) => {
      const a = Date.parse(msg.start_time), b = Date.parse(msg.end_time), out = {};
      for (const id of msg.entity_ids) {
        const tk = entities[id]?.translation_key; if (!tk) continue;
        const arr = [];
        for (let t = a; t <= b; t += 120000) { const x = at(t)[tk]; arr.push({ s: typeof x === "number" ? x.toFixed(1) : x, lu: t / 1000 }); }
        out[id] = arr;
      }
      return out;
    },
  };
})();
