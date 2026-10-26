package ru.godeck.presentation.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record EditorDraftSavedView(int baseVersion, long draftRevision, long savedAt) {}
