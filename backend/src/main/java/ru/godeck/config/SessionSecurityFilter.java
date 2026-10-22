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

// Added only to the security chain: making it a servlet component would register it twice.
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

    private void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter()
                .write("{\"ok\":false,\"error\":\"" + AuthError.RATE_LIMITED.code() + "\"}");
    }

    private record Window(Instant end, int count) {}
}
