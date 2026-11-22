#!/usr/bin/env python3
"""ViCare logbook for Home Assistant (vicare-heatpump-card).

Fetches the heat pump's logbook from the Viessmann cloud using the ViCare
integration's own token, appends new entries to /config/vicare_logbook.csv and
prints JSON for a Home Assistant command_line sensor.

Two kinds of units:
- Vitotronic 200 (WO1C) units (Vitocal 300-G, 333-G, older 200-S/222-S) have a real
  logbook (device.messages.logbook; the unit keeps only the 5 newest entries).
- Newer units (Vitocal 250-A, 252-A, 200-A, 151-A, newer 222-S ...) have no logbook,
  only the currently active messages (device.messages.status/info/service/error.raw).
  The script logs when a message appears (with the unit's own time stamp) and when
  an error or service message clears (time of the run that noticed it).
The script finds out which one it is on the first run.

One run = one API call (plus one installation lookup on the first run).
The token is never printed or stored.

Usage: python3 vicare_logbook.py [--lang en|fi]
"""
import calendar, csv, json, os, sys, time, urllib.error, urllib.parse, urllib.request

API = "https://api.viessmann-climatesolutions.com"
CFG = next((d for d in ("/config", "/homeassistant") if os.path.isdir(os.path.join(d, ".storage"))), "/config")
CSV_FILE = os.path.join(CFG, "vicare_logbook.csv")
IDS_FILE = os.path.join(CFG, ".storage", "vicare_logbook_ids.json")
MSG_FILE = os.path.join(CFG, ".storage", "vicare_logbook_messages.json")  # active messages of the last run
FIELDS = ["time", "actor", "event", "state_machine", "circuit", "status", "info", "interpretation"]
SHOW = 15  # rows in the sensor attribute

# The API's event names do not match the texts on the unit's display
# (Diagnosis -> System -> Logbook). Pairs identified by comparing the same entries
# on the display and in the API on 18.10.2026 (Vitocal 333-G, Vitotronic 200 WO1C):
#   PRIMAERQUELLE1 PRIMARY_IN 100/120          = Primary source 1 On, "switch-on hysteresis reached", 120 s
#   VERDICHTER1 Inverter_DCbus_ripple 100/122  = Compressor 1 On, "output demand", 122 s
#   VERDICHTER1 PRIMARY_OUT 0/600              = Compressor 1 Off, "switch-off hysteresis reached", 600 s
#   VERDICHTER1 Inverter_Heatsink_fan_fault 0  = Compressor 1 Off, "temperature rise" (hot water done)
#   VENTIL_HEIZ_WW1 Liquid_Temp_2 1 / 0        = 3-way valve On / Off, "hydraulic circuit change"
# status 100 (valve: 1) = on, 0 = off. info is a time (s; valve: min).
# state_machine = display "ZA" (LP1 = heat pump 1), circuit = display "SC" (heating / hot water).
REASONS = {  # API event name -> reason key (card and texts below)
    "PRIMARY_IN": "on_hyst",
    "Inverter_DCbus_ripple": "demand",
    "PRIMARY_OUT": "off_hyst",
    "Inverter_Heatsink_fan_fault": "temp_rise",
    "Liquid_Temp_2": "circuit_change",
}
CIRCUIT_KEYS = {"Heizkreis": "heating", "Warmwasser": "dhw", "WW": "dhw"}
ON, OFF = ("100", "1"), ("0",)

# Language of the texts: --lang en (default) or --lang fi
LANG = "fi" if "--lang" in sys.argv and sys.argv[sys.argv.index("--lang") + 1:][:1] == ["fi"] else "en"
TEXT = {
    "en": {
        "start": "Compressor started", "stop": "Compressor stopped",
        "prep": "Brine pump started", "info": "Brine pump stopped",
        "valve_on": "3-way valve to hot water", "valve_off": "3-way valve to heating",
        "on_hyst": "switch-on hysteresis reached", "demand": "output demand",
        "off_hyst": "switch-off hysteresis reached", "temp_rise": "temperature reached",
        "circuit_change": "hydraulic circuit change",
        "heating": "heating", "dhw": "hot water",
        "names": {"VERDICHTER1": "Compressor", "PRIMAERQUELLE1": "Brine pump", "WAERMEPUMPE1": "Heat pump"},
        "none": "no events",
    },
    "fi": {
        "start": "Kompressori käynnistyi", "stop": "Kompressori pysähtyi",
        "prep": "Liuospumppu käynnistyi", "info": "Liuospumppu pysähtyi",
        "valve_on": "Vaihtoventtiili käyttövedelle", "valve_off": "Vaihtoventtiili lämmitykselle",
        "on_hyst": "päällekytkentähystereesi saavutettu", "demand": "tehokäsky",
        "off_hyst": "poiskytkentähystereesi saavutettu", "temp_rise": "lämpötila saavutettu",
        "circuit_change": "hydr. piirin vaihto",
        "heating": "lämmitys", "dhw": "käyttövesi",
        "names": {"VERDICHTER1": "Kompressori", "PRIMAERQUELLE1": "Liuospumppu", "WAERMEPUMPE1": "Lämpöpumppu"},
        "none": "ei tapahtumia",
    },
}


# Messages of the newer units. Status texts from the Vitocal 250-A(H) service manual (Statusmeldungen).
# (kind for the card's timeline, circuit, valve direction)
MSG_KIND = {
    "S.123": ("stop", None, None), "S.124": ("prep", None, None), "S.125": ("start", "heating", None),
    "S.126": ("start", "cooling", None), "S.127": ("defrost", None, None), "S.128": ("defrost", None, None),
    "S.176": ("defrost", None, None), "S.115": ("valve", None, 1), "S.116": ("valve", None, 0),
    "S.117": ("valve", None, 0), "S.118": ("valve", None, 0),
}
MSG_TEXT = {
    "en": {
        "S.60": "Summer mode active (outdoor temperature economy)", "S.74": "Heating suppressed", "S.75": "DHW circulation pump active",
        "S.115": "4/3-way valve to hot water", "S.116": "4/3-way valve to heating/cooling circuit 1", "S.117": "4/3-way valve to heating/cooling circuit 2",
        "S.118": "4/3-way valve to internal buffer / bypass", "S.120": "Smart Grid: normal operation", "S.121": "Smart Grid: recommended operation",
        "S.122": "Smart Grid: forced operation", "S.123": "Heat pump off", "S.124": "Heat pump pre-run", "S.125": "Heat pump heating",
        "S.126": "Heat pump cooling", "S.127": "Heat pump preparing defrost", "S.128": "Heat pump defrosting", "S.129": "Heat pump post-run",
        "S.130": "Electric booster heater off", "S.134": "4/3-way valve idle", "S.135": "4/3-way valve in defrost position",
        "S.136": "4/3-way valve to space heating/cooling", "S.161": "Filling active", "S.162": "Venting active",
        "S.163": "Heat pump system status: inactive", "S.164": "Heat pump system status: maintenance standby",
        "S.165": "Heat pump system status: control", "S.167": "Actuator test active", "S.176": "Heat pump control: defrost requested",
        "S.186": "Frost protection DHW cylinder active", "S.187": "Frost protection heat pump active",
        "S.188": "Frost protection buffer cylinder active", "S.189": "Frost protection integrated buffer active",
        "_status": "Status", "_info": "Info", "_service": "Service message", "_error": "Fault", "_warning": "Warning",
        "_cleared": "cleared",
    },
    "fi": {
        "S.60": "Kesäkäyttö (ulkolämpötilan säästötoiminto)", "S.74": "Lämmitys estetty", "S.75": "Käyttöveden kiertopumppu käy",
        "S.115": "4/3-tieventtiili käyttövedelle", "S.116": "4/3-tieventtiili lämmitys-/jäähdytyspiirille 1", "S.117": "4/3-tieventtiili lämmitys-/jäähdytyspiirille 2",
        "S.118": "4/3-tieventtiili sisäiseen puskuriin / ohitukselle", "S.120": "Smart Grid: normaali käyttö", "S.121": "Smart Grid: suositeltu käyttö",
        "S.122": "Smart Grid: pakotettu käyttö", "S.123": "Lämpöpumppu pois", "S.124": "Lämpöpumpun esikäyntivaihe", "S.125": "Lämpöpumppu lämmittää",
        "S.126": "Lämpöpumppu jäähdyttää", "S.127": "Lämpöpumppu valmistelee sulatusta", "S.128": "Lämpöpumppu sulattaa", "S.129": "Lämpöpumpun jälkikäyntivaihe",
        "S.130": "Sähkövastus pois", "S.134": "4/3-tieventtiili lepoasennossa", "S.135": "4/3-tieventtiili sulatusasennossa",
        "S.136": "4/3-tieventtiili tilalämmitykselle/-jäähdytykselle", "S.161": "Täyttö käynnissä", "S.162": "Ilmaus käynnissä",
        "S.163": "Lämpöpumpun järjestelmätila: ei aktiivinen", "S.164": "Lämpöpumpun järjestelmätila: huoltovalmius",
        "S.165": "Lämpöpumpun järjestelmätila: säätö", "S.167": "Toimilaitetesti käynnissä", "S.176": "Lämpöpumpun säätö: sulatusta pyydetty",
        "S.186": "Käyttövesivaraajan jäätymissuojaus", "S.187": "Lämpöpumpun jäätymissuojaus",
        "S.188": "Puskurivaraajan jäätymissuojaus", "S.189": "Sisäisen puskurin jäätymissuojaus",
        "_status": "Tila", "_info": "Info", "_service": "Huoltoviesti", "_error": "Vika", "_warning": "Varoitus",
        "_cleared": "poistui",
    },
}
MSG_PRIOS = ("status", "info", "service", "maintenance", "warning", "error")
IMPORTANT_PRIOS = ("service", "maintenance", "warning", "error")


def is_msg(r):
    return r.get("state_machine") == "messages"


def msg_interpret(r, lang=None):
    """(kind, text, circuit, valve direction) for a message row."""
    T = MSG_TEXT[lang or LANG]
    code, prio, on = r["event"], r["actor"], r["status"] == "1"
    text = T.get(code) or f"{T.get('_' + prio, prio)} {code}"
    if code in T:
        text = f"{code} {text}"
    if not on:
        return "info", f"{text} ({T['_cleared']})", None, None
    if prio in IMPORTANT_PRIOS:
        return "other", text, None, None  # faults and service messages are reported
    k, circ, o = MSG_KIND.get(code, ("info", None, None))
    return k, text, circ, o


def classify(r):
    """(kind, reason key or raw event, circuit key or raw, on) for a row."""
    if is_msg(r):
        k, text, circ, o = msg_interpret(r)
        return (k, None, circ, o)
    a, st, ev = r["actor"], r["status"], r["event"]
    valve = "VENTIL" in a.upper() or "UMSCHALT" in a.upper()
    ons = ON if valve else ("100",)  # the valve reports 1/0, others 100/0
    reason = REASONS.get(ev, ev)
    circ = CIRCUIT_KEYS.get(r["circuit"], r["circuit"])
    if a.startswith("VERDICHTER") and st.isdigit() and 0 < int(st) < 100:
        # 99 is seen when the compressor restarts right after the 10-min pause that follows a hot water run
        return ("start", reason, circ, True)
    if st not in ons + OFF:
        return ("other", reason, circ, None)
    on = st in ons
    if a.startswith("VERDICHTER"):
        return ("start" if on else "stop", reason, circ, on)
    if a.startswith("PRIMAERQUELLE"):
        return ("prep" if on else "info", reason, circ, on)
    if valve:
        return ("valve", reason, None, on)
    return ("other", reason, circ, None)


def interpret(r, lang=None):
    """(kind, text) for a row; kind is prep/start/stop/valve/defrost/info/other."""
    if is_msg(r):
        k, text, _, _ = msg_interpret(r, lang)
        return k, text
    T = TEXT[lang or LANG]
    k, reason, circ, on = classify(r)
    if k == "other":
        name = T["names"].get(r["actor"], r["actor"])
        return k, f"{name}: {r['event']} ({r['status']}/{r['info']})"
    base = T["valve_on" if on else "valve_off"] if k == "valve" else T[k]
    parts = [T.get(reason, reason)] + ([T.get(circ, circ)] if circ else [])
    return k, f"{base} ({', '.join(parts)})"


CARD_DAYS = 8     # days of events for the card timeline
CARD_MAX = 100    # and max number of them (keeps attributes below 16 kB)


def read_token():
    path = os.path.join(CFG, ".storage", "core.config_entries")
    with open(path, encoding="utf-8") as f:
        entries = json.load(f)["data"]["entries"]
    vicare = [e for e in entries if e.get("domain") == "vicare"]
    if not vicare:
        raise RuntimeError("ViCare integration not found")
    tok = vicare[0].get("data", {}).get("token", {})
    if not tok.get("access_token"):
        raise RuntimeError("ViCare integration has no token")
    if tok.get("expires_at", 0) - time.time() < 30:
        raise RuntimeError("token expired, retrying on the next run")
    return tok["access_token"]


def get(path, token, params=None):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"API error {e.code}: {e.read().decode('utf-8', 'replace')[:120]}")


def device_ids(token):
    """Installation id, gateway serial and device id, cached in a small file."""
    try:
        with open(IDS_FILE) as f:
            ids = json.load(f)
        if all(ids.get(k) is not None for k in ("installation", "gateway", "device")):
            return ids
    except (OSError, ValueError):
        pass
    data = get("/iot/v2/equipment/installations", token, {"includeGateways": "true"}).get("data", [])
    for ins in data:
        for gw in ins.get("gateways", []):
            devices = gw.get("devices", [])
            heat = [d for d in devices if d.get("deviceType") == "heating"]
            ids = {"installation": ins["id"], "gateway": gw["serial"],
                   "device": (heat[0]["id"] if heat else "0")}
            with open(IDS_FILE, "w") as f:
                json.dump(ids, f)
            return ids
    raise RuntimeError("no installation or gateway found")


def device_path(ids):
    return f"/iot/v2/features/installations/{ids['installation']}/gateways/{ids['gateway']}/devices/{ids['device']}/features"


def save_ids(ids):
    with open(IDS_FILE, "w") as f:
        json.dump(ids, f)


def fetch_rows(token):
    """New-format rows from the logbook, or from the active messages on units without one."""
    ids = device_ids(token)
    if ids.get("mode") == "logbook":  # once found, a failing call is an error, not a reason to switch
        feat = get(device_path(ids) + "/device.messages.logbook", token)
        feat = feat.get("data", feat)
        return [to_row(e) for e in feat.get("properties", {}).get("entries", {}).get("value") or []]
    if ids.get("mode") != "messages":
        try:
            feat = get(device_path(ids) + "/device.messages.logbook", token)
            feat = feat.get("data", feat)
            entries = feat.get("properties", {}).get("entries", {}).get("value")
            if entries is not None:
                if ids.get("mode") != "logbook":
                    save_ids({**ids, "mode": "logbook"})
                return [to_row(e) for e in entries]
        except RuntimeError as exc:
            if not str(exc).startswith(("API error 404", "API error 400")):
                raise
        save_ids({**ids, "mode": "messages"})
    return message_rows(get(device_path(ids), token).get("data", []))


def local_time(ts):
    """ISO UTC time stamp of a message -> local wall time of Home Assistant."""
    try:
        t = calendar.timegm(time.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError:
        return ts[:19].replace("T", " ")
    try:
        from zoneinfo import ZoneInfo
        from datetime import datetime, timezone
        with open(os.path.join(CFG, ".storage", "core.config"), encoding="utf-8") as f:
            tz = json.load(f)["data"]["time_zone"]
        return datetime.fromtimestamp(t, timezone.utc).astimezone(ZoneInfo(tz)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t))


def msg_row(code, prio, t, on):
    r = {"time": t, "actor": prio, "event": code, "state_machine": "messages", "circuit": "", "status": "1" if on else "0", "info": ""}
    r["interpretation"] = interpret(r)[1]
    return r


def message_rows(features):
    """Rows for messages that appeared since the last run, and for errors and service messages that cleared."""
    active = {}
    for f in features:
        name = f.get("feature", "")
        if not (name.startswith("device.messages.") and name.endswith(".raw")):
            continue
        for e in (f.get("properties", {}).get("entries", {}).get("value") or []):
            code = e.get("errorCode") or e.get("code")
            if not code:
                continue
            prio = e.get("priority") or name.split(".")[2]
            ts = e.get("timestamp") or ""
            active[f"{code}|{ts}"] = [code, prio, ts]
    try:
        with open(MSG_FILE) as fh:
            prev = json.load(fh)
    except (OSError, ValueError):
        prev = {}
    rows = [msg_row(code, prio, local_time(ts), True) for k, (code, prio, ts) in active.items() if k not in prev]
    now = local_time(time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()))
    rows += [msg_row(code, prio, now, False) for k, (code, prio, ts) in prev.items() if k not in active and prio in IMPORTANT_PRIOS]
    with open(MSG_FILE, "w") as fh:
        json.dump(active, fh)
    return rows


def to_row(e):
    # The API marks times as UTC (Z), but they are the unit's local time.
    t = (e.get("timestamp") or "")[:19].replace("T", " ")
    r = {
        "time": t,
        "actor": e.get("actor", ""),
        "event": e.get("event", ""),
        "state_machine": e.get("stateMachine", ""),
        "circuit": e.get("circuit", ""),
        "status": str(e.get("status", "")),
        "info": str(e.get("additionalInfo", "")),
    }
    r["interpretation"] = interpret(r)[1]
    return r


def kind(r):
    return interpret(r)[0]


def card_events(rows):
    """Compact list for the card's timeline: t = device local time, k = kind."""
    since = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - CARD_DAYS * 86400))
    out = []
    for r in rows[-CARD_MAX:]:
        if r["time"] < since:
            continue
        k, reason, circ, on = classify(r)
        if is_msg(r):
            # messages carry their text; the card shows x for them
            e = {"t": r["time"].replace(" ", "T"), "k": k, "x": interpret(r)[1]}
            if k == "valve":
                e["o"] = on
            out.append(e)
            continue
        # The card translates the texts itself: r = reason, c = circuit, o = valve direction.
        e = {"t": r["time"].replace(" ", "T"), "k": k, "r": reason}
        if circ:
            e["c"] = circ
        if k == "valve":
            e["o"] = 1 if on else 0
        if k == "other":
            e["x"] = interpret(r)[1]
        out.append(e)
    return out


def key(r):
    return "|".join(str(r.get(f, "")) for f in FIELDS[:7])


OLD_FIELDS = {"aika": "time", "komponentti": "actor", "tapahtuma": "event", "tilakone": "state_machine",
              "piiri": "circuit", "tila": "status", "lisatieto": "info", "tulkinta": "interpretation"}


def load_csv():
    if not os.path.exists(CSV_FILE):
        return []
    with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    if rows and "aika" in rows[0]:  # file from an earlier (Finnish) version: rewrite with English columns
        rows = [{OLD_FIELDS.get(k, k): v for k, v in r.items()} for r in rows]
        for r in rows:
            r.setdefault("state_machine", "")
            r["interpretation"] = interpret(r)[1]
        with open(CSV_FILE, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS, delimiter=";", extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
    return rows


def append_csv(rows):
    new_file = not os.path.exists(CSV_FILE)
    # utf-8-sig so that Excel shows non-ASCII characters correctly
    with open(CSV_FILE, "a", newline="", encoding="utf-8-sig" if new_file else "utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, delimiter=";", extrasaction="ignore")
        if new_file:
            w.writeheader()
        w.writerows(rows)


def short_time(t):
    # "2026-10-18 00:18:47" -> "18.10. 00:18:47"
    try:
        return f"{int(t[8:10])}.{int(t[5:7])}. {t[11:19]}"
    except ValueError:
        return t


def describe(r):
    what = interpret(r)[1]
    return f"{short_time(r['time'])} {what}"


def main():
    out = {"new": 0, "error": None, "unknown": []}
    try:
        rows_now = fetch_rows(read_token())
        known = {key(r) for r in load_csv()}
        new = sorted((r for r in rows_now if key(r) not in known), key=lambda r: r["time"])
        if new:
            append_csv(new)
        out["new"] = len(new)
        # New entries without an interpretation: possibly a fault or another unusual event.
        out["unknown"] = [describe(r) for r in new if kind(r) == "other"]
    except Exception as exc:  # the sensor still shows the stored history
        out["error"] = str(exc)[:200]
    rows = sorted(load_csv(), key=lambda r: r["time"])
    last = rows[-SHOW:][::-1]
    out["state"] = describe(last[0])[:250] if last else TEXT[LANG]["none"]
    out["latest_time"] = last[0]["time"] if last else None
    out["rows"] = [describe(r) for r in last]
    out["events"] = card_events(rows)
    out["total"] = len(rows)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
