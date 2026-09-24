"""The only place that knows how to initialize a model provider."""

import os

from langchain_core.language_models.chat_models import BaseChatModel


def create_chat_model(provider: str, model: str) -> BaseChatModel:
    provider = provider.lower().strip()
    if provider == "openrouter":
        if not os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY", "").startswith("replace-"):
            raise ValueError("OPENROUTER_API_KEY is not configured")
        from langchain_openrouter import ChatOpenRouter

        return ChatOpenRouter(model=model, max_retries=1)

    if provider == "fireworks":
        if not os.getenv("FIREWORKS_API_KEY") or os.getenv("FIREWORKS_API_KEY", "").startswith("replace-"):
            raise ValueError("FIREWORKS_API_KEY is not configured")
        try:
            from langchain_fireworks import ChatFireworks
        except ImportError as exc:
            raise RuntimeError("Install convia-trippy-service[fireworks] to use Fireworks") from exc

        return ChatFireworks(model=model, max_retries=1)

    raise ValueError(f"Unsupported Trippy provider: {provider}")
