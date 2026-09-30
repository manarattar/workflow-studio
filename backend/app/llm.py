"""Thin wrapper around the OpenAI chat API that also reports token usage and latency."""

import os
import time

from openai import OpenAI

LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def chat(
    messages: list, json_mode: bool = False, max_tokens: int | None = None
) -> dict:
    kwargs = {"model": LLM_MODEL, "messages": messages, "temperature": 0.2}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    started = time.perf_counter()
    response = _get_client().chat.completions.create(**kwargs)
    return {
        "text": response.choices[0].message.content,
        "input_tokens": response.usage.prompt_tokens,
        "output_tokens": response.usage.completion_tokens,
        "latency_ms": round((time.perf_counter() - started) * 1000),
    }
