package ru.godeck;

import java.io.Serializable;
import java.util.UUID;

record AuthPrincipal(UUID id, String email, int credentialsVersion) implements Serializable {}
