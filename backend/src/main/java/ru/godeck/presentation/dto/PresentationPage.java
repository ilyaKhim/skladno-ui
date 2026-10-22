package ru.godeck.presentation.dto;

import java.util.List;

public record PresentationPage(List<PresentationView> items, long total, int limit, int offset) {}
