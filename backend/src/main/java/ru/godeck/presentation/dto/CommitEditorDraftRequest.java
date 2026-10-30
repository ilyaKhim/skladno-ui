package ru.godeck.presentation.dto;

import jakarta.validation.constraints.Min;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record CommitEditorDraftRequest(@Min(0) int baseVersion, @Min(1) long draftRevision) {}
