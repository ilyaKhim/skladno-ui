package ru.godeck.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import ru.godeck.presentation.policy.PresentationPolicy;

public record EditPresentationRequest(
        @NotBlank @Size(max = PresentationPolicy.MAX_EDIT_MESSAGE_LENGTH) String message,
        String model) {}
