package ru.godeck.auth;

import java.io.Serializable;
import java.util.UUID;

public record AuthPrincipal(UUID id, String email, int credentialsVersion)
        implements Serializable {}
