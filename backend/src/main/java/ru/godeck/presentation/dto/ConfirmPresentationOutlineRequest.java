package ru.godeck.presentation.dto;

/** The exact saved revision to freeze; confirming does not advance the outline revision. */
public record ConfirmPresentationOutlineRequest(long revision) {}
