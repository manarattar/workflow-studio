"""List prices in USD per million tokens, used to show what each run costs."""

LLM_INPUT_PER_M = 0.15  # gpt-4o-mini
LLM_OUTPUT_PER_M = 0.60
JEV_INPUT_PER_M = 0.042  # Jev bills input only; output is free


def llm_cost(input_tokens: int, output_tokens: int) -> float:
    return (
        input_tokens * LLM_INPUT_PER_M + output_tokens * LLM_OUTPUT_PER_M
    ) / 1_000_000


def jev_cost(input_tokens: int) -> float:
    return input_tokens * JEV_INPUT_PER_M / 1_000_000
