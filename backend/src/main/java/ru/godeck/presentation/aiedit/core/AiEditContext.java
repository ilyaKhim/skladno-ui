package ru.godeck.presentation.aiedit.core;

import java.util.UUID;

/**
 * Who asks for an action and where, for {@code TextEditAction.available}: feature flags, plans or
 * template-specific actions.
 *
 * @param userId authenticated user
 * @param templateId template of the edited presentation, or {@code null} when listing the catalog
 */
public record AiEditContext(UUID userId, String templateId) {}
