package ru.godeck.presentation.aiedit.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** How many variants a request may ask for: {@code {"default": 1, "max": 3}}. */
public record AiVariantsView(@JsonProperty("default") int defaultCount, int max) {}
