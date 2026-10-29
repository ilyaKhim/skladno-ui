package ru.godeck.presentation.aiedit.dto;

import ru.godeck.presentation.aiedit.action.ActionUi;
import ru.godeck.presentation.aiedit.core.TargetKind;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiActionView(
        String id,
        String label,
        String description,
        ActionUi ui,
        List<TargetKind> targets,
        List<AiActionParamView> params) {}
