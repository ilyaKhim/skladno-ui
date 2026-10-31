package ru.godeck.presentation.editor.dto;

import jakarta.validation.constraints.Min;

import tools.jackson.databind.annotation.JsonNaming;
import tools.jackson.databind.PropertyNamingStrategies;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record CommitEditorDraftRequest(@Min(0) int baseVersion, @Min(1) long draftRevision) {}
