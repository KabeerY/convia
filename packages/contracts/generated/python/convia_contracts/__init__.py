"""Convia transport schema and generated Python types."""

from importlib.resources import files
import json

from jsonschema import Draft202012Validator


def validate_contract(name: str, payload: object) -> None:
    """Raise jsonschema.ValidationError for an invalid shared payload."""
    schema = json.loads(files(__package__).joinpath("schema.json").read_text())
    if name not in schema["$defs"]:
        raise ValueError(f"Unknown contract: {name}")
    Draft202012Validator({"$ref": f"#/$defs/{name}", "$defs": schema["$defs"]}).validate(payload)
