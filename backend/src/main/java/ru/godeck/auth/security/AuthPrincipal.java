package ru.godeck.auth.security;

import java.io.Serializable;
import java.util.UUID;

public record AuthPrincipal(UUID id, String email, int credentialsVersion)
        implements Serializable {}
