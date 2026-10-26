package ru.godeck.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import ru.godeck.auth.exception.AuthError;
import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.auth.service.AuthService;
import ru.godeck.common.security.SecurityPolicy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-request session revocation and coarse IP rate-limit filter for authentication endpoints.
 *
 * <p>The filter is instantiated only by {@link SecurityConfig}; registering it as a servlet
 * component would execute it twice. In normal mode it invalidates sessions whose credential version
 * became stale after a password reset. The development bypass installs a fixed local principal and
 * is permitted only on a loopback-bound server.
 */
final class SessionSecurityFilter extends OncePerRequestFilter {
    private static final AuthPrincipal DEBUG_PRINCIPAL =
            new AuthPrincipal(
                    UUID.nameUUIDFromBytes(
                            "godeck-local-debug-user".getBytes(StandardCharsets.UTF_8)),
                    "debug@godeck.local",
                    0);
    private final AuthService service;
    private final Clock clock;
    private final boolean devBypass;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    SessionSecurityFilter(AuthService service, Clock clock, boolean devBypass) {
        this.service = service;
        this.clock = clock;
        this.devBypass = devBypass;
    }

    /**
     * Refreshes authentication validity, rate-limits auth POST requests, and then continues the
     * security chain. Rate limiting occurs before controller work and never trusts forwarded IP
     * headers supplied by a client.
     */
    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (devBypass) {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            UsernamePasswordAuthenticationToken.authenticated(
                                    DEBUG_PRINCIPAL,
                                    null,
                                    AuthorityUtils.createAuthorityList(
                                            SecurityPolicy.USER_AUTHORITY)));
        } else {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null
                    && auth.getPrincipal() instanceof AuthPrincipal user
                    && !service.sessionValid(user)) {
                if (request.getSession(false) != null) request.getSession(false).invalidate();
                SecurityContextHolder.clearContext();
            }
        }
        if (request.getMethod().equals("POST")
                && request.getRequestURI().startsWith("/api/auth/")
                && rateLimited(request, response)) return;
        chain.doFilter(request, response);
    }

    /** Maintains a bounded in-memory fixed window per directly connected remote address. */
    private boolean rateLimited(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        Instant now = clock.instant();
        if (windows.size() >= SecurityPolicy.MAX_TRACKED_IP_ADDRESSES)
            windows.entrySet().removeIf(e -> !e.getValue().end().isAfter(now));
        String key = request.getRemoteAddr(); // Never trust a client-supplied X-Forwarded-For.
        if (!windows.containsKey(key)
                && windows.size() >= SecurityPolicy.MAX_TRACKED_IP_ADDRESSES) {
            reject(response);
            return true;
        }
        Window window =
                windows.compute(
                        key,
                        (k, old) ->
                                old == null || !old.end().isAfter(now)
                                        ? new Window(
                                                now.plus(SecurityPolicy.AUTH_REQUEST_WINDOW), 1)
                                        : new Window(old.end(), old.count() + 1));
        if (window.count() > SecurityPolicy.MAX_AUTH_REQUESTS_PER_WINDOW) {
            response.setHeader(
                    "Retry-After",
                    Long.toString(Math.max(1, Duration.between(now, window.end()).toSeconds())));
            reject(response);
            return true;
        }
        return false;
    }

    /** Writes the small stable JSON rejection used before MVC exception handling is available. */
    private void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter()
                .write("{\"ok\":false,\"error\":\"" + AuthError.RATE_LIMITED.code() + "\"}");
    }

    private record Window(Instant end, int count) {}
}
