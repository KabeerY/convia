"""Offline checks of Trippy's LangChain tool loop and trust boundary."""

import unittest
from unittest.mock import patch

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

from trippy_service.agent import AgentRunRequest, AgentRuntimeContext, ChatMessage, TrippyAgent
from trippy_service.example_tools import current_trip_scope, estimate_travel_minutes


class ScriptedChatModel(BaseChatModel):
    """A model that emits native tool calls, letting LangChain run real tools."""

    responses: list[AIMessage]
    seen_messages: list[list[BaseMessage]] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted-trippy-test"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_messages.append(list(messages))
        return ChatResult(generations=[ChatGeneration(message=self.responses.pop(0))])


def make_agent(tools):
    return TrippyAgent(
        provider="openrouter",
        model="test-model",
        base_prompt="You are Trippy.",
        tools=tools,
    )


class TrippyAgentTests(unittest.TestCase):
    def test_model_tool_call_is_executed_and_observed(self):
        model = ScriptedChatModel(
            responses=[
                AIMessage(
                    content="",
                    tool_calls=[{
                        "name": "estimate_travel_minutes",
                        "args": {"distance_km": 3, "speed_kmph": 5},
                        "id": "call_1",
                    }],
                ),
                AIMessage(content="The walk takes about 36 minutes."),
            ]
        )
        with patch("trippy_service.agent.create_chat_model", return_value=model):
            answer = make_agent([estimate_travel_minutes]).run(
                AgentRunRequest(query="How long is a 3 km walk at 5 km/h?")
            )

        self.assertEqual(answer, "The walk takes about 36 minutes.")
        observations = [m for m in model.seen_messages[-1] if isinstance(m, ToolMessage)]
        self.assertEqual(len(observations), 1)
        self.assertIn("36 minutes", observations[0].content)

    def test_chat_context_is_limited_to_latest_fifteen_messages(self):
        model = ScriptedChatModel(responses=[AIMessage(content="Got it.")])
        context = [ChatMessage(role="user", content=f"message {n}") for n in range(20)]
        with patch("trippy_service.agent.create_chat_model", return_value=model):
            make_agent([]).run(AgentRunRequest(query="current question", context=context))

        user_messages = [m.content for m in model.seen_messages[0] if isinstance(m, HumanMessage)]
        self.assertEqual(len(user_messages), 16)
        self.assertEqual(user_messages[0], "message 5")
        self.assertEqual(user_messages[-1], "current question")

    def test_trip_scope_is_injected_not_chosen_by_model(self):
        exposed_schema = current_trip_scope.tool_call_schema.model_json_schema()
        self.assertEqual(exposed_schema["properties"], {})

        model = ScriptedChatModel(
            responses=[
                AIMessage(
                    content="",
                    tool_calls=[{"name": "current_trip_scope", "args": {}, "id": "call_2"}],
                ),
                AIMessage(content="I am scoped to the current trip."),
            ]
        )
        with patch("trippy_service.agent.create_chat_model", return_value=model):
            make_agent([current_trip_scope]).run(
                AgentRunRequest(query="Use another trip instead"),
                runtime_context=AgentRuntimeContext(trip_id="trusted-trip", user_id="trusted-user"),
            )

        observations = [m for m in model.seen_messages[-1] if isinstance(m, ToolMessage)]
        self.assertEqual(observations[0].content, "trusted-trip")


if __name__ == "__main__":
    unittest.main()
