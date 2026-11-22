#!/usr/bin/env python3
"""Builds demo/models.js from PyViCare's test responses (https://github.com/openviess/PyViCare,
Apache-2.0). Each feature is mapped to the Home Assistant ViCare entity (translation key) that reads it.
Usage: python3 tools/make_demo_models.py /path/to/PyViCare/tests/response"""
import json, sys, os

R = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "demo")

# feature -> (domain, translation_key, property, unit)
MAP = [
    ("heating.compressors.0", "sensor", "compressor_phase", "phase", None),
    ("heating.compressors.0", "binary_sensor", "compressor", "active", None),
    ("heating.compressors.0.statistics", "sensor", "compressor_starts", "starts", None),
    ("heating.compressors.0.sensors.temperature.outlet", "sensor", "compressor_outlet_temperature", "value", "°C"),
    ("heating.compressors.0.sensors.temperature.inlet", "sensor", "compressor_inlet_temperature", "value", "°C"),
    ("heating.compressors.0.sensors.pressure.inlet", "sensor", "compressor_inlet_pressure", "value", "bar"),
    ("heating.compressors.0.sensors.power", "sensor", "compressor_modulation", "value", "%"),
    ("heating.sensors.temperature.hotGas", "sensor", "hot_gas_temperature", "value", "°C"),
    ("heating.sensors.pressure.hotGas", "sensor", "hot_gas_pressure", "value", "bar"),
    ("heating.sensors.temperature.suctionGas", "sensor", "suction_gas_temperature", "value", "°C"),
    ("heating.sensors.pressure.suctionGas", "sensor", "suction_gas_pressure", "value", "bar"),
    ("heating.sensors.temperature.liquidGas", "sensor", "liquid_gas_temperature", "value", "°C"),
    ("heating.condensors.0.sensors.temperature.liquid", "sensor", "condenser_liquid_temperature", "value", "°C"),
    ("heating.condensors.0.sensors.temperature.subcooling", "sensor", "condenser_subcooling_temperature", "value", "K"),
    ("heating.evaporators.0.sensors.temperature.liquid", "sensor", "evaporator_liquid_temperature", "value", "°C"),
    ("heating.evaporators.0.sensors.temperature.overheat", "sensor", "evaporator_overheat_temperature", "value", "K"),
    ("heating.primaryCircuit.sensors.temperature.supply", "sensor", "primary_circuit_supply_temperature", "value", "°C"),
    ("heating.primaryCircuit.sensors.temperature.return", "sensor", "primary_circuit_return_temperature", "value", "°C"),
    ("heating.primaryCircuit.sensors.rotation", "sensor", "primary_circuit_pump_rotation", "value", "%"),
    ("heating.secondaryCircuit.sensors.temperature.supply", "sensor", "secondary_circuit_supply_temperature", "value", "°C"),
    ("heating.secondaryCircuit.sensors.temperature.return", "sensor", "secondary_circuit_return_temperature", "value", "°C"),
    ("heating.sensors.temperature.return", "sensor", "return_temperature", "value", "°C"),
    ("heating.circuits.0.sensors.temperature.supply", "sensor", "supply_temperature", "value", "°C"),
    # a unit whose only heating circuit is number 1 (e.g. Vitocal 300-G): Home Assistant names it like circuit 0
    ("heating.circuits.1.sensors.temperature.supply", "sensor", "supply_temperature", "value", "°C"),
    ("heating.sensors.temperature.outside", "sensor", "outside_temperature", "value", "°C"),
    ("heating.dhw.sensors.temperature.hotWaterStorage", "sensor", "dhw_storage_temperature", "value", "°C"),
    ("heating.dhw.sensors.temperature.hotWaterStorage.top", "sensor", "dhw_storage_top_temperature", "value", "°C"),
    ("heating.bufferCylinder.sensors.temperature.main", "sensor", "buffer_main_temperature", "value", "°C"),
    ("heating.circuits.0.circulation.pump", "binary_sensor", "circulation_pump", "status", None),
    ("heating.circuits.1.circulation.pump", "binary_sensor", "circulation_pump", "status", None),
    ("heating.dhw.charging", "binary_sensor", "domestic_hot_water_charging", "active", None),
    ("heating.dhw.pumps.circulation", "binary_sensor", "domestic_hot_water_circulation_pump", "status", None),
]
# Values the API has but the Home Assistant integration does not expose; the demo shows them as own sensors.
EXTRA = [
    ("heating.primaryCircuit.fans.0.current", "fan", "value", "%"),
    ("heating.sensors.valve.0.expansion.target", "eev", "value", "%"),
    ("heating.boiler.pumps.internal.current", "circ_pump_speed", "value", "%"),
    ("heating.compressors.0.speed.current", "comp_speed", "value", "rps"),
]

def load(name):
    d = json.load(open(os.path.join(R, name)))
    feats = {}
    for x in d["data"]:
        if x.get("isEnabled", True) is False:
            continue
        props = x.get("properties", {})
        st = props.get("status", {}).get("value")
        if st == "notConnected":
            continue
        feats[x["feature"]] = {k: v.get("value") for k, v in props.items() if isinstance(v, dict) and "value" in v}
    return feats

def conv(v, prop):
    if prop in ("active",):
        return "on" if v else "off"
    if prop == "status":
        return "on" if v == "on" else "off"
    if prop == "phase":
        return "unknown" if v in (None, "null") else str(v).lower()
    return v

def device(name, files):
    ents, extra = {}, {}
    for f in files:
        feats = load(f)
        for feat, dom, key, prop, unit in MAP:
            if feat in feats and prop in feats[feat] and f"{dom}:{key}" not in ents:
                ents[f"{dom}:{key}"] = [conv(feats[feat][prop], prop), unit]
        # newer units have no hot water charging feature: use the 4/3-way valve position
        pos = feats.get("heating.valves.fourThreeWay.position", {}).get("value")
        if pos and "binary_sensor:domestic_hot_water_charging" not in ents:
            ents["binary_sensor:domestic_hot_water_charging"] = ["on" if pos == "domesticHotWater" else "off", None]
        if "heating.sensors.temperature.outside" not in feats and "system.temperature.outside" in feats:
            ents.setdefault("sensor:outside_temperature", [feats["system.temperature.outside"]["value"], "°C"])
        for feat, role, prop, unit in EXTRA:
            if feat in feats and prop in feats[feat]:
                extra.setdefault(role, [feats[feat][prop], unit])
    return {"name": name, "entities": ents}, extra

MODELS = {
    "vitocal250a": ("Vitocal 250-A", "R290", "air", [("Vitocal 250-A", ["Vitocal250A.json"])]),
    "vitocal252a": ("Vitocal 252-A", "R290", "air", [("Vitocal 252-A", ["Vitocal252A.json"])]),
    "vitocal222s": ("Vitocal 222-S", "R32", "air", [("Vitocal 222-S", ["Vitocal222S.json"])]),
    "vitocal200a": ("Vitocal 200-A (two ViCare devices)", "R290", "air",
                    [("Vitocal 200-A system controller", ["Vitocal200A_SystemController.json"]), ("Vitocal 200-A outdoor unit", ["Vitocal200A_OutdoorUnit.json"])]),
    "vitocal300g": ("Vitocal 300-G", "R410A", "ground", [("Vitocal 300-G", ["Vitocal300G_CU401B.json"])]),
    "vitocal333g": ("Vitocal 333-G", "R410A", "ground", [("Vitocal 333-G", ["Vitocal333G-with-Vitovent300F.json"])]),
}
allm = {}
for mid, (title, refr, src, devs) in MODELS.items():
    out = {"title": title, "refrigerant": refr, "source": src,
           "data": "PyViCare tests/response (" + ", ".join(f for _, fs in devs for f in fs) + "), Apache-2.0", "devices": [], "extra": {}}
    for name, files in devs:
        dv, ex = device(name, files)
        out["devices"].append(dv)
        for k, v in ex.items():
            out["extra"].setdefault(k, v)
    allm[mid] = out
    print(mid, sum(len(d["entities"]) for d in out["devices"]), out["extra"])
with open(os.path.join(OUT, "models.js"), "w") as fh:
    fh.write("// Generated by tools/make_demo_models.py from PyViCare's test data (Apache-2.0). Do not edit.\n")
    fh.write("window.VHP_MODELS = " + json.dumps(allm, ensure_ascii=False, indent=1) + ";\n")
