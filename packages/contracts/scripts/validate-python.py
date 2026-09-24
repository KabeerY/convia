"""Validate the same fixtures through the installed Python contract package."""

import json
from pathlib import Path

from jsonschema import ValidationError

from convia_contracts import validate_contract


fixtures = Path(__file__).resolve().parent.parent / "fixtures"
count = 0
for path in sorted(fixtures.glob("*.json")):
    fixture = json.loads(path.read_text())
    try:
        validate_contract(fixture["schema"], fixture["payload"])
        actual = True
    except ValidationError:
        actual = False
    if actual != fixture["valid"]:
        raise AssertionError(f"{path.name}: expected valid={fixture['valid']}, got {actual}")
    count += 1

print(f"Validated {count} shared contract fixtures in Python")
