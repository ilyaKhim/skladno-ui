package ru.godeck.presentation.chat.dto;

import ru.godeck.presentation.dto.PresentationView;

public record ChatReply(int version, String reply, PresentationView presentation) {}
