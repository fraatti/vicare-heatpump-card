#!/usr/bin/env python3
"""Builds examples/vicare_codes.json, the message texts of Viessmann E3 units (Vitocal 250-A, 252-A,
200-A, 151-A ...), from open3e's Open3Eenums.py (https://github.com/open3e/open3e, Apache-2.0).
The numbers are those of the unit's own messages: S.125 = States[125] "HeatPumpHeatingActive".
Usage: python3 tools/make_codes.py /path/to/open3e/src/open3e/Open3Eenums.py"""
import ast, json, os, re, sys

src = open(sys.argv[1], encoding="utf-8").read()
enums = ast.literal_eval(src[src.index("{", src.index("=")):src.rindex("}") + 1])
ACRO = {"dhw": "DHW", "co2": "CO2", "pv": "PV", "ems": "EMS", "can": "CAN", "eev": "EEV", "sg": "SG", "ntc": "NTC", "pwm": "PWM",
        "id": "ID", "ip": "IP", "lan": "LAN", "wlan": "WLAN", "led": "LED", "hmi": "HMI", "ecu": "ECU", "rf": "RF", "usb": "USB"}


def words(name):
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[A-Za-z])(?=[0-9])", " ", name).split()
    out = [ACRO.get(w.lower(), w if w.isupper() and len(w) > 1 else w.lower()) for w in s]
    return (out[0][:1].upper() + out[0][1:] + (" " + " ".join(out[1:]) if out[1:] else "")) if out else name


CATS = {"status": "States", "info": "Infos", "error": "Errors", "warning": "Warnings", "service": "Services"}
out = {"source": "open3e Open3Eenums.py (Apache-2.0), https://github.com/open3e/open3e"}
for cat, key in CATS.items():
    out[cat] = {str(k): words(v) for k, v in sorted(enums[key].items()) if k and v}
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "examples", "vicare_codes.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=0)
print({c: len(out[c]) for c in CATS}, os.path.getsize(path), "bytes")
