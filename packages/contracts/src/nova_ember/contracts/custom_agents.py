"""Browser-owned guidance, bounded independently of scientific policy."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AgentCapability = Literal[
    "sources", "analysis", "visualization", "modeling", "code", "workspace", "export"
]


class AgentSkill(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str = Field(min_length=1, max_length=80)
    instructions: str = Field(min_length=1, max_length=4000)

    @field_validator("name", "instructions", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("name")
    @classmethod
    def single_line_name(cls, value):
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise ValueError("Use a single-line skill name without control characters.")
        return value


class CustomAgentProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    instructions: str = Field(min_length=1, max_length=6000)
    skills: tuple[AgentSkill, ...] = Field(default=(), max_length=8)
    capabilities: tuple[AgentCapability, ...] = Field(min_length=1, max_length=7)

    @field_validator("name", "description", "instructions", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("name")
    @classmethod
    def single_line_name(cls, value):
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise ValueError("Use a single-line agent name without control characters.")
        return value

    @model_validator(mode="after")
    def unique_bounded_guidance(self):
        if len(set(self.capabilities)) != len(self.capabilities):
            raise ValueError("Agent capabilities must be distinct.")
        names = [skill.name.casefold() for skill in self.skills]
        if len(set(names)) != len(names):
            raise ValueError("Skill names must be distinct within a profile.")
        if len(self.instructions) + sum(len(skill.instructions) for skill in self.skills) > 16000:
            raise ValueError("Combined role and skill instructions exceed 16000 characters.")
        return self


class AgentDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(min_length=1, max_length=4000)
    kind: Literal["profile", "skill"] = "profile"

    @field_validator("description", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class AgentDraftResponse(BaseModel):
    schema_version: Literal[1] = 1
    status: Literal["draft"] = "draft"
    kind: Literal["profile", "skill"]
    profile: CustomAgentProfile | None = None
    skill: AgentSkill | None = None
    model: str
    prompt_version: str
    cost_usd: str
    provider_calls: list[dict]
    limitations: list[str]
