"""Small, stateless LangChain agent used by an authenticated application caller."""

from dataclasses import dataclass
from typing import Literal

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.tools import BaseTool
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .providers import create_chat_model


class ChatMessage(BaseModel):
    """One already-fetched group message, in chronological order."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)
    sender_name: str | None = Field(default=None, max_length=80)


class AgentRunRequest(BaseModel):
    """Untrusted conversational input; the @trippy mention is already removed."""

    query: str = Field(min_length=1, max_length=4000)
    context: list[ChatMessage] = Field(default_factory=list)

    @field_validator("query")
    @classmethod
    def non_empty_query(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query must not be blank")
        return value


@dataclass(frozen=True)
class AgentRuntimeContext:
    """Set by the authenticated backend, never by the model or chat text."""

    trip_id: str | None = None
    user_id: str | None = None


class TrippyAgent(BaseModel):
    """A tool-calling agent; no chat fetching, memory, or itinerary writes here."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    provider: str
    model: str
    base_prompt: str
    tools: list[BaseTool] = Field(default_factory=list)

    def run(
        self,
        request: AgentRunRequest,
        *,
        runtime_context: AgentRuntimeContext | None = None,
    ) -> str:
        """Run one bounded model/tool loop and return its final text response."""

        messages: list[BaseMessage] = []
        for item in request.context[-15:]:
            if item.role == "assistant":
                messages.append(AIMessage(content=item.content))
            else:
                # A name stays within user content; no chat message can become a system prompt.
                prefix = f"{item.sender_name}: " if item.sender_name else ""
                messages.append(HumanMessage(content=f"{prefix}{item.content}"))
        messages.append(HumanMessage(content=request.query))

        agent = create_agent(
            model=create_chat_model(self.provider, self.model),
            tools=self.tools,
            system_prompt=self.base_prompt,
            context_schema=AgentRuntimeContext,
        )
        result = agent.invoke(
            {"messages": messages},
            context=runtime_context or AgentRuntimeContext(),
            config={"recursion_limit": 20},
        )
        final = result["messages"][-1]
        if not isinstance(final, AIMessage) or final.tool_calls:
            raise RuntimeError("Trippy did not return a final answer")
        if isinstance(final.content, str):
            answer = final.content.strip()
        else:
            answer = "\n".join(
                block["text"] for block in final.content
                if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str)
            ).strip()
        if not answer:
            raise RuntimeError("Trippy returned an empty answer")
        return answer
