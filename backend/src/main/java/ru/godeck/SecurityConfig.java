package ru.godeck;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class SecurityConfig {
    @Bean Clock clock() { return Clock.systemUTC(); }
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    SecurityFilterChain security(HttpSecurity http, AuthService service, Clock clock) throws Exception {
        return http
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .securityContext(c -> c.securityContextRepository(new HttpSessionSecurityContextRepository()))
                // Default session-backed CSRF protection also covers anonymous registration and login.
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/auth/me").authenticated()
                        .requestMatchers("/api/auth/**", "/error").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> jsonError(res, 401, "invalid-credentials"))
                        .accessDeniedHandler((req, res, ex) -> jsonError(res, 403, "invalid-input")))
                .addFilterBefore(new OncePerRequestFilter() {
                    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
                    @Override
                    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                            throws ServletException, IOException {
                        var auth = SecurityContextHolder.getContext().getAuthentication();
                        if (auth != null && auth.getPrincipal() instanceof AuthPrincipal user && !service.sessionValid(user)) {
                            if (req.getSession(false) != null) req.getSession(false).invalidate();
                            SecurityContextHolder.clearContext();
                        }
                        if (req.getMethod().equals("POST") && req.getRequestURI().startsWith("/api/auth/")) {
                            Instant now = clock.instant();
                            if (windows.size() >= 10_000) windows.entrySet().removeIf(e -> !e.getValue().end.isAfter(now));
                            String key = req.getRemoteAddr(); // Never trust a client-supplied X-Forwarded-For.
                            if (!windows.containsKey(key) && windows.size() >= 10_000) {
                                jsonError(res, 429, "rate-limited");
                                return;
                            }
                            Window window = windows.compute(key, (k, old) -> old == null || !old.end.isAfter(now)
                                    ? new Window(now.plus(Duration.ofMinutes(15)), 1) : new Window(old.end, old.count + 1));
                            if (window.count > 100) {
                                res.setHeader("Retry-After", Long.toString(Math.max(1, Duration.between(now, window.end).toSeconds())));
                                jsonError(res, 429, "rate-limited");
                                return;
                            }
                        }
                        chain.doFilter(req, res);
                    }
                }, AuthorizationFilter.class)
                .build();
    }

    private record Window(Instant end, int count) {}

    private static void jsonError(HttpServletResponse response, int status, String code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"ok\":false,\"error\":\"" + code + "\"}");
    }
}
